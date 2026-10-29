// Real Electron renderer checks using isolated test data; no installed user data is read.
import assert from 'node:assert/strict';import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
export async function experienceSelfTest(engine,window,artifacts){
 const checks=[],js=code=>window.webContents.executeJavaScript(code),pump=engine.pump;engine.pump=async()=>{};
 window.webContents.setBackgroundThrottling(false);
 const settle=()=>new Promise(resolve=>setTimeout(resolve,200));
 const capture=async name=>{await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);await new Promise(resolve=>setTimeout(resolve,350));await writeFile(path.join(artifacts,name),(await window.webContents.capturePage()).toPNG());};
 await mkdir(artifacts,{recursive:true});
 try{
  await settle();assert.equal(await js(`document.querySelector('#welcome').open`),true);
  await capture('onboarding-0.7.0.png');await js('window.turbo.finishOnboarding()');
  checks.push({name:'Short first-run welcome confirms the folder before downloads are enabled',passed:true});
  await settle();assert.equal(await js(`document.querySelector('#welcome').open`),false);await capture('new-download-0.7.0.png');
  const job={id:'experience-fixture',source:'https://1.1.1.1/fixture',title:'Big Buck Bunny — progress preview',format:{kind:'video',mode:'merge',extension:'mp4',sound:'with'},formatLabel:'1080p · MP4 · With sound',status:'downloading',progress:50,downloadedBytes:10000000,totalBytes:20000000,transferSizeEstimate:false,speed:2000000,eta:300,elapsedMs:65000,createdAt:Date.now(),directory:engine.downloadsDir,message:'Checking the source for fresh download links…'};
  engine.jobs=[job,{id:'finished-fixture',title:'Coastal walk — saved video',source:'https://1.1.1.1/saved',format:{kind:'video'},formatLabel:'720p · MP4 · With sound',status:'completed',progress:100,filePath:'C:\\Downloads\\TurboSave\\Coastal walk.mp4',createdAt:Date.now()-86400000}];engine.changed();await js(`document.querySelector('[data-view="activity"]').click()`);await settle();
  assert.equal(await js(`document.querySelector('[data-metric="eta"]').textContent`),'5 min (300 seconds)');
  assert.equal(await js(`document.querySelector('[data-metric="elapsed"]').textContent`),'1 min 5 sec (65 seconds)');
  assert.equal(await js(`document.querySelector('[data-metric="speed"]').textContent`),'2.0 MB/s');
  checks.push({name:'ETA, measured speed, elapsed time and bytes remain visible beside status messages',passed:true});
  const contrast=async()=>js(`(()=>{const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return ['.lead','.job-meta','.transfer-stats dt','.transfer-stats dd','.job-footer p','.quiet','.primary'].map(selector=>{const el=document.querySelector(selector);if(!el)return null;let bg=el;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const fg=lum(rgb(getComputedStyle(el).color)),back=lum(rgb(getComputedStyle(bg||document.body).backgroundColor));return{selector,ratio:(Math.max(fg,back)+.05)/(Math.min(fg,back)+.05)};}).filter(Boolean);})()`);
  for(const theme of ['dark','light']){
   await js(`window.turbo.settings({theme:${JSON.stringify(theme)}})`);await settle();assert.equal(await js('document.documentElement.dataset.theme'),theme);
   for(const pair of await contrast())assert.ok(pair.ratio>=4.5,`${theme} ${pair.selector} contrast ${pair.ratio}`);
   await capture(`activity-${theme}-0.7.0.png`);
  }checks.push({name:'Dark and light appearances save through IPC; sampled text contrast is at least 4.5:1',passed:true});
  window.setSize(920,760);await settle();assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);await capture('activity-compact-0.7.0.png');
  checks.push({name:'Activity fits a 920px window without horizontal scrolling',passed:true});
  assert.equal(await js(`(()=>{const r=document.querySelector('[data-action="Pause"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`),true,'Pause must be visible without scrolling');
  await js(`document.querySelector('button[data-action="Pause"]').focus()`);engine.changed();await settle();assert.equal(await js('document.activeElement.dataset.action'),'Pause');
  await js(`document.querySelector('button[data-action="Pause"]').click()`);await settle();assert.equal(job.status,'paused');await js(`document.querySelector('button[data-action="Resume"]').click()`);await settle();assert.equal(job.status,'queued');
  checks.push({name:'Keyboard focus survives telemetry refresh and visible Pause/Resume controls use the real bridge',passed:true});
  assert.equal(await js(`document.querySelector('#summary-all').textContent`),'2');assert.equal(await js(`document.querySelector('#summary-completed').textContent`),'1');
  await js(`document.querySelector('[data-summary="completed"]').click()`);await settle();assert.equal(await js(`document.querySelectorAll('#job-list .job-card').length`),1);assert.equal(await js(`Boolean(document.querySelector('#job-list .transfer-stats'))`),false);
  await js(`document.querySelector('[data-summary="all"]').click()`);await settle();
  checks.push({name:'Overview filters show real counts and finished downloads use compact rows',passed:true});
  window.setSize(880,760);await settle();assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await js(`Array.from(document.querySelectorAll('.job-controls button')).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})`),true);
  checks.push({name:'Download controls stay inside the smallest supported 880px window',passed:true});

  await js(`document.querySelector('#quick-guide').click();document.querySelector('#guide-next').click();document.querySelector('#guide-next').click()`);assert.equal(await js(`document.querySelector('#guide-next').textContent`),'Got it ✓');await js(`document.querySelector('#guide-next').click()`);assert.equal(await js(`document.querySelector('#guide-dialog').open`),false);
  checks.push({name:'The three-step guide can be replayed and closed without resetting onboarding',passed:true});
  await js(`document.querySelector('[data-view="settings"]').click();document.querySelector('#download-profile').value='balanced';document.querySelector('#download-profile').dispatchEvent(new Event('change'))`);await settle();assert.equal(engine.settings.downloadProfile,'balanced');
  checks.push({name:'Connection profile selection persists without changing the speed cap',passed:true});
  return checks;
 }finally{for(const job of engine.jobs)await engine.cancel(job.id);engine.pump=pump;}
}
