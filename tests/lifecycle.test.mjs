import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { LocalEngine } from '../src/engine.mjs';

test('closing stops an owned running engine process and waits for its exit', {timeout:15_000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-test-child-'));
  const engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:dir});
  engine.verifier.register(process.execPath,createHash('sha256').update(await readFile(process.execPath)).digest('hex'));
  let child;
  const result=engine.run(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:12_000,onSpawn:value=>{child=value;}}).then(()=>null,error=>error);
  const deadline=Date.now()+5000;while(!child&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(child.pid);assert.equal(engine.children.size,1);
  await engine.close();
  assert.equal(engine.children.size,0);assert.ok(child.exitCode!==null||child.signalCode!==null);
  assert.ok(await result instanceof Error);
  await assert.rejects(()=>engine.inspect('https://youtube.com/watch?v=eRsGyueVLvQ'),/closing/);
});

test('saved unfinished jobs restore as interrupted without silently restarting downloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-test-restore-'));
  await writeFile(path.join(dir,'state.json'),JSON.stringify({version:1,downloadsDir:dir,jobs:[{id:'saved',source:'https://youtube.com/watch?v=eRsGyueVLvQ',status:'downloading',progress:42}]}));
  const engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:dir});
  const calls=[];engine.run=async(_binary,args)=>{calls.push(args);return 'fixture-version';};
  await engine.init();
  assert.equal(engine.jobs[0].status,'interrupted');assert.equal(engine.jobs[0].progress,42);assert.equal(engine.active,null);
  assert.equal(calls.length,4);assert.ok(calls.every(args=>args.some(value=>value.includes('version'))));
  await engine.close();
  assert.equal(JSON.parse(await readFile(path.join(dir,'state.json'),'utf8')).jobs[0].status,'interrupted');
});
