import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../ui/index.html',import.meta.url),'utf8');const script=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({welcome=false,duplicate=false,initialJobs=[],extraMedia={},initializing=false}={}){
  const dom=new JSDOM(html,{url:'https://turbosave.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  const {window:w}=dom;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  let state={jobs:initialJobs,downloadsDir:'C:\\Downloads\\TurboSave',ready:!initializing,initializing,onboardingComplete:!welcome,versions:{'yt-dlp':'fixture'},version:'0.3.0'},listener=()=>{};
  const media=new Map();const calls={single:[],drafts:[],starts:0,choose:0,finish:0,resolutions:[],cancelled:[],paused:[],retried:[],moves:[],settings:[]};let rejectFetch=false,finishError=false,folderChoice=null;
  const checkDuplicate=selection=>{if(duplicate&&!selection.allowDuplicate){const error=new Error('Already saved.');error.code='DUPLICATE_MEDIA';error.duplicates=[{name:'renamed.mp4',path:'C:\\Downloads\\TurboSave\\renamed.mp4',kind:'video',message:'This video is already saved here.'}];throw error;}};
  const emit=()=>listener(structuredClone(state));
  w.turbo={subscribe:fn=>{listener=fn;},state:async()=>structuredClone(state),
    chooseFolder:async()=>{calls.choose++;if(folderChoice){state.downloadsDir=folderChoice;emit();}return{directory:state.downloadsDir,changed:Boolean(folderChoice)};},
    finishOnboarding:async()=>{calls.finish++;if(finishError)throw Error('Choose a writable folder.');state.onboardingComplete=true;emit();return structuredClone(state);},
    inspect:async source=>{if(rejectFetch)throw Error('The source could not be reached.');const item={id:`media-${media.size}`,source,title:`Video ${media.size+1}`,platform:'Test',duration:5,thumbnail:true,formats:[{id:'720',quality:'720p',height:720,kind:'video',sound:'with',extension:'mp4',mode:'merge',filesize:12000000,sizeEstimate:true},{id:'1080',quality:'1080p',height:1080,kind:'video',sound:'with',extension:'mp4',mode:'merge',filesize:24000000,sizeEstimate:true}],...extraMedia};media.set(item.id,item);return item;},
    addDraft:async selection=>{checkDuplicate(selection);assert.equal(selection.rightsConfirmed,undefined);calls.drafts.push(selection);const item=media.get(selection.mediaId);const format=item.formats.find(f=>f.id===selection.formatId);state.jobs.unshift({id:`draft-${calls.drafts.length}`,status:'draft',title:item.title,source:item.source,formatLabel:`${format.quality} · MP4 · With sound`,estimatedBytes:format.filesize,sizeEstimate:format.sizeEstimate,directory:state.downloadsDir,createdAt:Date.now()});emit();return state.jobs[0].id;},
    removeDraft:async id=>{state.jobs=state.jobs.filter(j=>j.id!==id);emit();},startBatch:async()=>{calls.starts++;const ids=state.jobs.map(j=>j.id);state.jobs.forEach(j=>j.status='queued');emit();return ids;},
    download:async selection=>{checkDuplicate(selection);calls.single.push(selection);return 'single';},resolveDuplicate:async choice=>{calls.resolutions.push(choice);const job=state.jobs.find(j=>j.id===choice.jobId);job.status=choice.action==='keep-existing'?'skipped':'processing';job.filePath=job.duplicate.path;emit();},paste:async()=>'',openFolder:async()=>{},clearHistory:async()=>{},project:async()=>{},cancel:async id=>{calls.cancelled.push(id);state.jobs.find(j=>j.id===id).status='cancelled';emit();},reveal:async()=>{}};
  w.turbo.pause=async id=>{calls.paused.push(id);state.jobs.find(j=>j.id===id).status='paused';emit();};w.turbo.retry=async id=>{calls.retried.push(id);state.jobs.find(j=>j.id===id).status='queued';emit();};w.turbo.move=async(id,direction)=>{calls.moves.push({id,direction});};w.turbo.settings=async value=>{calls.settings.push(value);state.settings={...state.settings,...value};emit();};
  w.turbo.checkUpdates=async kind=>kind==='app'?{configured:false,message:'Add a release repository first.'}:{current:'2026.10.25',latest:'2026.10.26',available:true};
  w.eval(script);await tick();
  const composerIds=new Set(['#source-url','#link-form','#fetch','#paste','#result','#download','#format','#message','#media-thumbnail','#thumbnail-placeholder']);
  const $=s=>w.document.querySelector(composerIds.has(s)&&w.document.querySelector('[data-view="bulk"]').classList.contains('active')?'#batch-'+s.slice(1):s);const click=async selector=>{$(selector).click();await tick();await tick();};
  const fetch=async(source,quality)=>{$('#source-url').value=source;$('#link-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();$('#format').value=quality;$('#format').dispatchEvent(new w.Event('change'));};
  return {dom,$,calls,click,fetch,folder:value=>folderChoice=value,updateState:async value=>{Object.assign(state,value);emit();await tick();},failFetch:()=>rejectFetch=true,failFinish:()=>finishError=true};
}

test('Single, Batch and Playlist follow the saved default loaded after startup',async()=>{
 const f=await fixture({initializing:true});try{const doc=f.dom.window.document,saved='D:\\Saved videos';await f.updateState({downloadsDir:saved,initializing:false,ready:true});
 for(const selector of ['#view-download [data-folder]','#view-bulk [data-folder]','#settings-folder','#playlist-folder'])assert.equal(doc.querySelector(selector).textContent,saved,selector);
 await f.fetch('https://example.com/default','720');await f.click('#download');assert.equal(f.calls.single[0].directory,saved);
 }finally{f.dom.window.close();}
});
test('changing Settings updates inherited destinations and leaves existing draft destinations alone',async()=>{
 const f=await fixture();try{const doc=f.dom.window.document;await f.click('[data-view="bulk"]');await f.fetch('https://example.com/draft','720');await f.click('#download');const old=f.calls.drafts[0].directory;f.folder('D:\\New default');await f.click('#choose-folder');
 for(const selector of ['#view-download [data-folder]','#view-bulk [data-folder]','#settings-folder','#playlist-folder'])assert.equal(doc.querySelector(selector).textContent,'D:\\New default',selector);
 assert.equal(f.calls.drafts[0].directory,old);assert.match(doc.querySelector('#draft-list').textContent,/C:\\Downloads\\TurboSave/);
 }finally{f.dom.window.close();}
});
test('an explicit custom destination survives Settings changes and Use default restores inheritance',async()=>{
 const f=await fixture();try{const w=f.dom.window,doc=w.document;w.turbo.chooseFolder=async()=>({changed:true,directory:'D:\\One off'});await f.click('#view-download [data-choose-folder]');await f.updateState({downloadsDir:'E:\\New default'});
 assert.equal(doc.querySelector('#view-download [data-folder]').textContent,'D:\\One off');assert.equal(doc.querySelector('#view-bulk [data-folder]').textContent,'E:\\New default');assert.equal(doc.querySelector('#view-download .destination-picker strong').textContent,'Save to (custom)');
 await f.click('#view-download [data-default-folder]');assert.equal(doc.querySelector('#view-download [data-folder]').textContent,'E:\\New default');assert.equal(doc.querySelector('#view-download [data-default-folder]').hidden,true);
 await f.updateState({downloadsDir:'F:\\Latest default'});assert.equal(doc.querySelector('#view-download [data-folder]').textContent,'F:\\Latest default');
 }finally{f.dom.window.close();}
});
test('cancelling a folder choice preserves inheritance and independent Batch overrides',async()=>{
 const f=await fixture();try{const w=f.dom.window,doc=w.document;w.turbo.chooseFolder=async()=>({changed:true,directory:'D:\\Batch only'});await f.click('#view-bulk [data-choose-folder]');w.turbo.chooseFolder=async()=>({changed:false,directory:'C:\\Downloads\\TurboSave'});await f.click('#view-download [data-choose-folder]');await f.updateState({downloadsDir:'E:\\Default'});
 assert.equal(doc.querySelector('#view-download [data-folder]').textContent,'E:\\Default');assert.equal(doc.querySelector('#view-bulk [data-folder]').textContent,'D:\\Batch only');
 }finally{f.dom.window.close();}
});
test('welcome asks for a folder; cancel keeps it open; confirmation completes it',async()=>{
  const f=await fixture({welcome:true});try{
    assert.equal(f.$('#welcome').open,true);assert.equal(f.$('#fetch').disabled,true);
    await f.click('#welcome-choose');assert.equal(f.$('#welcome').open,true);assert.equal(f.calls.finish,0);
    f.folder('D:\\My saved videos');await f.click('#welcome-choose');assert.equal(f.$('#welcome-folder').textContent,'D:\\My saved videos');
    await f.click('#welcome-continue');assert.equal(f.$('#welcome').open,false);assert.equal(f.$('#fetch').disabled,false);assert.equal(f.calls.finish,1);
  }finally{f.dom.window.close();}
});
test('failed onboarding shows its error and does not unlock the downloader',async()=>{
  const f=await fixture({welcome:true});try{f.failFinish();await f.click('#welcome-continue');assert.equal(f.$('#welcome').open,true);assert.match(f.$('#welcome-error').textContent,/writable/);assert.equal(f.$('#fetch').disabled,true);}finally{f.dom.window.close();}
});
test('bulk reviews two links with different qualities before either starts downloading',async()=>{
  const f=await fixture();try{
    assert.equal(f.$('#welcome').open,false);await f.click('[data-view="bulk"]');
    assert.equal(f.$('#bulk-panel').hidden,false,'The batch review must be visible');
    await f.fetch('https://example.com/first','1080');await f.click('#download');
    assert.equal(f.$('#source-url').value,'');assert.equal(f.$('#result').hidden,true);assert.equal(f.$('#batch-total').textContent,'1');
    await f.fetch('https://example.com/second','720');await f.click('#download');
    assert.deepEqual(f.calls.drafts.map(s=>s.formatId),['1080','720']);assert.equal(f.calls.single.length,0);assert.equal(f.calls.starts,0);
    assert.equal(f.$('#draft-list').children.length,2);assert.match(f.$('#draft-list').textContent,/1080p/);assert.match(f.$('#draft-list').textContent,/720p/);assert.equal(f.$('#job-list').children.length,0);
    await f.click('#start-batch');assert.equal(f.calls.starts,1);assert.equal(f.$('#view-activity').hidden,false);assert.equal(f.$('#job-list').children.length,2);assert.equal(f.$('#draft-list').children.length,0);
  }finally{f.dom.window.close();}
});
test('failed next fetch preserves prior batch items and cannot add stale media',async()=>{
  const f=await fixture();try{await f.click('[data-view="bulk"]');await f.fetch('https://example.com/first','1080');await f.click('#download');
    f.failFetch();await f.fetch('https://example.com/failure','720');assert.equal(f.$('#download').disabled,true);assert.equal(f.$('#batch-total').textContent,'1');assert.match(f.$('#message').textContent,/could not be reached/);
    await f.click('#draft-list button[aria-label^="Remove"]');assert.equal(f.$('#batch-total').textContent,'0');assert.equal(f.$('#start-batch').disabled,true);
  }finally{f.dom.window.close();}
});
test('single-download mode still sends the chosen format directly to the queue',async()=>{
  const f=await fixture();try{await f.fetch('https://example.com/first','1080');assert.equal(f.$('#rights'),null);assert.equal(f.$('#download').disabled,false);await f.click('#download');assert.equal(f.calls.single.length,1);assert.equal(f.calls.single[0].formatId,'1080');assert.equal(f.calls.single[0].rightsConfirmed,undefined);assert.equal(f.calls.drafts.length,0);}finally{f.dom.window.close();}
});

test('fetched details show the preview, duration, views and creator and update storage with quality',async()=>{
  const f=await fixture({extraMedia:{creator:'Example creator',duration:3723,viewCount:0,uploadDate:'2026-10-27',description:'<script>plain text only</script>',preview:'data:image/png;base64,aGVsbG8='}});
  try{await f.fetch('https://example.com/first','1080');assert.equal(f.$('#media-duration').textContent,'62 min 3 sec (3723 seconds)');assert.equal(f.$('#media-views').textContent,'0');assert.match(f.$('#media-creator').textContent,/Example creator/);assert.equal(f.$('#media-description').textContent,'<script>plain text only</script>');assert.equal(f.$('#media-description script'),null);assert.ok(f.$('#media-thumbnail').src.startsWith('data:image/png;'));assert.match(f.$('#media-thumbnail').alt,/Video 1/);assert.equal(f.$('#storage-size').textContent,'~ 24.0 MB');
    f.$('#format').value='720';f.$('#format').dispatchEvent(new f.dom.window.Event('change'));assert.equal(f.$('#storage-size').textContent,'~ 12.0 MB');assert.match(f.$('#format').options[0].textContent,/12.0 MB/);
    await f.click('[data-kind="image"]');assert.equal(f.$('#storage-size').textContent,'Size unavailable');
  }finally{f.dom.window.close();}
});
test('missing metadata and blocked previews show honest fallbacks',async()=>{
  const f=await fixture({extraMedia:{duration:null,viewCount:null,preview:'https://untrusted.example/image.svg'}});
  try{await f.fetch('https://example.com/first','720');assert.equal(f.$('#media-duration').textContent,'Not reported');assert.equal(f.$('#media-views').textContent,'Not reported');assert.equal(f.$('#media-date').textContent,'Not reported');assert.equal(f.$('#media-thumbnail').hasAttribute('src'),false);assert.equal(f.$('#thumbnail-placeholder').hidden,false);}finally{f.dom.window.close();}
});

test('Activity shows a cleanup warning even when the finished media was saved',async()=>{
  const warning='Temporary folder is still in use: C:\\Downloads\\.turbosave-test';
  const f=await fixture({initialJobs:[{id:'finished',title:'Saved video',status:'completed',formatLabel:'720p MP4',createdAt:Date.now(),filePath:'C:\\Downloads\\finished.mp4',cleanupWarning:warning}]});
  try{assert.match(f.$('#job-list').textContent,/finished.mp4/);assert.equal(f.$('#job-list .error-text').textContent,warning);}
  finally{f.dom.window.close();}
});
test('history filters search titles and filenames and combine status with media type',async()=>{
 const f=await fixture({initialJobs:[{id:'a',title:'Forest walk',source:'https://example.com/a',status:'completed',kind:'video',filePath:'C:\\forest.mp4',createdAt:1},{id:'b',title:'Music',status:'failed',kind:'audio',createdAt:2}]});
 try{f.$('#history-search').value='forest.mp4';f.$('#history-search').dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.$('#job-list').children.length,1);assert.match(f.$('#job-list').textContent,/Forest walk/);f.$('#history-status').value='failed';f.$('#history-status').dispatchEvent(new f.dom.window.Event('change'));assert.equal(f.$('#job-list').children.length,0);assert.equal(f.$('#activity-empty').hidden,false);
 f.$('#history-search').value='';f.$('#history-search').dispatchEvent(new f.dom.window.Event('input'));f.$('#history-kind').value='audio';f.$('#history-kind').dispatchEvent(new f.dom.window.Event('change'));assert.match(f.$('#job-list').textContent,/Music/);
 }finally{f.dom.window.close();}
});
test('Activity pause, resume, reorder and Settings controls call only the narrow bridge',async()=>{
 const f=await fixture({initialJobs:[{id:'q',title:'Waiting',status:'queued',kind:'video',queueOrder:1,createdAt:1}]});
 const press=async text=>{[...f.dom.window.document.querySelectorAll('#job-list button')].find(b=>b.textContent===text).click();await tick();};
 try{await press('Next');assert.equal(f.calls.moves[0].direction,'first');await press('Pause');assert.deepEqual(f.calls.paused,['q']);await press('Resume');assert.deepEqual(f.calls.retried,['q']);
 f.$('#speed-limit').value='2000000';f.$('#speed-limit').dispatchEvent(new f.dom.window.Event('change'));await tick();assert.equal(f.calls.settings[0].speedLimit,2000000);f.$('#minimize-tray').checked=true;f.$('#minimize-tray').dispatchEvent(new f.dom.window.Event('change'));await tick();assert.equal(f.calls.settings[1].minimizeToTray,true);
 await f.click('#check-app-update');assert.match(f.$('#app-update-status').textContent,/release repository/);await f.click('#check-engine-update');assert.equal(f.$('#install-engine-update').disabled,false);
 }finally{f.dom.window.close();}
});
test('duplicate prompt defaults to keeping the existing file without creating another download',async()=>{
  const f=await fixture({duplicate:true});try{await f.fetch('https://example.com/renamed-video','1080');await f.click('#download');assert.equal(f.$('#duplicate-dialog').open,true);assert.equal(f.$('#duplicate-keep'),f.dom.window.document.activeElement);assert.equal(f.calls.single.length,0);
    await f.click('#duplicate-keep');assert.equal(f.$('#duplicate-dialog').open,false);assert.equal(f.calls.single.length,0);assert.equal(f.$('#download').disabled,false);
  }finally{f.dom.window.close();}
});
test('saving another copy requires an explicit decision, including in bulk mode',async()=>{
  const f=await fixture({duplicate:true});try{await f.click('[data-view="bulk"]');await f.fetch('https://example.com/renamed-video','720');await f.click('#download');assert.equal(f.calls.drafts.length,0);await f.click('#duplicate-save');
    assert.equal(f.calls.drafts.length,1);assert.equal(f.calls.drafts[0].allowDuplicate,true);assert.equal(f.$('#batch-total').textContent,'1');
  }finally{f.dom.window.close();}
});
test('a duplicate found by file content offers both decisions in Activity, and Cancel does not retry',async()=>{
  const job={id:'dup',title:'Renamed video',status:'duplicate',formatLabel:'720p MP4',createdAt:Date.now(),duplicate:{path:'C:\\Downloads\\old-name.mp4',message:'This looks like the same video.'}};
  const f=await fixture({initialJobs:[job]});try{await f.click('[data-view="activity"]');assert.match(f.$('#job-list').textContent,/old-name.mp4/);await f.click('.duplicate-actions button');
    assert.equal(f.calls.resolutions[0].action,'keep-existing');assert.match(f.$('#job-list').textContent,/Kept existing/);
  }finally{f.dom.window.close();}
  const cancelled=await fixture({initialJobs:[{...job,status:'duplicate'}]});try{await cancelled.click('[data-view="activity"]');await cancelled.click('.job-footer button');assert.deepEqual(cancelled.calls.cancelled,['dup']);assert.equal(cancelled.$('#view-activity').hidden,false);}finally{cancelled.dom.window.close();}
});

test('transfer stats stay visible beside source messages and show minutes plus total seconds',async()=>{
 const f=await fixture({initialJobs:[{id:'live',title:'Readable download',status:'downloading',formatLabel:'1080p MP4',createdAt:1,message:'Checking the source for fresh download links…',speed:2000000,eta:300,elapsedSeconds:65,downloadedBytes:10000000,totalBytes:20000000,progress:50}]});
 try{assert.equal(f.$('[data-metric="speed"]').textContent,'2.0 MB/s');assert.equal(f.$('[data-metric="eta"]').textContent,'5 min (300 seconds)');assert.equal(f.$('[data-metric="elapsed"]').textContent,'1 min 5 sec (65 seconds)');assert.match(f.$('[data-metric="bytes"]').textContent,/10.0 MB \/ 20.0 MB/);await f.click('[data-view="activity"]');const pause=f.$('button[data-action="Pause"]');pause.focus();await f.dom.window.turbo.settings({theme:'light'});assert.equal(f.$('button[data-action="Pause"]'),f.dom.window.document.activeElement);}finally{f.dom.window.close();}
});
test('zero seconds is not hidden and checking source does not show a stale percentage',async()=>{
 const f=await fixture({initialJobs:[{id:'zero',title:'Almost there',status:'downloading',createdAt:2,eta:0,speed:0},{id:'checking',title:'Refresh',status:'refreshing',createdAt:1,progress:45}]});
 try{assert.match(f.$('[data-job-id="zero"]').textContent,/0 sec \(0 seconds\)/);assert.match(f.$('[data-job-id="zero"]').textContent,/0 B\/s/);assert.equal(f.$('[data-job-id="checking"] progress').hasAttribute('value'),false);assert.match(f.$('[data-job-id="checking"] [data-metric="eta"]').textContent,/After source check/);}finally{f.dom.window.close();}
});
test('appearance, connection profile and short replayable guide work through the existing bridge',async()=>{
 const f=await fixture();try{assert.equal(f.$('#theme').value,'system');assert.equal(f.$('#theme-toggle'),null);assert.equal(f.$('#open-folder'),null);f.$('#theme').value='dark';f.$('#theme').dispatchEvent(new f.dom.window.Event('change'));await tick();assert.equal(f.dom.window.document.documentElement.dataset.theme,'dark');assert.equal(f.calls.settings[0].theme,'dark');f.$('#download-profile').value='gentle';f.$('#download-profile').dispatchEvent(new f.dom.window.Event('change'));await tick();assert.equal(f.calls.settings[1].downloadProfile,'gentle');await f.click('#settings-guide');assert.equal(f.$('#guide-dialog').open,true);assert.match(f.$('#guide-title').textContent,/link/);await f.click('#guide-next');assert.match(f.$('#guide-step').textContent,/2 \/ 3/);await f.click('#guide-next');assert.match(f.$('#guide-description').textContent,/elapsed/);await f.click('#guide-next');assert.equal(f.$('#guide-dialog').open,false);}finally{f.dom.window.close();}
});

test('download overview filters local history and keeps finished rows compact',async()=>{
 const f=await fixture({initialJobs:[
  {id:'live',title:'Downloading video',status:'downloading',kind:'video',createdAt:3,progress:40,speed:700000},
  {id:'saved',title:'Saved audio',status:'completed',kind:'audio',createdAt:2,filePath:'C:\\Downloads\\audio.mp3'},
  {id:'failed',title:'Failed download',status:'failed',kind:'video',createdAt:1}
 ]});
 try{
  assert.equal(f.$('#summary-all').textContent,'3');assert.equal(f.$('#summary-active').textContent,'1');assert.equal(f.$('#summary-completed').textContent,'1');
  await f.click('[data-summary="completed"]');assert.equal(f.$('#history-status').value,'completed');assert.equal(f.$('#job-list').children.length,1);assert.match(f.$('#job-list').textContent,/Saved audio/);assert.equal(f.$('#job-list .transfer-stats'),null);
  await f.click('[data-summary="active"]');assert.equal(f.$('#job-list').children.length,1);assert.match(f.$('[data-metric="speed"]').textContent,/700 KB\/s/);
  await f.click('[data-summary="all"]');assert.equal(f.$('#job-list').children.length,3);assert.equal(f.calls.cancelled.length,0);
 }finally{f.dom.window.close();}
});
test('single and batch use distinct DOM controls and retain exact independent selections',async()=>{
 const f=await fixture();try{const doc=f.dom.window.document;await f.fetch('https://example.com/single','1080');await f.click('[data-view="bulk"]');assert.equal(doc.querySelector('#batch-source-url').value,'');assert.equal(doc.querySelector('#batch-result').hidden,true);await f.fetch('https://example.com/batch','720');assert.equal(doc.querySelector('#source-url').value,'https://example.com/single');assert.equal(doc.querySelector('#format').value,'1080');await f.click('[data-view="download"]');assert.equal(doc.querySelector('#batch-format').value,'720');assert.equal(doc.querySelector('#view-bulk').hidden,true);assert.equal(doc.querySelector('.workflow-switch'),null);assert.ok(doc.querySelector('.nav-settings'));}finally{f.dom.window.close();}
});
test('a pending single fetch cannot overwrite the Batch workspace after navigation',async()=>{
 const f=await fixture();try{const w=f.dom.window,doc=w.document,original=w.turbo.inspect;let resolve;w.turbo.inspect=source=>new Promise(done=>{resolve=async()=>done(await original(source));});doc.querySelector('#source-url').value='https://example.com/slow';doc.querySelector('#link-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await f.click('[data-view="bulk"]');doc.querySelector('#batch-source-url').value='https://example.com/not-fetched';await resolve();await tick();assert.equal(doc.querySelector('#batch-result').hidden,true);assert.equal(doc.querySelector('#batch-source-url').value,'https://example.com/not-fetched');assert.equal(doc.querySelector('#result').hidden,false);}finally{f.dom.window.close();}
});
test('a one-off destination can be chosen without changing the default folder',async()=>{
 const f=await fixture();try{const w=f.dom.window;let options;w.turbo.chooseFolder=async value=>{options=value;return {changed:true,directory:'D:\\One off'};};await f.fetch('https://example.com/destination','720');await f.click('#view-download [data-choose-folder]');assert.equal(options.makeDefault,false);assert.match(f.$('#destination').textContent,/One off/);await f.click('#download');assert.equal(f.calls.single[0].directory,'D:\\One off');assert.equal(f.$('#settings-folder').textContent,'C:\\Downloads\\TurboSave');}finally{f.dom.window.close();}
});
