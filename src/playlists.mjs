// SPDX-License-Identifier: GPL-3.0-only
import {randomUUID} from 'node:crypto';
import {publicTarget} from './media.mjs';
export const PAGE_SIZE=100, PLAYLIST_LIMIT=1000;
export function playlistSource(value){
  const url=new URL(value);
  if(!['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)||url.protocol!=='https:'||url.username||url.password||url.port||!/^[-\w]{10,160}$/.test(url.searchParams.get('list')||''))throw Error('Paste a public YouTube playlist link.');
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(url.searchParams.get('list'))}`;
}
export function playlistFormat(formats,{kind,height}){
  if(kind==='audio')return formats.find(f=>f.mode==='mp3');
  return formats.filter(f=>f.kind==='video'&&f.sound==='with'&&(!height||f.height<=height)).sort((a,b)=>b.height-a.height||(a.extension==='mp4'?-1:1)-(b.extension==='mp4'?-1:1))[0];
}
export class PlaylistManager{
  constructor(engine){this.engine=engine;this.groups=[];this.previews=new Map();}
  restore(groups){const valid=Array.isArray(groups)?groups.filter(g=>g&&typeof g.id==='string'&&Array.isArray(g.entries)&&g.entries.length<=PLAYLIST_LIMIT&&['video','audio'].includes(g.preference?.kind)&&typeof g.directory==='string'):[];this.groups=[...valid.filter(g=>!['completed','cancelled'].includes(g.status)).slice(0,20),...valid.filter(g=>['completed','cancelled'].includes(g.status)).slice(0,20)].map(g=>({...g,status:['completed','cancelled'].includes(g.status)?g.status:'paused',entries:g.entries.map(e=>({...e}))}));}
  async inspect({source,id,offset=0}={}){
    const e=this.engine;if(!e.ready||e.maintenance||e.closing)throw Error('Wait for the local engines to be ready.');
    if(e.inspecting)throw Error('A link is already being checked.');
    if(!Number.isInteger(offset)||offset<0||offset%PAGE_SIZE||offset>=PLAYLIST_LIMIT)throw Error('Invalid playlist page.');
    const cached=id?this.previews.get(id):null;
    if(id&&!cached)throw Error('Load the playlist again; its preview expired.');
    const canonical=playlistSource(cached?.source||source);
    e.inspecting=true;
    try{
      await publicTarget(canonical);
      const raw=await e.run(e.tool('yt-dlp'),[...e.baseArgs().filter(a=>a!=='--no-playlist'),'--yes-playlist','--flat-playlist','--ignore-errors','--playlist-items',`${offset+1}:${Math.min(offset+PAGE_SIZE,PLAYLIST_LIMIT)}`,'--dump-single-json','--skip-download','--',canonical],{timeout:90_000});
      const info=JSON.parse(raw);if(!Array.isArray(info.entries))throw Error('The source did not return a playlist.');
      const preview=cached||{id:randomUUID(),source:canonical,title:String(info.title||'YouTube playlist').slice(0,220),entries:[],created:Date.now()};
      const rows=info.entries.slice(0,PAGE_SIZE).map((item,i)=>{
        const video=typeof item?.id==='string'&&/^[-\w]{11}$/.test(item.id)?item.id:null;
        const title=String(item?.title||'Unavailable video').replace(/[\x00-\x1f]/g,'').slice(0,220);
        const available=Boolean(video)&&!['private','premium_only','subscriber_only','needs_auth'].includes(item?.availability)&&!/^\[?(private|deleted) video\]?$/i.test(title);
        const reported=Number(item?.playlist_index),index=Number.isInteger(reported)&&reported>offset&&reported<=offset+PAGE_SIZE?reported:offset+i+1;
        return {key:String(index),index,title,duration:Number(item?.duration)||null,available,source:video?`https://www.youtube.com/watch?v=${video}`:null};
      });
      preview.entries=[...preview.entries.filter(row=>row.index<=offset||row.index>offset+PAGE_SIZE),...rows].sort((a,b)=>a.index-b.index);
      this.previews.set(preview.id,preview);for(const [key,p]of this.previews)if(Date.now()-p.created>30*60_000)this.previews.delete(key);
      while(this.previews.size>10)this.previews.delete(this.previews.keys().next().value);
      const total=Number(info.playlist_count||info.n_entries),more=rows.length===PAGE_SIZE||Number.isFinite(total)&&total>offset+PAGE_SIZE;
      return {id:preview.id,title:preview.title,source:canonical,entries:preview.entries.map(({source,...row})=>row),nextOffset:Math.min(offset+PAGE_SIZE,PLAYLIST_LIMIT),hasMore:more&&offset+PAGE_SIZE<PLAYLIST_LIMIT,limitReached:more&&offset+PAGE_SIZE>=PLAYLIST_LIMIT};
    }finally{e.inspecting=false;}
  }
  async start({id,keys,kind='video',height=1080,directory}={}){
    const e=this.engine,preview=this.previews.get(id);
    if(e.closing||e.maintenance||!e.ready)throw Error('Wait for the local engines to be ready.');
    if(!preview||Date.now()-preview.created>30*60_000)throw Error('Load the playlist again for a fresh selection.');
    if(!Array.isArray(keys)||!keys.length||keys.length>PLAYLIST_LIMIT||!['video','audio'].includes(kind)||![0,480,720,1080,1440,2160].includes(height))throw Error('Choose playlist entries and a valid quality target.');
    if(this.groups.filter(g=>!['completed','cancelled'].includes(g.status)).length>=20)throw Error('Finish or cancel an existing playlist first.');
    const selected=new Set(keys);if(selected.size!==keys.length||keys.some(key=>!preview.entries.some(row=>row.key===key)))throw Error('The playlist selection is invalid.');
    directory??=e.downloadsDir;await e.checkFolder(directory);
    const group={id:randomUUID(),title:preview.title,source:preview.source,directory,preference:{kind,height},status:'running',createdAt:Date.now(),entries:preview.entries.filter(row=>selected.has(row.key)).map(row=>({...row,status:row.available?'pending':'unavailable',error:row.available?null:'This entry is unavailable.'}))};
    this.groups.unshift(group);const live=this.groups.filter(g=>!['completed','cancelled'].includes(g.status));this.groups=[...live,...this.groups.filter(g=>!live.includes(g)).slice(0,20)];await e.save();e.changed();void e.pump();return group.id;
  }
  feed(){
    const e=this.engine;if(e.jobs.filter(j=>['draft','queued','paused','interrupted','refreshing','downloading','processing','duplicate'].includes(j.status)).length>=20)return;
    const group=[...this.groups].reverse().find(g=>g.status==='running'&&g.entries.some(row=>row.status==='pending'));if(!group)return;
    const entry=group.entries.find(row=>row.status==='pending');
    const job={id:randomUUID(),playlistGroup:group.id,playlistIndex:entry.index,source:entry.source,title:entry.title,platform:'YouTube',format:{kind:group.preference.kind,mode:'playlist',targetHeight:group.preference.height,extension:group.preference.kind==='audio'?'mp3':'mp4',sound:'with'},formatLabel:group.preference.kind==='audio'?'MP3':'Checking quality',directory:group.directory,queueOrder:e.nextOrder(),needsRefresh:true,status:'queued',createdAt:Date.now(),progress:0,elapsedMs:0};
    entry.status='queued';entry.jobId=job.id;e.jobs.unshift(job);
    const active=e.jobs.filter(j=>['draft','queued','paused','interrupted','refreshing','downloading','processing','duplicate'].includes(j.status));
    e.jobs=[...active,...e.jobs.filter(j=>!active.includes(j)).slice(0,Math.max(0,100-active.length))].sort((a,b)=>b.createdAt-a.createdAt);
  }
  sync(job){
    const group=this.groups.find(g=>g.id===job.playlistGroup),entry=group?.entries.find(row=>row.jobId===job.id);if(!entry)return;
    entry.status=job.status;entry.error=job.error||null;entry.filePath=job.filePath||null;entry.quality=job.formatLabel;
    if(group.entries.every(row=>['completed','skipped','failed','cancelled','unavailable'].includes(row.status))&&group.status!=='cancelled')group.status='completed';
  }
  async control(id,action){
    const e=this.engine,group=this.groups.find(g=>g.id===id);if(!group||!['pause','resume','cancel'].includes(action))throw Error('Invalid playlist action.');
    if(action==='resume'&&group.status==='cancelled')throw Error('This playlist was cancelled. Load it again to start a new selection.');
    if(action==='resume'&&e.active?.job.playlistGroup===id&&['paused','interrupted'].includes(e.active.job.status))throw Error('Wait for the current download to stop, then resume the playlist.');
    group.status=action==='pause'?'paused':action==='resume'?'running':'cancelled';
    const jobs=e.jobs.filter(j=>j.playlistGroup===id);
    if(action==='pause')for(const job of jobs)if(['queued','refreshing','downloading'].includes(job.status))await e.pause(job.id);
    if(action==='resume')for(const job of jobs)if(['paused','interrupted'].includes(job.status)&&e.active?.job.id!==job.id)await e.retry(job.id);
    if(action==='cancel'){for(const row of group.entries)if(row.status==='pending')row.status='cancelled';for(const job of jobs)await e.cancel(job.id);}
    await e.save();e.changed();if(action==='resume')void e.pump();
  }
  async retryEntry(id,key){
    const e=this.engine,group=this.groups.find(g=>g.id===id),entry=group?.entries.find(row=>row.key===key);
    if(!entry||entry.status!=='failed'||group.status==='cancelled')throw Error('This playlist entry cannot be retried.');
    const job=e.jobs.find(j=>j.id===entry.jobId);if(job){group.status='running';await e.retry(job.id);return;}
    entry.status='pending';entry.error=null;delete entry.jobId;group.status='running';await e.save();e.changed();void e.pump();
  }
}
