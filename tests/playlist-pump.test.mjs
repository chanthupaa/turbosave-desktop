import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,copyFile,readdir} from 'node:fs/promises';import {existsSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {LocalEngine} from '../src/engine.mjs';
test('playlist feeder resolves fresh formats, skips unavailable quality and saves ordered verified outputs',{timeout:90_000,skip:!existsSync(path.resolve('vendor/bin/ffmpeg.exe'))},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-playlist-pump-')),engine=new LocalEngine({toolsDir:path.resolve('vendor'),stateDir:dir,downloadsDir:path.join(dir,'downloads')});
 try{
  await engine.init();assert.equal(engine.ready,true,JSON.stringify(engine.versions));const original=engine.run.bind(engine),fixture=path.join(dir,'source.mp4');await original(engine.tool('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=12:duration=1','-f','lavfi','-i','sine=frequency=400:duration=1','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-shortest',fixture]);
  let inspections=0;engine.run=async(binary,args,options)=>{
   if(binary!==engine.tool('yt-dlp'))return original(binary,args,options);
   if(args.includes('--dump-single-json')){inspections++;const missing=args.at(-1).endsWith('/2');return JSON.stringify({id:args.at(-1),title:'Playlist test '+inspections,formats:[{format_id:'v',ext:'mp4',height:missing?2160:360,vcodec:'h264',acodec:'aac',url:'https://1.1.1.1/media',filesize:50000}]});}
   const target=args[args.indexOf('--output')+1].replace('%(ext)s','mp4');await copyFile(fixture,target);return '';
  };
  engine.on('state',state=>{const duplicate=state.jobs.find(j=>j.status==='duplicate');if(duplicate)queueMicrotask(()=>{try{engine.resolveDuplicate({jobId:duplicate.id,action:'save-copy'});}catch{}});});
  engine.playlists.previews.set('p',{created:Date.now(),title:'Pipeline list',source:'https://www.youtube.com/playlist?list=PL1234567890',entries:[1,2,3].map(index=>({key:String(index),index,title:'Entry '+index,available:true,source:'https://1.1.1.1/'+index}))});
  const id=await engine.playlists.start({id:'p',keys:['1','2','3'],height:1080});
  const deadline=Date.now()+60_000;while(engine.playlists.groups.find(g=>g.id===id).status!=='completed'||engine.active){if(Date.now()>deadline)throw Error('Playlist did not finish and clean up');await new Promise(r=>setTimeout(r,25));}
  const group=engine.playlists.groups[0];assert.deepEqual(group.entries.map(e=>e.status),['completed','failed','completed']);assert.equal(inspections,3);assert.match(group.entries[0].filePath,/0001 - /);assert.match(group.entries[2].filePath,/0003 - /);assert.ok(!(await readdir(engine.downloadsDir)).some(n=>n.startsWith('.turbosave-')));assert.ok(engine.jobs.filter(j=>j.status==='completed').every(j=>j.format.sound==='with'));
 }finally{await engine.close();}
});
