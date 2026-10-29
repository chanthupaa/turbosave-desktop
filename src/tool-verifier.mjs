// SPDX-License-Identifier: GPL-3.0-only
import {createHash} from 'node:crypto';
import {lstat,open,realpath} from 'node:fs/promises';
import path from 'node:path';

const key=file=>path.resolve(file).toLowerCase();
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
export const engineNames=['yt-dlp','ffmpeg','ffprobe','node'];

// The bundled expectations come from inside app.asar, not the writable tools folder.
// Cached hashes are valid only while file identity, size and change times match.
export class ToolVerifier {
  constructor(){this.expected=new Map();this.cache=new Map();this.pending=new Map();this.hashChecks=0;}
  register(file,sha256,{root=path.dirname(file),size}={}){
    if(!path.isAbsolute(file)||!path.isAbsolute(root)||path.dirname(key(file))!==key(root)||!/^[a-f0-9]{64}$/.test(sha256)||size!==undefined&&(!Number.isSafeInteger(size)||size<2||size>200_000_000))throw Error('Invalid trusted engine record.');
    const id=key(file),record={file:path.resolve(file),root:path.resolve(root),sha256,size};
    if(JSON.stringify(this.expected.get(id))!==JSON.stringify(record))this.cache.delete(id);
    this.expected.set(id,record);
  }
  revoke(file){const id=key(file);this.expected.delete(id);this.cache.delete(id);}
  async inspect(record){
    const [folder,info]=await Promise.all([lstat(record.root),lstat(record.file,{bigint:true})]);
    if(!folder.isDirectory()||folder.isSymbolicLink()||!info.isFile()||info.isSymbolicLink()||info.size<2n||info.size>200_000_000n||record.size!==undefined&&info.size!==BigInt(record.size))throw Error('Engine file is missing, redirected or has an unexpected size.');
    const [resolvedRoot,resolvedFile]=await Promise.all([realpath(record.root),realpath(record.file)]);
    if(key(resolvedFile)!==key(path.join(resolvedRoot,path.basename(record.file))))throw Error('Engine file points outside its trusted folder.');
    return info;
  }
  async verify(file){
    const id=key(file),record=this.expected.get(id);
    if(!record)throw Error('This executable is not a verified TurboSave engine.');
    const before=await this.inspect(record),fingerprint=stamp(before);
    if(this.cache.get(id)===fingerprint)return;
    if(this.pending.has(id))return this.pending.get(id);
    const work=(async()=>{
      this.cache.delete(id);
      const handle=await open(record.file,'r');
      try{
        if(stamp(await handle.stat({bigint:true}))!==fingerprint)throw Error('Engine changed during verification.');
        const hash=createHash('sha256');this.hashChecks++;
        const stream=handle.createReadStream({autoClose:false});
        for await(const bytes of stream)hash.update(bytes);
        if(hash.digest('hex')!==record.sha256)throw Error('Engine checksum verification failed. Use Repair missing tools in Settings.');
        if(stamp(await handle.stat({bigint:true}))!==fingerprint||stamp(await this.inspect(record))!==fingerprint||this.expected.get(id)!==record)throw Error('Engine changed during verification.');
        this.cache.set(id,fingerprint);
      }finally{await handle.close();}
    })();
    this.pending.set(id,work);
    try{await work;}finally{this.pending.delete(id);}
  }
}
