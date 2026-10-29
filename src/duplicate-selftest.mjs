// Packaged offline QA. Generated clips live only in the isolated self-test profile.
import path from 'node:path';import {mkdir,writeFile,copyFile,rename,readFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileHash,sourceKeys} from './duplicates.mjs';
import {cleanupSelfTest} from './cleanup-selftest.mjs';
export async function duplicateSelfTest(engine){
  const checks=[];const root=path.join(engine.stateDir,'duplicate-fixtures');await mkdir(root,{recursive:true});
  const incoming=path.join(root,'incoming.mp4');
  const run=args=>engine.run(engine.tool('ffmpeg'),['-v','error','-y',...args],{timeout:40_000});
  await run(['-f','lavfi','-i','testsrc2=size=320x180:rate=12:duration=4,rotate=0.5*t','-c:v','libx264','-preset','ultrafast','-threads','2',incoming]);
  const exactFolder=path.join(root,'renamed');await mkdir(exactFolder);const original=path.join(exactFolder,'original.mp4'),renamed=path.join(exactFolder,'another-title.mkv');
  await copyFile(incoming,original);const keys=sourceKeys({},'https://www.youtube.com/watch?v=eRsGyueVLvQ');await engine.library.record(original,{keys,kind:'video'});await rename(original,renamed);
  const exact=await engine.library.compare(incoming,exactFolder,'video');assert.equal(exact.match?.reason,'exact');checks.push({name:'Renamed file matches by SHA-256',passed:true});
  assert.equal((await engine.library.known(sourceKeys({},'https://music.youtube.com/watch?v=eRsGyueVLvQ&t=3'),exactFolder,'video'))[0].path,renamed);checks.push({name:'Different source URL forms match the saved video',passed:true});
  const visualFolder=path.join(root,'reencoded');await mkdir(visualFolder);const encoded=path.join(visualFolder,'unrelated-name.mp4');
  await run(['-i',incoming,'-vf','scale=160:90','-c:v','libx264','-preset','ultrafast','-threads','2','-crf','26',encoded]);
  assert.notEqual(await fileHash(incoming),await fileHash(encoded));assert.equal((await engine.library.compare(incoming,visualFolder,'video')).match?.reason,'visual');checks.push({name:'Resized re-encode matches by sampled video frames',passed:true});
  await rm(encoded);await run(['-i',incoming,'-vf','negate','-c:v','libx264','-preset','ultrafast','-threads','2',path.join(visualFolder,'incoming.mp4')]);
  assert.equal((await engine.library.compare(incoming,visualFolder,'video')).match,null);checks.push({name:'Different video with the same filename is not treated as a duplicate',passed:true});
  const queueFolder=path.join(root,'queue');await engine.setFolder(queueFolder);const item={source:'https://example.com/turbosave-generated-clip',title:'Generated sample',keys:['fixture:generated'],created:Date.now(),formats:[{id:'0',selector:'fixture',kind:'video',extension:'mp4',quality:'720p'}]};engine.media.set('selftest',item);
  await engine.addDraft({mediaId:'selftest',formatId:'0',rightsConfirmed:true});
  const keep=path.join(queueFolder,'keep-original.mp4');await copyFile(incoming,keep);const before=await fileHash(keep);await engine.library.record(keep,{keys:item.keys,kind:'video'});await engine.startBatch();
  const deadline=Date.now()+5000;while(!engine.active?.resolveDuplicate){if(Date.now()>deadline)throw Error('Duplicate decision was not presented');await new Promise(resolve=>setTimeout(resolve,20));}
  const id=engine.active.job.id;engine.resolveDuplicate({jobId:id,action:'keep-existing'});
  while(engine.active){if(Date.now()>deadline)throw Error('Duplicate decision did not finish');await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(engine.jobs.find(j=>j.id===id).status,'skipped');assert.equal(await fileHash(keep),before);checks.push({name:'Bulk queue pauses and Keep existing preserves the original bytes',passed:true});
  checks.push(...await cleanupSelfTest(engine));return checks;
}
