import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir,writeFile } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { LocalEngine } from '../src/engine.mjs';
async function fixture(){
  const directory=await mkdtemp(path.join(os.tmpdir(),'turbosave-workflow-'));
  const engine=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:path.join(directory,'downloads')});
  engine.run=async()=> 'fixture-version';await engine.init();let pumps=0;engine.pump=async()=>{pumps++;};
  for(const [id,height] of [['first',1080],['second',720]])engine.media.set(id,{source:`https://example.com/${id}`,title:id,created:Date.now(),formats:[{id:'0',selector:`v${height}+a`,extension:'mp4',kind:'video',sound:'with',quality:`${height}p`,height,mode:'merge'}]});
  return {engine,directory,pumps:()=>pumps};
}
test('first launch saves an explicitly confirmed writable folder and does not welcome again',async()=>{
  const {engine,directory}=await fixture();assert.equal(engine.snapshot().onboardingComplete,false);
  await engine.setFolder(path.join(directory,'chosen'));
  assert.equal(engine.onboardingComplete,false,'Choosing a folder alone does not finish the welcome');
  await engine.finishOnboarding();assert.equal(engine.onboardingComplete,true);
  assert.deepEqual(await readdir(engine.downloadsDir),[],'Write checks leave no files');await engine.close();
  const restored=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});restored.run=async()=> 'fixture-version';await restored.init();
  assert.equal(restored.onboardingComplete,true);assert.equal(restored.downloadsDir,path.join(directory,'chosen'));await restored.close();
});
test('unconfirmed welcome persists and folder errors never mark onboarding complete',async()=>{
  const {engine,directory}=await fixture();await engine.setFolder(path.join(directory,'chosen'));await engine.close();
  const restored=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});restored.run=async()=> 'fixture-version';await restored.init();
  assert.equal(restored.onboardingComplete,false);
  restored.checkFolder=async()=>{throw new Error('This folder is not writable.');};
  await assert.rejects(()=>restored.finishOnboarding(),/not writable/);assert.equal(restored.onboardingComplete,false);await restored.close();
});
test('legacy users retain their existing folder without being forced through welcome again',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'turbosave-legacy-'));await writeFile(path.join(directory,'state.json'),JSON.stringify({version:1,downloadsDir:directory,jobs:[]}));
  const engine=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});engine.run=async()=> 'fixture-version';await engine.init();assert.equal(engine.onboardingComplete,true);await engine.close();
});
test('bulk items retain individual quality and folder, need no checkbox, and wait for Start',async()=>{
  const {engine,directory,pumps}=await fixture();
  const first=await engine.addDraft({mediaId:'first',formatId:'0'});
  const firstFolder=engine.downloadsDir;await engine.setFolder(path.join(directory,'other'));
  const second=await engine.addDraft({mediaId:'second',formatId:'0',rightsConfirmed:true});
  assert.equal(pumps(),0);assert.ok(engine.jobs.every(job=>job.status==='draft'));assert.equal(engine.jobs.find(j=>j.id===first).directory,firstFolder);
  assert.equal(engine.jobs.find(j=>j.id===second).format.height,720);assert.equal(engine.jobs.find(j=>j.id===first).format.height,1080);
  assert.equal(engine.snapshot().jobs[0].format,undefined,'Private selectors stay out of renderer snapshots');
  await assert.rejects(()=>engine.enqueue({mediaId:'first',formatId:'0',rightsConfirmed:true}),/already/);
  const ids=await engine.startBatch();assert.equal(ids.length,2);assert.equal(pumps(),1);assert.ok(engine.jobs.every(job=>job.status==='queued'));
  await assert.rejects(()=>engine.startBatch(),/at least one/);await assert.rejects(()=>engine.removeDraft(first),/already started/);await engine.close();
});
test('a saved batch survives restart with exact selections and is not automatically downloaded',async()=>{
  const {engine,directory}=await fixture();await engine.addDraft({mediaId:'first',formatId:'0',rightsConfirmed:true});await engine.close();
  const restored=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});restored.run=async()=> 'fixture-version';let pumps=0;restored.pump=async()=>{pumps++;};await restored.init();
  assert.equal(restored.jobs[0].status,'draft');assert.equal(restored.jobs[0].format.selector,'v1080+a');assert.equal(pumps,0);
  await restored.clearHistory();assert.equal(restored.jobs.length,1);await restored.startBatch();assert.equal(pumps,1);await restored.close();
});
test('removing a draft does not enqueue it and the combined batch/queue limit is enforced',async()=>{
  const {engine,directory,pumps}=await fixture();const id=await engine.addDraft({mediaId:'first',formatId:'0',rightsConfirmed:true});
  await engine.removeDraft(id);assert.equal(engine.jobs.length,0);assert.equal(pumps(),0);
  engine.jobs=Array.from({length:20},(_,i)=>({id:String(i),status:i%2?'draft':'queued'}));
  await assert.rejects(()=>engine.addDraft({mediaId:'second',formatId:'0',rightsConfirmed:true}),/20 items/);
  assert.equal(JSON.parse(await readFile(path.join(directory,'state.json'),'utf8')).jobs.length,0);await engine.close();
});
