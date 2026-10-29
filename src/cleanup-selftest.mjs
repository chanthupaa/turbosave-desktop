// Offline pipeline QA: generated media, real FFmpeg/FFprobe, simulated source transfer.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,readdir,copyFile} from 'node:fs/promises';

export async function cleanupSelfTest(engine){
  const root=await mkdtemp(path.join(engine.stateDir,'cleanup-fixtures-'));
  const checks=[],realRun=engine.run.bind(engine),previousFolder=engine.downloadsDir;
  const run=args=>realRun(engine.tool('ffmpeg'),['-v','error','-y','-threads','2',...args],{timeout:40_000});
  const video=path.join(root,'video.mp4'),audio=path.join(root,'audio.m4a');
  await run(['-f','lavfi','-i','testsrc2=size=160x90:rate=12:duration=1','-an','-c:v','libx264','-preset','ultrafast','-threads','2',video]);
  await run(['-f','lavfi','-i','sine=frequency=440:duration=1','-vn','-c:a','aac',audio]);
  let current;
  engine.run=async(binary,args,options)=>{
    if(binary!==engine.tool('yt-dlp'))return realRun(binary,args,options);
    assert.ok(args.includes('--no-keep-video'),'yt-dlp must discard intermediate streams after post-processing');
    const stage=path.dirname(args[args.indexOf('--output')+1]);
    await copyFile(video,path.join(stage,'media.f137.mp4'));
    await copyFile(audio,path.join(stage,'media.f140.m4a'));
    for(const name of ['media.part','media.ytdl','media.info.json','media.temp.mp4','media.webp'])await writeFile(path.join(stage,name),'temporary fixture');
    if(current==='cancel'){await engine.cancel(engine.active.job.id);return '';}
    if(current==='no-audio'){await copyFile(video,path.join(stage,'media.mp4'));return '';}
    if(current==='failure')throw Error('Simulated source transfer failure');
    if(current==='audio')await run(['-i',audio,'-vn','-c:a','libmp3lame',path.join(stage,'media.mp3')]);
    else if(current==='image')await run(['-i',video,'-frames:v','1',path.join(stage,'media.jpg')]);
    else await run(['-i',path.join(stage,'media.f137.mp4'),'-i',path.join(stage,'media.f140.m4a'),'-map','0:v:0','-map','1:a:0','-c','copy',path.join(stage,'media.mp4')]);
    return '';
  };
  try{
    for(const scenario of ['video','no-audio','failure','cancel','audio','image']){
      current=scenario;const folder=path.join(root,scenario);await mkdir(folder);await engine.setFolder(folder);
      const existing=new Map([['my earlier video.mp4','existing video'],['my music.mp3','existing audio'],['my thumbnail.jpg','existing image'],['my notes.txt','existing notes']]);
      for(const [name,bytes]of existing)await writeFile(path.join(folder,name),bytes);
      // A different staging-like folder is not ours to clean up.
      const unrelated=path.join(folder,'.turbosave-existing');await mkdir(unrelated);await writeFile(path.join(unrelated,'keep.txt'),'keep this directory');
      const extension=scenario==='audio'?'mp3':scenario==='image'?'jpg':'mp4';
      const format={id:'0',selector:'fixture-video+fixture-audio',kind:scenario==='audio'?'audio':scenario==='image'?'image':'video',extension,sound:'with',quality:'Fixture',mode:scenario==='audio'?'mp3':scenario==='image'?'thumbnail':'merge'};
      const key=`cleanup-${scenario}`;engine.media.set(key,{title:`Cleanup ${scenario}`,source:`https://example.com/${key}`,keys:[`fixture:${key}`],created:Date.now(),thumbnail:true,formats:[format]});
      const id=await engine.addDraft({mediaId:key,formatId:'0',rightsConfirmed:true,allowDuplicate:true});
      const job=engine.jobs.find(j=>j.id===id);job.status='queued';await engine.pump();
      assert.equal(engine.active,null);assert.equal(job.cleanupWarning,undefined);
      for(const [name,bytes]of existing)assert.equal(await readFile(path.join(folder,name),'utf8'),bytes,'Existing user files must survive cleanup');
      assert.equal(await readFile(path.join(unrelated,'keep.txt'),'utf8'),'keep this directory');
      const expectedStatus=['failure','no-audio'].includes(scenario)?'failed':scenario==='cancel'?'cancelled':'completed';
      assert.equal(job.status,expectedStatus,job.error);
      const names=await readdir(folder);assert.deepEqual(names.sort(),[...existing.keys(),'.turbosave-existing',...(job.filePath?[path.basename(job.filePath)]:[])].sort());
      if(scenario==='no-audio')assert.match(job.error,/audio track/);
      if(scenario==='video'){
        const probe=JSON.parse(await realRun(engine.tool('ffprobe'),['-v','error','-show_entries','stream=codec_type','-of','json',job.filePath]));
        assert.ok(probe.streams.some(s=>s.codec_type==='video'));assert.ok(probe.streams.some(s=>s.codec_type==='audio'));assert.equal(path.extname(job.filePath),'.mp4');
      }
      checks.push({name:({video:'MP4 with sound keeps only the final output', 'no-audio':'Missing audio fails without saving a silent MP4',failure:'Failed transfer removes its temporary pieces',cancel:'Cancelled transfer removes its temporary pieces',audio:'Separate MP3 output survives cleanup',image:'Separate thumbnail output survives cleanup'})[scenario],passed:true});
    }
    return checks;
  }finally{engine.run=realRun;await engine.setFolder(previousFolder);}
}
