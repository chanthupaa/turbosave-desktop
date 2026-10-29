import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile,rename,copyFile,readdir,rm} from 'node:fs/promises';
import {DuplicateLibrary,sourceKeys,sameVideo,frameHash,fileHash} from '../src/duplicates.mjs';import {LocalEngine} from '../src/engine.mjs';
import {existsSync} from 'node:fs';
const temp=()=>mkdtemp(path.join(os.tmpdir(),'turbosave-duplicates-'));
async function engineFixture(){const dir=await temp();const engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:path.join(dir,'downloads')});engine.run=async()=> 'fixture-version';await engine.init();engine.media.set('m',{title:'Test video',source:'https://youtu.be/eRsGyueVLvQ',keys:sourceKeys({},'https://youtu.be/eRsGyueVLvQ'),created:Date.now(),formats:[{id:'0',selector:'v+a',kind:'video',extension:'mp4',sound:'with',quality:'720p',mode:'merge'}]});return {dir,engine};}
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('State did not settle');await new Promise(resolve=>setTimeout(resolve,5));}}
test('different YouTube forms and tracking parameters resolve to the same video ID',()=>{
  const urls=['https://youtu.be/eRsGyueVLvQ?si=tracking','https://www.youtube.com/watch?v=eRsGyueVLvQ&t=90','https://music.youtube.com/watch?v=eRsGyueVLvQ','https://youtube.com/shorts/eRsGyueVLvQ'];
  assert.ok(urls.every(url=>sourceKeys({},url).includes('youtube:eRsGyueVLvQ')));
  assert.ok(!sourceKeys({},'https://youtube.com/watch?v=aqz-KE-bpKQ').includes('youtube:eRsGyueVLvQ'));
  assert.ok(sourceKeys({id:'123',extractor_key:'TikTok'},'https://vm.tiktok.com/short/').includes('tiktok:123'));
  assert.ok(!sourceKeys({id:'same-file-title',extractor_key:'Generic'},'https://example.com/a').includes('generic:same-file-title'));
});
test('source warnings survive history clearing and require an existing matching file in the chosen folder',async()=>{
  const {dir,engine}=await engineFixture();const file=path.join(engine.downloadsDir,'renamed by user.mp4');await writeFile(file,'fixture-video');
  await engine.library.record(file,{keys:sourceKeys({id:'eRsGyueVLvQ',extractor_key:'Youtube'},'https://youtube.com/watch?v=eRsGyueVLvQ'),kind:'video',quality:'360p MP4'});await engine.clearHistory();
  await assert.rejects(()=>engine.addDraft({mediaId:'m',formatId:'0',rightsConfirmed:true}),error=>error.code==='DUPLICATE_MEDIA'&&error.duplicates[0].path===file);
  assert.equal((await engine.library.known(engine.media.get('m').keys,engine.downloadsDir,'audio')).length,0);
  const other=path.join(dir,'other');await mkdir(other);assert.equal((await engine.library.known(engine.media.get('m').keys,other,'video')).length,0);
  await writeFile(file,'a different file now');assert.equal((await engine.library.known(engine.media.get('m').keys,engine.downloadsDir,'video')).length,0);await engine.close();
});
test('renamed byte-identical media matches by content and transfers its saved source identity',async()=>{
  const dir=await temp();const folder=path.join(dir,'folder');await mkdir(folder);const incoming=path.join(dir,'source.mp4'),original=path.join(folder,'original.mp4'),renamed=path.join(folder,'unrelated-name.webm');
  await writeFile(incoming,'same fixture bytes');await copyFile(incoming,original);
  const library=new DuplicateLibrary({stateDir:dir,run:async()=>'',runBytes:async()=>Buffer.alloc(72),tool:n=>n});
  await library.record(original,{keys:['youtube:fixture'],kind:'video'});await rename(original,renamed);
  const result=await library.compare(incoming,folder,'video');assert.equal(result.match.reason,'exact');assert.equal(result.match.path,renamed);
  assert.equal((await library.known(['youtube:fixture'],folder,'video'))[0].path,renamed);
  const restored=new DuplicateLibrary({stateDir:dir});await restored.load();assert.equal((await restored.known(['youtube:fixture'],folder,'video')).length,1);
});
test('blank/static samples and different durations do not become visual matches',()=>{
  const blank={version:1,duration:5,frames:Array.from({length:5},()=>frameHash(Buffer.alloc(72)))};assert.equal(sameVideo(blank,blank),false);
  const frames=['1234567890abcdef','abcdef0012345678','13579bdf02468ace','aabbccdd11223344','8877665544332211'].map(hash=>({hash,detail:22}));
  const good={version:1,duration:10,frames};assert.equal(sameVideo(good,good),true);assert.equal(sameVideo(good,{...good,duration:11}),false);
});
test('a duplicate appearing after staging pauses the queue; Keep existing changes no media files',async()=>{
  const {engine}=await engineFixture();const realPump=engine.pump.bind(engine);engine.pump=async()=>{};
  const id=await engine.addDraft({mediaId:'m',formatId:'0',rightsConfirmed:true});const file=path.join(engine.downloadsDir,'keep me.mp4');await writeFile(file,'original bytes');await engine.library.record(file,{keys:engine.media.get('m').keys,kind:'video'});
  engine.pump=realPump;await engine.startBatch();await until(()=>engine.jobs[0].status==='duplicate'&&engine.active?.resolveDuplicate);
  await engine.resolveDuplicate({jobId:id,action:'keep-existing'});await until(()=>engine.active===null);
  assert.equal(engine.jobs[0].status,'skipped');assert.equal(await readFile(file,'utf8'),'original bytes');assert.equal((await readdir(engine.downloadsDir)).length,1);await engine.close();
});
test('cancel while waiting for a duplicate decision releases the queue and preserves the original',async()=>{
  const {engine}=await engineFixture();engine.pump=async()=>{};const id=await engine.addDraft({mediaId:'m',formatId:'0',rightsConfirmed:true});
  const file=path.join(engine.downloadsDir,'keep.mp4');await writeFile(file,'original');await engine.library.record(file,{keys:engine.media.get('m').keys,kind:'video'});
  engine.pump=LocalEngine.prototype.pump.bind(engine);await engine.startBatch();await until(()=>engine.active?.resolveDuplicate);await engine.cancel(id);await until(()=>engine.active===null);assert.equal(engine.jobs[0].status,'cancelled');assert.equal(await readFile(file,'utf8'),'original');await engine.close();
});
test('an existing file changed during the decision is not silently accepted as the earlier match',async()=>{
  const {engine}=await engineFixture();const file=path.join(engine.downloadsDir,'changed.mp4');await writeFile(file,'original');const entry=await engine.library.record(file,{keys:[],kind:'video'});const match=engine.library.publicMatch(entry,'exact');
  await writeFile(file,'new and different content');await assert.rejects(()=>engine.keepExisting({format:{kind:'video'}},match),/changed while/);assert.equal(await readFile(file,'utf8'),'new and different content');await engine.close();
});
test('Save another copy never overwrites the original even when the output filename is identical',async()=>{
  const {engine}=await engineFixture();const original=path.join(engine.downloadsDir,'Test video - 720p.mp4');await writeFile(original,'fixture-video');await engine.library.record(original,{keys:engine.media.get('m').keys,kind:'video'});
  engine.library.signature=async()=>null;
  engine.run=async(binary,args)=>{if(args.includes('--output')){await writeFile(args[args.indexOf('--output')+1].replace('%(ext)s','mp4'),'fixture-video');return '';}return JSON.stringify({streams:[{codec_type:'video'},{codec_type:'audio'}]});};
  const id=await engine.enqueue({mediaId:'m',formatId:'0',rightsConfirmed:true,allowDuplicate:true});await until(()=>engine.jobs.find(j=>j.id===id).status==='completed'&&engine.active===null);
  assert.equal(await readFile(original,'utf8'),'fixture-video');assert.notEqual(engine.jobs[0].filePath,original);assert.match(engine.jobs[0].filePath,/\(2\)\.mp4$/);await engine.close();
});
test('real FFmpeg recognises a resized re-encode but not a different video with the same filename',{timeout:120_000,skip:existsSync(path.resolve('vendor/bin/ffmpeg.exe'))?false:'Run tools:prepare for bundled-engine integration checks'},async()=>{
  const dir=await temp(),folder=path.join(dir,'existing');await mkdir(folder);const engine=new LocalEngine({toolsDir:path.resolve('vendor'),stateDir:dir,downloadsDir:folder});
  const original=path.join(dir,'incoming.mp4'),encoded=path.join(folder,'renamed-and-resized.mp4'),other=path.join(dir,'other.mp4');
  const run=args=>engine.run(engine.tool('ffmpeg'),['-v','error','-y',...args],{timeout:40_000});
  await run(['-f','lavfi','-i','testsrc2=size=320x180:rate=12:duration=4,rotate=0.5*t','-c:v','libx264','-preset','ultrafast','-threads','2','-crf','18',original]);
  await run(['-i',original,'-vf','scale=160:90','-c:v','libx264','-preset','ultrafast','-threads','2','-crf','26',encoded]);
  assert.notEqual(await fileHash(original),await fileHash(encoded));
  const result=await engine.library.compare(original,folder,'video');assert.equal(result.match?.reason,'visual');
  await run(['-i',original,'-vf','negate','-c:v','libx264','-preset','ultrafast','-threads','2',other]);
  await rm(encoded);await copyFile(other,path.join(folder,'incoming.mp4'));
  const distinct=await engine.library.compare(original,folder,'video');assert.equal(distinct.match,null);
  await engine.close();
});
