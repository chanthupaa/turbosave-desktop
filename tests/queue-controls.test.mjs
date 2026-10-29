import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';import {mkdtemp,writeFile,readFile,readdir,mkdir,symlink} from 'node:fs/promises';
import {LocalEngine} from '../src/engine.mjs';import {createStage,ownedStage,cleanStage} from '../src/job-stage.mjs';
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-controls-')),engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:path.join(dir,'downloads')});engine.run=async()=> 'fixture-version';await engine.init();const pump=engine.pump.bind(engine);engine.pump=async()=>{};
  for(let i=0;i<3;i++)engine.media.set('m'+i,{source:`https://1.1.1.1/video${i}`,title:'Video '+i,created:Date.now(),keys:['fixture:'+i],formats:[{id:'0',selector:'v+a',kind:'video',extension:'mp4',mode:'merge',sound:'with',height:720,quality:'720p'}]});return {engine,dir,pump};}
test('queue ordering, priority, paused history and persisted preferences survive restart',async()=>{
 const {engine,dir}=await fixture();try{const ids=[];for(let i=0;i<3;i++)ids.push(await engine.enqueue({mediaId:'m'+i,formatId:'0'}));assert.deepEqual(engine.pending().map(j=>j.id),ids);
 await engine.move(ids[2],'first');assert.equal(engine.pending()[0].id,ids[2]);await engine.move(ids[2],'down');assert.equal(engine.pending()[1].id,ids[2]);await engine.pause(ids[0]);await engine.clearHistory();assert.equal(engine.jobs.length,3);
 await engine.setSettings({speedLimit:2000000,minimizeToTray:true,notifications:true,releaseRepo:'owner/turbosave-desktop'});await assert.rejects(()=>engine.setSettings({speedLimit:-1}));await assert.rejects(()=>engine.setSettings({releaseRepo:'https://evil.example/repo'}));
 }finally{await engine.close();}
 const restored=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:path.join(dir,'downloads')});restored.run=async()=> 'fixture-version';try{await restored.init();assert.equal(restored.settings.speedLimit,2000000);assert.equal(restored.settings.minimizeToTray,true);assert.equal(restored.jobs.filter(j=>j.status==='paused').length,1);assert.equal(restored.pending().length,0,'Restart never automatically starts queued downloads');}finally{await restored.close();}
});
test('pause keeps partial files, resume reuses the owned stage and applies the speed limit',async()=>{
 const {engine,pump}=await fixture();let phase=0,stage,release;
 try{await engine.setSettings({speedLimit:1000000});engine.run=async(binary,args)=>{
   if(args.includes('--output')){stage=path.dirname(args[args.indexOf('--output')+1]);assert.ok(args.includes('--continue'));assert.equal(args[args.indexOf('--limit-rate')+1],'1000000');
     if(phase===0){await writeFile(path.join(stage,'media.mp4.part'),'partial bytes');await new Promise(resolve=>release=resolve);throw Error('Stopped child');}
     assert.equal(await readFile(path.join(stage,'media.mp4.part'),'utf8'),'partial bytes');await writeFile(path.join(stage,'media.mp4'),'complete media');return '';}
   return JSON.stringify({streams:[{codec_type:'video'},{codec_type:'audio'}]});};
 const id=await engine.enqueue({mediaId:'m0',formatId:'0'});engine.pump=pump;const first=engine.pump();while(!release)await new Promise(r=>setTimeout(r,5));await engine.pause(id);release();await first;
 const job=engine.jobs.find(j=>j.id===id);assert.equal(job.status,'paused');assert.equal(await ownedStage(job),stage);assert.equal(engine.snapshot().jobs[0].stageToken,undefined);
 engine.inspect=async()=>({id:'m0'});engine.library.signature=async()=>null;phase=1;engine.pump=async()=>{};await engine.retry(id);engine.pump=pump;await engine.pump();assert.equal(job.status,'completed',job.error);assert.equal(job.stageName,undefined);assert.equal((await readdir(job.directory)).filter(n=>n.startsWith('.turbosave-')).length,0);
 }finally{if(release)release();await engine.close();}
});
test('owned-stage cleanup never removes a sibling folder or a forged marker',async()=>{
 const {engine}=await fixture();try{const job={id:'fixture',directory:engine.downloadsDir};const stage=await createStage(job);await writeFile(path.join(stage,'partial'),'owned');const sibling=path.join(job.directory,'.turbosave-sibling');await mkdir(sibling);await writeFile(path.join(sibling,'keep'),'keep');
 const forged={...job,stageName:'.turbosave-sibling'};assert.equal(await ownedStage(forged),null);await cleanStage(forged);assert.equal(await readFile(path.join(sibling,'keep'),'utf8'),'keep');
 await cleanStage(job);assert.equal((await readdir(engine.downloadsDir)).includes(path.basename(stage)),false);
 }finally{await engine.close();}
});
test('cancel paused downloads discards only their own parts and missing qualities fail safely',async()=>{
 const {engine,pump}=await fixture();try{const id=await engine.enqueue({mediaId:'m0',formatId:'0'}),job=engine.jobs.find(j=>j.id===id);await createStage(job);await engine.pause(id);await engine.cancel(id);assert.equal(job.status,'cancelled');assert.equal(job.stageName,undefined);
 engine.inspect=async()=>({id:'missing'});engine.media.set('missing',{formats:[],keys:[]});await engine.retry(id);engine.pump=pump;await engine.pump();assert.equal(job.status,'failed');assert.match(job.error,/quality is no longer available/);
 }finally{await engine.close();}
});
test('owned partials survive restart and clearing history until explicitly discarded',async()=>{
 const {engine,dir}=await fixture();const id=await engine.enqueue({mediaId:'m0',formatId:'0'}),job=engine.jobs.find(j=>j.id===id),stage=await createStage(job);await writeFile(path.join(stage,'media.part'),'recoverable');await engine.pause(id);await engine.close();
 const restored=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:engine.downloadsDir});restored.run=async()=> 'fixture-version';try{await restored.init();const saved=restored.jobs.find(j=>j.id===id);assert.equal(saved.status,'paused');assert.equal(await ownedStage(saved),stage);await restored.clearHistory();assert.equal(restored.jobs.length,1);await restored.cancel(id);assert.equal(await ownedStage(saved),null);}finally{await restored.close();}
});
test('a transient network failure keeps parts paused, while cancellation removes them',async()=>{
 const {engine,pump}=await fixture();try{engine.run=async(_binary,args)=>{const stage=path.dirname(args[args.indexOf('--output')+1]);await writeFile(path.join(stage,'media.mp4.part'),'recoverable bytes');const error=Error('Connection interrupted');error.retryable=true;throw error;};
 const id=await engine.enqueue({mediaId:'m0',formatId:'0'});engine.pump=pump;await engine.pump();const job=engine.jobs.find(j=>j.id===id);assert.equal(job.status,'paused');assert.ok(await ownedStage(job));await engine.cancel(id);assert.equal(await ownedStage(job),null);
 }finally{await engine.close();}
});
test('closing while a resume is being persisted does not start another source request',async()=>{
 const {engine,pump}=await fixture();const id=await engine.enqueue({mediaId:'m0',formatId:'0'});engine.jobs[0].needsRefresh=true;let requests=0,release,entered=false;const save=engine.save.bind(engine);
 engine.inspect=async()=>{requests++;throw Error('Unexpected source check');};engine.save=async()=>{await save();if(!entered){entered=true;await new Promise(resolve=>release=resolve);}};
 engine.pump=pump;const running=engine.pump();while(!release)await new Promise(resolve=>setTimeout(resolve,5));const closing=engine.close();release();await running;await closing;assert.equal(requests,0);assert.equal(engine.jobs.find(j=>j.id===id).status,'interrupted');
});
