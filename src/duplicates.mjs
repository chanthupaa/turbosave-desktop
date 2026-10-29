// SPDX-License-Identifier: GPL-3.0-only
// All signatures stay on this PC. No media or fingerprints are uploaded.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile,writeFile,rename,lstat,readdir } from 'node:fs/promises';

const videoExt=new Set(['mp4','webm','mkv','mov','m4v','avi']);
const audioExt=new Set(['mp3','m4a','aac','wav','flac','opus','ogg']);
const imageExt=new Set(['jpg','jpeg','png','webp']);
const folderKey=value=>path.resolve(value).toLowerCase();
const sha=value=>createHash('sha256').update(value).digest('hex');
export function sourceKeys(info={},source=''){
  const keys=new Set();
  for(const value of [source,info.webpage_url,info.original_url]){
    try{
      const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');let id;
      if(host==='youtu.be')id=url.pathname.split('/')[1];
      else if(host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtube-nocookie.com')id=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
      if(id&&/^[\w-]{11}$/.test(id))keys.add(`youtube:${id}`);
      if(host==='instagram.com'||host.endsWith('.instagram.com')){const id=url.pathname.match(/^\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1];if(id)keys.add(`instagram:${id}`);}
      if(host==='tiktok.com'||host.endsWith('.tiktok.com')){const id=url.pathname.match(/\/(?:video|photo)\/(\d+)/)?.[1];if(id)keys.add(`tiktok:${id}`);}
      if(host==='vimeo.com'||host.endsWith('.vimeo.com')){const id=url.pathname.match(/\/(\d+)(?:\/|$)/)?.[1];if(id)keys.add(`vimeo:${id}`);}
    }catch{}
  }
  const extractor=String(info.extractor_key||info.extractor||'').split(':')[0].toLowerCase();
  if(extractor&&extractor!=='generic'&&/^[\w.-]{1,80}$/.test(extractor)&&typeof info.id==='string'&&info.id.length<=200)keys.add(`${extractor}:${info.id}`);
  try{const url=new URL(source);url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:si|fbclid|gclid)$/i.test(key))url.searchParams.delete(key);url.searchParams.sort();keys.add(`urlhash:${sha(url.href)}`);}catch{}
  return [...keys];
}
export async function fileHash(file,cancelled=()=>false){
  const hash=createHash('sha256');for await(const chunk of createReadStream(file)){if(cancelled())throw new Error('Cancelled.');hash.update(chunk);}return hash.digest('hex');
}
export function frameHash(bytes){
  if(bytes.length!==72)throw new Error('Invalid video sample.');let bits=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|(bytes[y*9+x]>bytes[y*9+x+1]?1n:0n);
  const mean=bytes.reduce((sum,v)=>sum+v,0)/bytes.length;
  const detail=Math.sqrt(bytes.reduce((sum,v)=>sum+(v-mean)**2,0)/bytes.length);
  return {hash:bits.toString(16).padStart(16,'0'),detail:Math.round(detail*100)/100};
}
function distance(a,b){let bits=BigInt(`0x${a}`)^BigInt(`0x${b}`),count=0;while(bits){bits&=bits-1n;count++;}return count;}
export function sameVideo(a,b){
  if(!a||!b||a.version!==1||b.version!==1||!Number.isFinite(a.duration)||!Number.isFinite(b.duration)||Math.abs(a.duration-b.duration)>Math.max(.35,Math.min(2,a.duration*.005)))return false;
  if(a.frames?.length!==5||b.frames?.length!==5)return false;
  const pairs=a.frames.map((frame,i)=>[frame,b.frames[i]]).filter(pair=>pair.every(f=>f&&f.detail>7&&/^[0-9a-f]{16}$/.test(f.hash)&&distance(f.hash,'0000000000000000')>=4&&distance(f.hash,'ffffffffffffffff')>=4));
  if(pairs.length<3||new Set(pairs.map(p=>p[0].hash)).size<3||new Set(pairs.map(p=>p[1].hash)).size<3)return false;
  const distances=pairs.map(([a,b])=>distance(a.hash,b.hash));
  return Math.max(...distances)<=8&&distances.reduce((a,b)=>a+b,0)/distances.length<=4;
}
function category(file){const ext=path.extname(file).slice(1).toLowerCase();return videoExt.has(ext)?'video':audioExt.has(ext)?'audio':imageExt.has(ext)?'image':null;}
export class DuplicateLibrary{
  constructor({stateDir,run,runBytes,tool}){this.file=path.join(stateDir,'media-library.json');this.run=run;this.runBytes=runBytes;this.tool=tool;this.entries=[];this.pending=Promise.resolve();}
  async load(){try{const data=JSON.parse(await readFile(this.file,'utf8'));if(data.version===1)this.entries=data.entries.filter(e=>e&&typeof e.path==='string'&&path.isAbsolute(e.path)&&(e.sha256===null||/^[a-f0-9]{64}$/.test(e.sha256))&&Array.isArray(e.keys)).slice(-3000);}catch{}}
  save(){const text=JSON.stringify({version:1,entries:this.entries.slice(-3000)});this.pending=this.pending.catch(()=>{}).then(async()=>{await writeFile(`${this.file}.tmp`,text,{mode:0o600});await rename(`${this.file}.tmp`,this.file);});return this.pending;}
  async regular(file){const s=await lstat(file).catch(()=>null);return s?.isFile()&&!s.isSymbolicLink()?s:null;}
  async known(keys,folder,kind){
    const matches=[];
    for(const entry of this.entries){
      if(folderKey(path.dirname(entry.path))!==folderKey(folder)||(kind&&entry.kind!==kind)||!entry.keys.some(k=>keys.includes(k)))continue;
      const details=await this.regular(entry.path);if(!details)continue;
      if(details.size!==entry.size||details.mtimeMs!==entry.mtimeMs){if(await fileHash(entry.path)!==entry.sha256)continue;entry.size=details.size;entry.mtimeMs=details.mtimeMs;}
      matches.push(this.publicMatch(entry,'source'));
    }return matches.slice(0,10);
  }
  publicMatch(entry,reason){return {path:entry.path,directory:path.dirname(entry.path),name:path.basename(entry.path),kind:entry.kind,size:entry.size,mtimeMs:entry.mtimeMs,quality:entry.quality||'Existing file',reason,message:reason==='visual'?'This looks like the same video, based on its duration and several frames.':reason==='exact'?'An identical file is already in this folder.':'This source media is already saved in this folder.'};}
  async signature(file,cancelled=()=>false,onSpawn,expectedDuration){
    const options={timeout:25_000,onSpawn};
    const probe=JSON.parse(await this.run(this.tool('ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration:stream=codec_type','-of','json',file],options));
    const duration=Number(probe.format?.duration);if(!(duration>0)||!probe.streams?.some(s=>s.codec_type==='video'))return null;
    if(expectedDuration&&Math.abs(duration-expectedDuration)>Math.max(.35,Math.min(2,expectedDuration*.005)))return {version:1,duration,frames:[]};
    const frames=[];for(const part of [.1,.3,.5,.7,.9]){if(cancelled())throw new Error('Cancelled.');
      const bytes=await this.runBytes(this.tool('ffmpeg'),['-v','error','-protocol_whitelist','file,pipe','-threads','2','-ss',String(duration*part),'-i',file,'-an','-sn','-frames:v','1','-vf','scale=9:8:flags=area,format=gray','-f','rawvideo','pipe:1'],options);
      frames.push(frameHash(bytes));
    }return {version:1,duration,frames};
  }
  async record(file,{keys=[],kind,quality,sha256,signature},cancelled=()=>false){
    const details=await this.regular(file);if(!details)throw new Error('The existing file was moved or removed.');
    sha256??=await fileHash(file,cancelled);
    const identical=this.entries.filter(e=>e.sha256===sha256&&e.kind===kind);const aliases=identical.flatMap(e=>e.keys);
    const entry={path:path.resolve(file),size:details.size,mtimeMs:details.mtimeMs,sha256,kind,quality,signature:signature||identical.find(e=>e.signature)?.signature||null,keys:[...new Set([...keys,...aliases])].slice(0,40)};
    this.entries=this.entries.filter(e=>folderKey(e.path)!==folderKey(file));this.entries.push(entry);this.entries=this.entries.slice(-3000);await this.save();return entry;
  }
  async compare(file,folder,kind,{cancelled=()=>false,onSpawn,onProgress=()=>{},skipExisting=false}={}){
    const sha256=await fileHash(file,cancelled);const incoming=await lstat(file);let signature=null;
    const files=(await readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&!e.isSymbolicLink()&&category(e.name)===kind).sort((a,b)=>a.name.localeCompare(b.name));
    const scan=skipExisting?[]:files.slice(0,200);let checked=0;
    for(const item of scan){if(cancelled())throw new Error('Cancelled.');const candidate=path.join(folder,item.name);if(folderKey(candidate)===folderKey(file))continue;
      const details=await this.regular(candidate);if(!details)continue;onProgress(++checked,scan.length,files.length>200);
      let entry=this.entries.find(e=>folderKey(e.path)===folderKey(candidate)&&e.size===details.size&&e.mtimeMs===details.mtimeMs);
      try{
        if(!entry){entry={path:candidate,kind,size:details.size,mtimeMs:details.mtimeMs,sha256:null,keys:[],signature:null,quality:'Existing file'};this.entries=this.entries.filter(e=>folderKey(e.path)!==folderKey(candidate));this.entries.push(entry);this.entries=this.entries.slice(-3000);}
        if(!entry.sha256&&details.size===incoming.size){entry.sha256=await fileHash(candidate,cancelled);entry.keys=[...new Set(this.entries.filter(e=>e!==entry&&e.sha256===entry.sha256).flatMap(e=>e.keys))];await this.save();}
        if(entry.sha256===sha256)return {match:this.publicMatch(entry,'exact'),sha256,signature,limited:files.length>200};
        if(kind==='video'){
          signature??=await this.signature(file,cancelled,onSpawn);
          if(!signature)continue;
          if(!entry.signature||(entry.signature.frames?.length!==5&&Math.abs(entry.signature.duration-signature.duration)<=Math.max(.35,Math.min(2,signature.duration*.005)))){entry.signature=await this.signature(candidate,cancelled,onSpawn,signature.duration);await this.save();}
          if(sameVideo(signature,entry.signature))return {match:this.publicMatch(entry,'visual'),sha256,signature,limited:files.length>200};
        }
      }catch(error){if(cancelled())throw error;/* An unreadable or damaged neighbouring file must not fail this download. */}
    }
    if(kind==='video'&&!signature){try{signature=await this.signature(file,cancelled,onSpawn);}catch(error){if(cancelled())throw error;}}
    return {match:null,sha256,signature,limited:files.length>200};
  }
}
