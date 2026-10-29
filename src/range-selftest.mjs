// Generated loopback fixture for the bundled downloader's real HTTP Range behaviour.
// Production URL validation is unchanged; this helper runs only in explicit self-tests.
import http from 'node:http';import path from 'node:path';import {mkdir,readFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
export async function rangeSelfTest(engine){
 const folder=path.join(engine.stateDir,'range-fixture');await mkdir(folder,{recursive:true});const source=path.join(folder,'source.mp4');
 await engine.run(engine.tool('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=12','-c:v','libx264','-preset','ultrafast','-crf','18','-threads','2',source],{timeout:40_000});
 const bytes=await readFile(source),ranges=[];const sockets=new Set();
 const server=http.createServer((req,res)=>{
  if(req.url!=='/fixture.mp4'){res.writeHead(404);res.end();return;}
  const match=/^bytes=(\d+)-/.exec(req.headers.range||''),offset=match?Number(match[1]):0;ranges.push(offset);
  if(offset>=bytes.length){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return;}
  res.writeHead(match?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':bytes.length-offset,...(match?{'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`}:{})});if(req.method==='HEAD'){res.end();return;}
  let cursor=offset;const timer=setInterval(()=>{const end=Math.min(bytes.length,cursor+16384);res.write(bytes.subarray(cursor,end));cursor=end;if(cursor===bytes.length){clearInterval(timer);res.end();}},20);res.on('close',()=>clearInterval(timer));
 });server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const output=path.join(folder,'saved.mp4'),args=['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist','--no-warnings','--no-progress','--continue','--part','--proxy','','--output',output,'--',`http://127.0.0.1:${server.address().port}/fixture.mp4`];let child;
 try{
  const first=engine.run(engine.tool('yt-dlp'),args,{timeout:60_000,onSpawn:value=>child=value}).catch(error=>error);
  const deadline=Date.now()+30_000;while((await stat(output+'.part').catch(()=>({size:0}))).size<65536){if(Date.now()>deadline)throw Error('The range fixture did not start downloading.');await new Promise(resolve=>setTimeout(resolve,20));}
  engine.kill(child);await first;const partial=(await stat(output+'.part')).size;assert.ok(partial>0&&partial<bytes.length);
  await engine.run(engine.tool('yt-dlp'),args,{timeout:60_000});const saved=await readFile(output);assert.equal(createHash('sha256').update(saved).digest('hex'),createHash('sha256').update(bytes).digest('hex'));assert.ok(ranges.some(offset=>offset>0));
  return {name:'Bundled yt-dlp resumes real partial bytes using HTTP Range',passed:true,bytes:bytes.length,resumedFrom:partial};
 }finally{if(child&&child.exitCode===null)engine.kill(child);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
