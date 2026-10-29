import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {LocalEngine,defaultSettings} from '../src/engine.mjs';import {playlistFormat,playlistSource} from '../src/playlists.mjs';import {thumbnailCandidates} from '../src/thumbnail.mjs';import {UpdateService,newer} from '../src/updates.mjs';
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'turbosave-08-'));const engine=new LocalEngine({stateDir:root,toolsDir:root,downloadsDir:path.join(root,'downloads')});engine.run=async()=> '2026.10.26';await engine.init();engine.pump=async()=>{};return{root,engine};}
test('new defaults follow device, High profile and unlimited speed; old explicit preferences survive migration',async()=>{
 assert.equal(defaultSettings.theme,'system');assert.equal(defaultSettings.downloadProfile,'fast');assert.equal(defaultSettings.speedLimit,0);
 const {root,engine}=await fixture();await engine.setSettings({theme:'dark',speedLimit:1000000,dailyEngineChecks:false});await engine.close();
 const next=new LocalEngine({stateDir:root,toolsDir:root,downloadsDir:root});next.run=async()=> 'fixture';await next.init();assert.equal(next.settings.theme,'dark');assert.equal(next.settings.speedLimit,1000000);assert.equal(next.settings.dailyEngineChecks,false);await next.close();
});
test('per-job folder and draft edits do not change the default or prior jobs',async()=>{
 const {root,engine}=await fixture(),destination=path.join(root,'one-off');engine.media.set('m',{source:'https://1.1.1.1/test',title:'Test',created:Date.now(),formats:[{id:'1',selector:'18',kind:'video',extension:'mp4',quality:'360p'}]});
 const id=await engine.addDraft({mediaId:'m',formatId:'1',directory:destination});assert.notEqual(engine.downloadsDir,destination);assert.equal(engine.jobs[0].directory,destination);
 await engine.updateDraft({id,directory:path.join(root,'edited')});assert.equal(engine.jobs[0].directory,path.join(root,'edited'));await engine.startBatch();await assert.rejects(()=>engine.updateDraft({id,directory:root}),/Only batch drafts/);await engine.close();
});
test('thumbnail candidates are bounded; failed primary uses alternate without blocking formats',async()=>{
 assert.deepEqual(thumbnailCandidates({thumbnail:'https://1.1.1.1/a',thumbnails:[{url:'http://1.1.1.1/no'},{url:'https://1.1.1.1/b'},{url:'https://1.1.1.1/a'}]}),['https://1.1.1.1/a','https://1.1.1.1/b']);
 const {engine}=await fixture();engine.run=async()=>JSON.stringify({title:'Thumbnail sample',thumbnail:'https://1.1.1.1/a',thumbnails:[{url:'https://1.1.1.1/b'}],formats:[{format_id:'18',url:'https://1.1.1.1/file',ext:'mp4',vcodec:'h264',acodec:'aac'}]});const visited=[];
 engine.loadThumbnail=async url=>{visited.push(url);if(url.endsWith('/a'))throw Error('Unavailable');return {dataUrl:'data:image/jpeg;base64,/9j/',mime:'image/jpeg',bytes:3};};
 const result=await engine.inspect('https://1.1.1.1/source');assert.ok(result.preview);assert.equal(visited.length,2);assert.equal(result.thumbnailCandidates,undefined);assert.equal((await engine.retryPreview({id:result.id})).id,result.id);await engine.close();
});
test('playlist quality caps never upscale or choose silent formats; MP3 is explicit',()=>{
 const formats=[{id:'silent',kind:'video',height:1080,sound:'without'},{id:'4k',kind:'video',height:2160,sound:'with',extension:'mp4'},{id:'720',kind:'video',height:720,sound:'with',extension:'mp4'},{id:'audio',kind:'audio',mode:'mp3'}];
 assert.equal(playlistFormat(formats,{kind:'video',height:1080}).id,'720');assert.equal(playlistFormat(formats,{kind:'video',height:0}).id,'4k');assert.equal(playlistFormat(formats,{kind:'video',height:480}),undefined);assert.equal(playlistFormat(formats,{kind:'audio'}).id,'audio');
 assert.equal(playlistSource('https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890'),'https://www.youtube.com/playlist?list=PL1234567890');assert.throws(()=>playlistSource('https://evil.invalid/?list=PL1234567890'));
});
test('playlist pagination uses flat enumeration, persists >20 entries separately and restores paused',async()=>{
 const {root,engine}=await fixture();const seen=[];engine.run=async(_binary,args)=>{seen.push(args);const page=args[args.indexOf('--playlist-items')+1].startsWith('1:')?0:100;return JSON.stringify({title:'A large playlist',entries:Array.from({length:page?5:100},(_,i)=>({id:String(page+i).padStart(11,'0'),title:`Item ${page+i}`}))});};
 const first=await engine.playlists.inspect({source:'https://www.youtube.com/playlist?list=PL1234567890'});assert.equal(first.entries.length,100);assert.equal(first.hasMore,true);assert.ok(seen[0].includes('--flat-playlist'));assert.ok(!seen[0].includes('--no-playlist'));
 const second=await engine.playlists.inspect({id:first.id,offset:100});assert.equal(second.entries.length,105);assert.equal(second.hasMore,false);assert.equal(second.entries[0].source,undefined);
 const groupId=await engine.playlists.start({id:first.id,keys:second.entries.map(e=>e.key),directory:engine.downloadsDir,kind:'video',height:1080});assert.equal(engine.jobs.length,0);
 engine.playlists.feed();assert.equal(engine.jobs.length,1);assert.equal(engine.jobs[0].playlistIndex,1);await engine.save();await engine.close();
 const next=new LocalEngine({stateDir:root,toolsDir:root,downloadsDir:root});next.run=async()=> 'fixture';await next.init();assert.equal(next.playlists.groups[0].id,groupId);assert.equal(next.playlists.groups[0].entries.length,105);assert.equal(next.playlists.groups[0].status,'paused');assert.equal(next.jobs[0].status,'interrupted');assert.equal(next.playlists.groups[0].entries.filter(e=>e.status==='pending').length,104);await next.close();
});
test('playlist cancel preserves history and prevents new feeder jobs',async()=>{
 const {engine}=await fixture();engine.playlists.previews.set('p',{created:Date.now(),title:'List',source:'https://www.youtube.com/playlist?list=PL1234567890',entries:[{key:'1',index:1,title:'A',available:true,source:'https://www.youtube.com/watch?v=abcdefghijk'},{key:'2',index:2,title:'B',available:true,source:'https://www.youtube.com/watch?v=12345678901'}]});
 const id=await engine.playlists.start({id:'p',keys:['1','2']});engine.playlists.feed();await engine.playlists.control(id,'pause');assert.equal(engine.jobs[0].status,'paused');await engine.playlists.control(id,'cancel');assert.equal(engine.playlists.groups[0].status,'cancelled');engine.playlists.feed();assert.equal(engine.jobs.length,1);assert.ok(engine.playlists.groups[0].entries.every(e=>e.status==='cancelled'));await engine.close();
});
test('daily metadata checks are cached, disabled checks are quiet and missing engine can update',async()=>{
 const {engine}=await fixture();let checks=0;const updates=new UpdateService({engine,appVersion:'0.8.0-beta.1'});updates.check=async kind=>{checks++;return {kind,latest:'1',available:false};};await updates.dailyCheck();await updates.dailyCheck();assert.equal(checks,3);engine.settings.dailyEngineChecks=false;await updates.dailyCheck();assert.equal(checks,3);await updates.dailyCheck({force:true});assert.equal(checks,6);assert.equal(newer('0.8.0','0.8.0-beta.1'),true);await engine.close();
});
test('FFmpeg updates reject bad archive hashes before any executable can run; restore rejects tampering',async()=>{
 const {root,engine}=await fixture();let ran=0;engine.run=async()=>{ran++;return 'fixture';};await assert.rejects(()=>engine.toolStore.install('ffmpeg',Buffer.from('bad'),{version:'9.0.2',sha256:'0'.repeat(64)}),/verification/);assert.equal(ran,0);
 const folder='ffmpeg-fixture';await mkdir(path.join(root,'managed-tools',folder),{recursive:true});const files=[];for(const name of ['ffmpeg','ffprobe']){const bytes=Buffer.from('MZ'+name);await writeFile(path.join(root,'managed-tools',folder,name+'.exe'),bytes);files.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(path.join(root,'tools-state.json'),JSON.stringify({ffmpeg:{enabled:true,folder,files}}));await engine.toolStore.restore();assert.ok(engine.tool('ffmpeg').includes(folder));engine.toolOverrides={};await writeFile(path.join(root,'managed-tools',folder,'ffprobe.exe'),'tampered');await engine.toolStore.restore();assert.equal(engine.tool('ffmpeg'),path.join(root,'bin','ffmpeg.exe'));assert.match(engine.engineUpdateWarning,/verification/);await engine.close();
});
test('failed playlist entries can retry even after working history was cleared',async()=>{
 const {engine}=await fixture();engine.playlists.groups=[{id:'g',status:'completed',preference:{kind:'video',height:1080},directory:engine.downloadsDir,entries:[{key:'1',index:1,title:'Retry me',status:'failed',source:'https://www.youtube.com/watch?v=abcdefghijk',jobId:'cleared'}]}];
 await engine.playlists.retryEntry('g','1');assert.equal(engine.playlists.groups[0].entries[0].status,'pending');engine.playlists.feed();assert.equal(engine.jobs[0].needsRefresh,true);assert.notEqual(engine.jobs[0].id,'cleared');await engine.close();
});
test('repair covers a missing FFprobe pair, and interrupted tool installation never activates it',async()=>{
 const {engine}=await fixture();engine.versions={'yt-dlp':'2026.10.26',ffmpeg:'ffmpeg version 9.0.2',ffprobe:'Not available',node:'v24.22.1'};const updates=new UpdateService({engine,appVersion:'0.8.0-beta.1'}),calls=[];updates.installTool=async(kind,options)=>{calls.push([kind,options.force]);engine.versions.ffprobe='ffprobe version 9.0.2';};await updates.repair();assert.deepEqual(calls,[['ffmpeg',true]]);assert.equal(engine.ready,true);
 const bytes=Buffer.from('test archive'),sha256=createHash('sha256').update(bytes).digest('hex');engine.run=async()=>{throw Error('Interrupted extraction');};await assert.rejects(()=>engine.toolStore.install('ffmpeg',bytes,{version:'9.0.2',sha256}),/Interrupted/);assert.equal(engine.toolStore.records.ffmpeg,undefined);assert.equal(engine.tool('ffmpeg'),path.join(engine.toolsDir,'bin','ffmpeg.exe'));await engine.close();
});
