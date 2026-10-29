// Bounded public-source checks in an isolated profile. Never reads the normal app's history.
import {mkdtemp,mkdir,writeFile,stat} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {LocalEngine} from '../src/engine.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),profile=await mkdtemp(path.join(os.tmpdir(),'turbosave-live-beta-')),engine=new LocalEngine({toolsDir:path.join(root,'vendor'),stateDir:profile,downloadsDir:path.join(profile,'downloads')}),report={profile,checks:[]};
const wait=id=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{engine.off('state',listen);reject(Error('Sample transfer timed out.'));},120_000);const listen=s=>{const job=s.jobs.find(j=>j.id===id);if(job&&['completed','failed','paused','cancelled'].includes(job.status)){clearTimeout(timer);engine.off('state',listen);job.status==='completed'?resolve(job):reject(Error(job.error||job.message||job.status));}};engine.on('state',listen);listen(engine.snapshot());});
try{
 await engine.init();await engine.finishOnboarding();
 try{const preview=await engine.playlists.inspect({source:'https://www.youtube.com/playlist?list=PL6B3937A5D230E335'});report.checks.push({name:'Live YouTube playlist metadata',ok:true,title:preview.title,entries:preview.entries.length,hasMore:preview.hasMore});}catch(error){report.checks.push({name:'Live YouTube playlist metadata',ok:false,error:error.message});}
 try{const media=await engine.inspect('https://www.w3schools.com/html/mov_bbb.mp4');report.checks.push({name:'Live direct-MP4 inspection',ok:true,formats:media.formats.length});
  for(const format of [media.formats.find(f=>f.kind==='video'&&f.sound!=='without'),media.formats.find(f=>f.mode==='mp3')].filter(Boolean)){
    const job=await wait(await engine.enqueue({mediaId:media.id,formatId:format.id}));report.checks.push({name:`Live ${format.extension} transfer and FFprobe verification`,ok:true,bytes:(await stat(job.filePath)).size,sourceCheckMs:job.sourceCheckMs,transferAndMergeMs:job.transferAndMergeMs,finalizeMethod:job.finalizeMethod,finalizeMs:job.finalizeMs});
  }
 }catch(error){report.checks.push({name:'Live sample inspection/transfer',ok:false,error:error.message});}
 report.ok=report.checks.every(c=>c.ok);
}finally{await engine.close();await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts','live-beta.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
