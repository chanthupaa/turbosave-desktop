// Offline renderer QA. Generated image and fixture metadata; no remote media transfer.
import path from 'node:path';import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {imagePreview} from './thumbnail.mjs';
export async function detailsSelfTest(engine,window,artifacts){
  window.webContents.setBackgroundThrottling(false);await mkdir(artifacts,{recursive:true});const originalRun=engine.run.bind(engine),originalPreview=engine.loadThumbnail;
  const picture=path.join(engine.stateDir,'generated-preview.jpg');
  await originalRun(engine.tool('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=1:duration=1','-frames:v','1','-threads','2',picture]);
  const preview=imagePreview(await readFile(picture));
  const metadata={id:'generated-preview',title:'Generated sample — preview test',extractor_key:'TurboSaveFixture',channel:'TurboSave test fixture',duration:125,view_count:1234567,like_count:4200,upload_date:'20261027',description:'Generated media for an offline interface check. Estimates include the selected video and audio tracks.',thumbnail:'https://1.1.1.1/fixture-thumbnail.jpg',formats:[
    ...[720,1080].map((height,index)=>({format_id:`v${height}`,height,width:height*16/9,ext:'mp4',vcodec:'avc1',acodec:'none',filesize:(index+1)*12000000,url:'https://1.1.1.1/fixture-video'})),
    {format_id:'a',ext:'m4a',vcodec:'none',acodec:'aac',abr:128,filesize:2000000,url:'https://1.1.1.1/fixture-audio'}]};
  engine.run=(binary,args,options)=>binary===engine.tool('yt-dlp')&&args.includes('--dump-single-json')?Promise.resolve(JSON.stringify(metadata)):originalRun(binary,args,options);
  engine.loadThumbnail=async()=>preview;const checks=[],js=source=>window.webContents.executeJavaScript(source);
  try{
    await js(`(async()=>{await window.turbo.finishOnboarding();document.querySelector('#source-url').value='https://1.1.1.1/generated-fixture';document.querySelector('#link-form').requestSubmit();const deadline=Date.now()+8000;while(document.querySelector('#result').hidden){if(Date.now()>deadline)throw Error(document.querySelector('#message').textContent);await new Promise(r=>setTimeout(r,25));}while(!document.querySelector('#media-thumbnail').naturalWidth){if(Date.now()>deadline)throw Error('Thumbnail did not decode');await new Promise(r=>setTimeout(r,25));}})()`);
    const details=await js(`({title:document.querySelector('#media-title').textContent,duration:document.querySelector('#media-duration').textContent,views:document.querySelector('#media-views').textContent,expectedViews:(1234567).toLocaleString(),creator:document.querySelector('#media-creator').textContent,image:document.querySelector('#media-thumbnail').naturalWidth,logo:document.querySelector('img.brand-icon').naturalWidth,welcomeLogo:document.querySelector('img.welcome-mark').naturalWidth,checkbox:Boolean(document.querySelector('#rights')),enabled:!document.querySelector('#download').disabled,size:document.querySelector('#storage-size').textContent})`);
    assert.equal(details.duration,'2 min 5 sec (125 seconds)');assert.equal(details.views,details.expectedViews);assert.match(details.creator,/TurboSave test fixture/);assert.equal(details.image,640);assert.equal(details.checkbox,false);assert.equal(details.enabled,true);assert.equal(details.size,'~ 26.0 MB');
    assert.equal(details.logo,256,'The official logo must load in the packaged sidebar');assert.equal(details.welcomeLogo,256,'The welcome screen must use the same logo');
    checks.push({name:'Fetched thumbnail, duration, views and creator render through the real preload bridge',passed:true},{name:'Download is enabled without an ownership checkbox',passed:true});
    await js(`document.querySelector('#result').scrollIntoView({block:'start'});`);await new Promise(resolve=>setTimeout(resolve,500));
    await writeFile(path.join(artifacts,'details-preview.png'),(await window.webContents.capturePage()).toPNG());
    window.setSize(920,820);await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
    await writeFile(path.join(artifacts,'details-preview-compact.png'),(await window.webContents.capturePage()).toPNG());
    checks.push({name:'Details layout has no horizontal overflow at 920px',passed:true});
    await js(`document.querySelector('#format').value=[...document.querySelector('#format').options].find(o=>o.textContent.startsWith('720p')).value;document.querySelector('#format').dispatchEvent(new Event('change'));`);
    assert.equal(await js(`document.querySelector('#storage-size').textContent`),'~ 14.0 MB');checks.push({name:'Changing quality updates the merged video-plus-audio estimate',passed:true});
    await js(`document.querySelector('[data-kind="audio"]').click();document.querySelector('#format').value=[...document.querySelector('#format').options].find(o=>o.textContent.includes('Converted MP3')).value;document.querySelector('#format').dispatchEvent(new Event('change'));`);
    assert.equal(await js(`document.querySelector('#storage-size').textContent`),'~ 3.0 MB');
    await js(`document.querySelector('[data-kind="image"]').click();`);assert.notEqual(await js(`document.querySelector('#storage-size').textContent`),'Size unavailable');checks.push({name:'Separate MP3 and thumbnail size estimates remain available',passed:true});
    await js(`document.querySelector('[data-view="bulk"]').click();document.querySelector('#batch-source-url').value='https://1.1.1.1/generated-fixture';document.querySelector('#batch-link-form').requestSubmit();`);
    const loaded=Date.now()+5000;while(await js(`document.querySelector('#batch-result').hidden`)){if(Date.now()>loaded)throw Error('Batch metadata did not load');await new Promise(resolve=>setTimeout(resolve,25));}await js(`document.querySelector('#batch-download').click()`);
    const deadline=Date.now()+3000;while(!engine.jobs.some(job=>job.status==='draft')){if(Date.now()>deadline)throw Error('Draft was not added');await new Promise(resolve=>setTimeout(resolve,25));}
    assert.equal(engine.jobs[0].estimatedBytes,26000000);assert.equal(engine.active,null);checks.push({name:'Bulk draft preserves the estimate and waits for explicit Start',passed:true});
    return checks;
  }finally{engine.run=originalRun;engine.loadThumbnail=originalPreview;}
}
