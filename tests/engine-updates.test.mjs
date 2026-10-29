import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import os from 'node:os';import {LocalEngine} from '../src/engine.mjs';
test('verified engine override survives restart, detects tampering, and can fall back to the bundled engine',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-engine-update-')),toolsDir=path.join(dir,'tools'),bytes=Buffer.from('MZtest fixture'),sha=createHash('sha256').update(bytes).digest('hex');
 const engine=new LocalEngine({toolsDir,stateDir:dir,downloadsDir:dir});engine.run=async()=> '2026.10.27';engine.versions={'yt-dlp':'2026.10.26'};
 await engine.installDownloader(bytes,'2026.10.27',sha);assert.match(engine.tool('yt-dlp'),/engine-updates/);
 const restored=new LocalEngine({toolsDir,stateDir:dir,downloadsDir:dir});await restored.loadDownloader();assert.equal(restored.tool('yt-dlp'),engine.tool('yt-dlp'));
 await writeFile(engine.tool('yt-dlp'),'tampered bytes');const tampered=new LocalEngine({toolsDir,stateDir:dir,downloadsDir:dir});await tampered.loadDownloader();assert.equal(tampered.tool('yt-dlp'),path.join(toolsDir,'bin','yt-dlp.exe'));assert.match(tampered.engineUpdateWarning,/could not be verified/);
 engine.run=async()=> '2026.10.26';await engine.useBundledDownloader();assert.equal(engine.versions['yt-dlp'],'2026.10.26');assert.equal(JSON.parse(await readFile(path.join(dir,'engine-update.json'),'utf8')).enabled,false);
 engine.active={};assert.throws(()=>engine.assertIdleForUpdate(),/Pause downloads/);engine.active=null;
 await assert.rejects(()=>engine.installDownloader(bytes,'../../bad',sha),/Invalid engine update/);
});
