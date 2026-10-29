// SPDX-License-Identifier: GPL-3.0-only
import https from 'node:https';
import {publicTarget} from './media.mjs';
const LIMIT=2*1024*1024;
export function thumbnailCandidates(info){
  const supplied=[typeof info.thumbnail==='string'?info.thumbnail:null,...(Array.isArray(info.thumbnails)?[...info.thumbnails].reverse().map(t=>t?.url):[])];
  return [...new Set(supplied.filter(url=>typeof url==='string'&&url.startsWith('https://')&&url.length<=4096))].slice(0,4);
}
export function imagePreview(bytes){
  let mime=null;
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')mime='image/webp';
  if(!mime||bytes.length>LIMIT)throw Error('Unsupported thumbnail image.');
  const dimensions=imageDimensions(bytes,mime);
  if(!dimensions||dimensions.some(value=>!Number.isInteger(value)||value<1||value>8192)||dimensions[0]*dimensions[1]>20_000_000)throw Error('Unsupported thumbnail image dimensions.');
  return {dataUrl:`data:${mime};base64,${bytes.toString('base64')}`,bytes:bytes.length,mime};
}
function imageDimensions(bytes,mime){
  if(mime==='image/png')return bytes.toString('ascii',12,16)==='IHDR'?[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]:null;
  if(mime==='image/jpeg'){
    let offset=2;
    while(offset+4<=bytes.length){
      if(bytes[offset++]!==255)return null;
      while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(marker===0xd9||marker===0xda)return null;
      if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      if(offset+2>bytes.length)return null;
      const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return length>=8?[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)]:null;
      offset+=length;
    }
  }
  if(mime==='image/webp'){
    const type=bytes.toString('ascii',12,16);
    if(type==='VP8X'&&bytes.length>=30)return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
    if(type==='VP8 '&&bytes.length>=30&&bytes.subarray(23,26).equals(Buffer.from([0x9d,1,0x2a])))return [bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];
    if(type==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
  }
  return null;
}
export async function loadThumbnail(value,{validate=publicTarget,request=https.request,signal=AbortSignal.timeout(6000)}={}){
  for(let redirects=0;redirects<=3;redirects++){
    signal.throwIfAborted();let aborted;
    const timeout=new Promise((_,reject)=>{aborted=()=>reject(signal.reason);signal.addEventListener('abort',aborted,{once:true});});
    let target;try{target=await Promise.race([validate(value),timeout]);}finally{signal.removeEventListener('abort',aborted);}
    const {url,addresses}=target;signal.throwIfAborted();
    const result=await new Promise((resolve,reject)=>{
      const req=request(url,{method:'GET',signal,headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'TurboSave-Desktop'},
        lookup(_hostname,options,callback){options?.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);}},res=>{
        res.on('error',reject);
        if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.destroy();resolve({redirect:new URL(res.headers.location,url).href});return;}
        if(res.statusCode!==200||Number(res.headers['content-length'])>LIMIT){res.destroy();reject(Error('Thumbnail is unavailable.'));return;}
        let size=0;const chunks=[];
        res.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){res.destroy();reject(Error('Thumbnail is too large.'));}else chunks.push(chunk);});
        res.on('end',()=>{try{resolve(imagePreview(Buffer.concat(chunks)));}catch(error){reject(error);}});
        res.on('error',reject);res.on('aborted',()=>reject(Error('Thumbnail transfer was interrupted.')));
      });req.on('error',reject);req.end();
    });
    if(!result.redirect)return result;value=result.redirect;
  }
  throw Error('Too many thumbnail redirects.');
}
