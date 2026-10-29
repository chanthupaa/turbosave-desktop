// SPDX-License-Identifier: GPL-3.0-only
import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat, lstat,statfs, copyFile, link, rm, mkdtemp, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { publicTarget, formatsFor, videoDetails, filename, safeError, allowedExtensions } from './media.mjs';
import {loadThumbnail,thumbnailCandidates} from './thumbnail.mjs';
import {PlaylistManager,playlistFormat} from './playlists.mjs';
import {ToolStore} from './tool-store.mjs';
import { startPublicProxy } from './public-proxy.mjs';
import { DuplicateLibrary,sourceKeys } from './duplicates.mjs';
import {ownedStage,createStage,cleanStage} from './job-stage.mjs';
import {transferArgs,createTransfer,updateTransfer} from './transfer.mjs';
import {ToolVerifier,engineNames} from './tool-verifier.mjs';
import {windowsSystemTool,isSystemTool} from './system-tools.mjs';
import engineManifest from '../build-resources/engines-manifest.json' with {type:'json'};
const unfinished = status => ['draft','queued','refreshing','downloading','processing','duplicate','paused','interrupted'].includes(status);
const stopped=job=>['cancelled','paused','interrupted'].includes(job.status);
export const defaultSettings={speedLimit:0,downloadProfile:'fast',theme:'system',dailyEngineChecks:true,minimizeToTray:false,notifications:false,releaseRepo:'chanthupaa/turbosave-desktop'};

export function processEnv() {
  return Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
}
export class LocalEngine extends EventEmitter {
  constructor({ toolsDir, stateDir, downloadsDir }) {
    super(); this.toolsDir=toolsDir; this.stateDir=stateDir; this.downloadsDir=downloadsDir;
    this.jobs=[];this.settings={...defaultSettings};this.onboardingComplete=false;this.ready=false;this.initializing=true; this.media=new Map(); this.children=new Set();this.active=null; this.inspecting=false; this.closing=false; this.lastWrite=Promise.resolve();
    this.library=new DuplicateLibrary({stateDir,tool:name=>this.tool(name),run:(...args)=>this.run(...args),runBytes:(file,args,options)=>this.run(file,args,{...options,asBuffer:true})});
    this.loadThumbnail=loadThumbnail;
    this.playlists=new PlaylistManager(this);this.toolOverrides={};this.toolStore=new ToolStore(this);
    this.verifier=new ToolVerifier();
    for(const name of engineNames){const record=engineManifest.engines[name];if(!record)throw Error('The trusted engine manifest is incomplete.');this.verifier.register(path.join(toolsDir,'bin',name+'.exe'),record.sha256,{size:record.bytes});}
  }
  tool(name) { return name==='yt-dlp'&&this.ytOverride?this.ytOverride:this.toolOverrides[name]||path.join(this.toolsDir,'bin',`${name}.exe`); }
  assertIdleForUpdate(){if(this.active||this.inspecting||this.children.size||this.maintenance)throw Error('Pause downloads and wait for source checks to finish before updating the engine.');}
  async loadDownloader(){
    try{const saved=JSON.parse(await readFile(path.join(this.stateDir,'engine-update.json'),'utf8'));if(saved.enabled===false)return;if(!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(saved.version)||!/^[a-f0-9]{64}$/.test(saved.sha256))throw Error();
      const file=path.join(this.stateDir,'engine-updates',`yt-dlp-${saved.version}.exe`),details=await lstat(file);if(!details.isFile()||details.isSymbolicLink()||details.size>80_000_000)throw Error();
      this.verifier.register(file,saved.sha256);await this.verifier.verify(file);this.ytOverride=file;
    }catch(error){if(error.code!=='ENOENT')this.engineUpdateWarning='The saved downloader could not be verified. Using the bundled engine.';}
  }
  async installDownloader(bytes,version,sha256){
    if(!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(version)||createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Invalid engine update.');
    const dir=path.join(this.stateDir,'engine-updates');await mkdir(dir,{recursive:true});const file=path.join(dir,`yt-dlp-${version}.exe`);
    try{await writeFile(file,bytes,{flag:'wx',mode:0o700});}catch(error){if(error.code!=='EEXIST')throw Error('This engine version could not be saved safely.');if(createHash('sha256').update(await readFile(file)).digest('hex')!==sha256){await rename(file,file+'.rejected-'+randomUUID());await writeFile(file,bytes,{flag:'wx',mode:0o700});}}
    this.verifier.register(file,sha256,{size:bytes.length});await this.verifier.verify(file);
    const actual=(await this.run(file,['--ignore-config','--version'],{timeout:20_000})).trim().split(/\r?\n/)[0];if(actual!==version)throw Error('The downloaded engine reported a different version.');
    const record=path.join(this.stateDir,'engine-update.json');await writeFile(record+'.tmp',JSON.stringify({enabled:true,version,sha256}),{mode:0o600});await rename(record+'.tmp',record);
    this.ytOverride=file;this.versions['yt-dlp']=version;this.engineUpdateWarning=null;
  }
  async useBundledDownloader(){
    this.assertIdleForUpdate();this.maintenance=true;this.changed();try{const file=path.join(this.toolsDir,'bin','yt-dlp.exe'),version=(await this.run(file,['--ignore-config','--version'],{timeout:20_000})).trim().split(/\r?\n/)[0];
      await writeFile(path.join(this.stateDir,'engine-update.json'),JSON.stringify({enabled:false}),{mode:0o600});this.ytOverride=null;this.versions['yt-dlp']=version;this.engineUpdateWarning=null;
    }finally{this.maintenance=false;this.changed();}
  }
  async init() {
    await mkdir(this.stateDir,{recursive:true}); await mkdir(this.downloadsDir,{recursive:true});
    let saved; try { saved=JSON.parse(await readFile(path.join(this.stateDir,'state.json'),'utf8')); } catch {}
    if([1,2].includes(saved?.version) && Array.isArray(saved.jobs))this.jobs=saved.jobs.slice(0,120).filter(j=>j && typeof j.id==='string' && typeof j.source==='string')
      .map((j,index)=>({...j,queueOrder:Number.isFinite(j.queueOrder)?j.queueOrder:saved.jobs.length-index,status:['draft','paused','completed','skipped','failed','cancelled'].includes(j.status)?j.status:'interrupted',progress:j.status==='completed'?100:j.progress||0,restartProcessing:j.restartProcessing||j.status==='processing',
        error:['draft','paused','completed','skipped','failed','cancelled'].includes(j.status)?j.error:'The app closed before this finished. Resume to check the source and recover available parts.'}));
    if(saved?.settings)this.settings=this.validSettings(saved.settings);
    if(typeof saved?.downloadsDir==='string' && path.isAbsolute(saved.downloadsDir))this.downloadsDir=saved.downloadsDir;
    this.onboardingComplete=typeof saved?.onboardingComplete==='boolean'?saved.onboardingComplete:Boolean([1,2].includes(saved?.version)&&typeof saved.downloadsDir==='string'&&path.isAbsolute(saved.downloadsDir));
    this.playlists.restore(saved?.playlists);
    await this.library.load();
    for(const job of this.jobs)if(job.stageName&&!['paused','interrupted'].includes(job.status))try{await cleanStage(job);delete job.cleanupWarning;}catch{job.cleanupWarning='A previous working folder is still in use. Close programs using it and try again.';}
    await this.loadDownloader();
    await this.toolStore.restore();
    this.proxy=await startPublicProxy(publicTarget);
    this.versions={};
    for(const [name,args] of [['yt-dlp',['--ignore-config','--version']],['ffmpeg',['-version']],['ffprobe',['-version']],['node',['--version']]]) {
      if(this.closing)break;
      try { this.versions[name]=(await this.run(this.tool(name),args,{timeout:20_000})).trim().split('\n')[0].slice(0,120); }
      catch { this.versions[name]='Not available'; }
      this.changed();
    }
    this.ready=!this.closing&&Object.keys(this.versions).length===4&&Object.values(this.versions).every(v=>v!=='Not available');
    this.initializing=false;
    this.changed();
  }
  elapsedMs(job){return Math.max(0,Number(job.elapsedMs)||0)+(this.active?.job.id===job.id&&Number.isFinite(this.active.startedAt)?Math.max(0,(this.active.stoppedAt||Date.now())-this.active.startedAt):0);}
  snapshot() { return { jobs:this.jobs.map(({format,sourceKeys,stageName,stageToken,...j})=>({...j,elapsedSeconds:Math.floor(this.elapsedMs(j)/1000),kind:format?.kind,resumable:['paused','interrupted'].includes(j.status)})),playlists:this.playlists.groups.map(g=>({...g,entries:g.entries.map(({source,...entry})=>entry)})),settings:{...this.settings},maintenance:Boolean(this.maintenance),toolStatus:this.toolStatus||null,engineUpdates:this.engineUpdates||null,engineUpdateWarning:this.engineUpdateWarning||null,downloadsDir:this.downloadsDir,onboardingComplete:this.onboardingComplete,ready:this.ready&&!this.maintenance,initializing:this.initializing,versions:this.versions,activeId:this.active?.job.id||null }; }
  changed() {for(const job of this.jobs)if(job.playlistGroup)this.playlists.sync(job);this.emit('state',this.snapshot()); }
  save() {
    for(const job of this.jobs)if(job.playlistGroup)this.playlists.sync(job);
    const text=JSON.stringify({version:2,downloadsDir:this.downloadsDir,onboardingComplete:this.onboardingComplete,settings:this.settings,jobs:this.jobs,playlists:this.playlists.groups},null,2);
    const file=path.join(this.stateDir,'state.json');
    this.lastWrite=this.lastWrite.catch(()=>{}).then(async()=>{await writeFile(`${file}.tmp`,text,{mode:0o600});await rename(`${file}.tmp`,file);});
    return this.lastWrite;
  }
  async checkFolder(folder) {
    if(typeof folder!=='string'||!path.isAbsolute(folder))throw new Error('Choose an absolute download folder.');
    await mkdir(folder,{recursive:true});if(!(await stat(folder)).isDirectory())throw new Error('Choose a folder.');
    const check=path.join(folder,`.turbosave-writecheck-${randomUUID()}.tmp`);
    let file;try{file=await open(check,'wx',0o600);}catch{throw new Error('TurboSave cannot save files in this folder. Choose another folder.');}
    finally{if(file){await file.close();await rm(check,{force:true});}}
  }
  async setFolder(folder) { await this.checkFolder(folder);const previous=this.downloadsDir;this.downloadsDir=folder;try{await this.save();}catch(error){this.downloadsDir=previous;throw error;}this.changed(); }
  async finishOnboarding() {
    if(this.initializing)throw new Error('Wait for the local engines to finish checking.');
    await this.checkFolder(this.downloadsDir);
    const previous=this.onboardingComplete;this.onboardingComplete=true;
    try{await this.save();}catch(error){this.onboardingComplete=previous;throw error;}
    this.changed();return this.snapshot();
  }
  async clearHistory() { this.jobs=this.jobs.filter(j=>unfinished(j.status)); await this.save(); this.changed(); }
  validSettings(value){return {speedLimit:Number.isInteger(value.speedLimit)&&value.speedLimit>=0&&value.speedLimit<=100_000_000?value.speedLimit:0,downloadProfile:['fast','balanced','gentle'].includes(value.downloadProfile)?value.downloadProfile:'fast',theme:['dark','light','system'].includes(value.theme)?value.theme:'system',dailyEngineChecks:value.dailyEngineChecks!==false,minimizeToTray:value.minimizeToTray===true,notifications:value.notifications===true,releaseRepo:typeof value.releaseRepo==='string'&&/^[\w-]{1,39}\/[\w.-]{1,100}$/.test(value.releaseRepo)?value.releaseRepo:''};}
  async setSettings(value){
    if(!value||typeof value!=='object')throw Error('Invalid preferences.');
    const next=this.validSettings({...this.settings,...value});if(value.releaseRepo&&next.releaseRepo!==value.releaseRepo)throw Error('Enter a GitHub repository as owner/repository.');
    if(value.speedLimit!==undefined&&next.speedLimit!==value.speedLimit)throw Error('Choose a valid speed limit.');
    if(value.downloadProfile!==undefined&&next.downloadProfile!==value.downloadProfile)throw Error('Choose a valid download profile.');
    if(value.theme!==undefined&&next.theme!==value.theme)throw Error('Choose a valid appearance.');
    this.settings=next;await this.save();this.changed();return this.settings;
  }
  pending(status='queued'){return this.jobs.filter(j=>j.status===status).sort((a,b)=>(a.queueOrder||0)-(b.queueOrder||0)||a.createdAt-b.createdAt);}
  nextOrder(){return Math.max(0,...this.jobs.map(j=>j.queueOrder||0))+1;}
  async move(id,direction){
    const job=this.jobs.find(j=>j.id===id&&['queued','draft'].includes(j.status));if(!job||!['up','down','first'].includes(direction))throw Error('Only waiting items can be reordered.');
    const items=this.pending(job.status),index=items.indexOf(job),other=items[index+(direction==='down'?1:-1)];
    if(direction==='first')job.queueOrder=(items[0].queueOrder||0)-1;else if(other)[job.queueOrder,other.queueOrder]=[other.queueOrder,job.queueOrder];
    await this.save();this.changed();
  }
  async pause(id){
    const job=this.jobs.find(j=>j.id===id);if(!job||!['queued','refreshing','downloading'].includes(job.status))throw Error('Only waiting or downloading items can be paused.');
    job.status='paused';job.speed=null;job.eta=null;job.message='Paused. Temporary parts are kept for resume.';
    if(this.active?.job.id===id)this.active.stoppedAt=Date.now();
    if(this.active?.job.id===id)this.kill(this.active.child);await this.save();this.changed();
  }
  async retry(id){
    if(this.closing||this.maintenance)throw Error('Wait for the app to be ready.');
    const job=this.jobs.find(j=>j.id===id);if(!job||!['failed','cancelled','paused','interrupted'].includes(job.status))throw Error('This item cannot be resumed or retried now.');
    if(job.playlistGroup){const group=this.playlists.groups.find(g=>g.id===job.playlistGroup);if(group?.status==='cancelled')throw Error('This playlist was cancelled. Load it again to create a new selection.');if(group?.status==='completed')group.status='running';}
    if(this.active?.job.id===id)throw Error('Wait for the current operation to stop, then resume.');
    if(this.jobs.filter(j=>j!==job&&unfinished(j.status)).length>=20)throw Error('The queue can hold 20 items.');
    job.status='queued';job.needsRefresh=true;job.error=null;job.message=null;job.filePath=null;job.queueOrder=this.nextOrder();await this.save();this.changed();void this.pump();
  }
  async refreshJob(job){
    if(stopped(job)||this.closing)return;
    job.status='refreshing';job.message='Checking the source for fresh download links…';this.changed();
    while(this.inspecting&&!stopped(job)&&!this.closing)await new Promise(resolve=>setTimeout(resolve,50));
    if(stopped(job)||this.closing)return;
    const result=await this.inspect(job.source,{preview:false,onSpawn:child=>{this.active.child=child;if(stopped(job))this.kill(child);}}),media=this.media.get(result.id),old=job.format;
    let format=old.mode==='playlist'?playlistFormat(media.formats,{kind:old.kind,height:old.targetHeight}):old.kind==='image'&&media.thumbnail?{...old}:media.formats.find(f=>f.selector===old.selector&&f.kind===old.kind&&f.mode===old.mode&&f.extension===old.extension&&f.height===old.height&&f.sound===old.sound);
    format||=media.formats.find(f=>f.kind===old.kind&&f.mode===old.mode&&f.extension===old.extension&&f.height===old.height&&f.sound===old.sound);
    if(!format)throw Error('The selected quality is no longer available. Fetch again and choose another format.');
    if(stopped(job))return;
    if(format.selector!==old.selector||job.restartProcessing){await cleanStage(job);job.progress=0;job.message='The source or processing state changed. Starting this quality again.';}
    if(stopped(job)||this.closing)return;
    job.format={...format};job.estimatedBytes=format.filesize||null;job.sourceKeys=media.keys;job.needsRefresh=false;job.restartProcessing=false;job.status='downloading';job.message=null;
    if(job.playlistGroup){job.title=media.title;job.formatLabel=[format.quality,format.extension.toUpperCase(),format.kind==='video'?'With sound':null].filter(Boolean).join(' · ');}
  }
  baseArgs() { return ['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist','--no-warnings','--no-progress',
    '--socket-timeout','25','--retries','2','--fragment-retries','2','--proxy',this.proxy.origin,
    '--downloader','native','--hls-prefer-native','--ffmpeg-location',path.dirname(this.tool('ffmpeg')),'--js-runtimes',`node:${this.tool('node')}`]; }
  async run(binary,args,{timeout=60_000,onLine,onSpawn,asBuffer=false}={}) {
    if(!path.isAbsolute(binary))throw Error('An absolute executable path is required.');
    if(!isSystemTool(binary)){
      await this.verifier.verify(binary);
      // yt-dlp starts FFmpeg and the JS runtime itself. Verify that toolchain too.
      if(binary===this.tool('yt-dlp')&&!args.includes('--version'))for(const name of ['ffmpeg','ffprobe','node'])await this.verifier.verify(this.tool(name));
    }
    if(this.closing)throw Error('TurboSave is closing.');
    return new Promise((resolve,reject)=>{
      const child=spawn(binary,args,{shell:false,windowsHide:true,cwd:path.dirname(binary),env:processEnv(),stdio:['ignore','pipe','pipe']});
      this.children.add(child);
      let output='',stderr='',pending='',bytes=0,failure=null;const buffers=[];
      const fail=error=>{if(!failure){failure=error;this.kill(child);}};
      const timer=setTimeout(()=>{const error=new Error('The operation timed out. Check your connection and try again.');error.retryable=true;fail(error);},timeout);
      if(!asBuffer)child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');onSpawn?.(child);
      child.stdout.on('data',chunk=>{
        if(failure)return;bytes+=Buffer.byteLength(chunk);if(bytes>12_000_000){fail(new Error('The source returned too much metadata.'));return;}
        if(asBuffer)buffers.push(chunk);
        else if(onLine){pending+=chunk; const lines=pending.split(/\r?\n/);pending=lines.pop();lines.forEach(onLine);}
        else output+=chunk;
      });
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12_000);});
      child.on('error',()=>fail(new Error('A bundled engine could not start. Reinstall TurboSave Desktop.')));
      child.on('close',code=>{this.children.delete(child);clearTimeout(timer);if(failure){reject(failure);return;}if(onLine&&pending)onLine(pending);if(code===0)resolve(asBuffer?Buffer.concat(buffers):output);else{const error=new Error(safeError(stderr));error.retryable=/timed out|connection.*(?:reset|refused|closed)|network.*unreachable|temporary failure|unable to resolve|name resolution/i.test(stderr);reject(error);}});
    });
  }
  kill(child) {
    if(!child?.pid || child.exitCode!==null)return;
    if(process.platform==='win32')execFile(windowsSystemTool('taskkill'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,cwd:path.dirname(windowsSystemTool('taskkill')),env:processEnv()},()=>{});
    else child.kill('SIGKILL');
  }
  async inspect(value,{preview=true,onSpawn,directory=this.downloadsDir}={}) {
    if(this.closing)throw new Error('TurboSave is closing.');
    if(this.maintenance)throw Error('Wait for the engine update to finish.');
    if(!this.ready)throw new Error('Bundled engines are missing. Run npm run tools:prepare before starting the source build.');
    if(this.inspecting)throw new Error('A link is already being checked.');
    this.inspecting=true;
    try {
      const {url}=await publicTarget(value);
      const raw=await this.run(this.tool('yt-dlp'),[...this.baseArgs(),'--dump-single-json','--skip-download','--',url.toString()],{timeout:75_000,onSpawn});
      const info=JSON.parse(raw);if(info._type==='playlist'||info.is_live||info.has_drm)throw new Error('Use a single public video or audio post. Live streams and DRM-protected media are not supported.');
      const formats=formatsFor(info); if(!formats.length)throw new Error('The source did not provide a downloadable video or audio format.');
      const id=randomUUID();
      const candidates=thumbnailCandidates(info),thumbnailUrl=candidates[0];
      const started=Date.now();let image=null,previewCandidate=-1;
      if(preview)for(const [index,candidate]of candidates.entries()){if(Date.now()-started>12_000)break;image=await this.loadThumbnail(candidate,{signal:AbortSignal.timeout(Math.max(1,Math.min(5000,12_000-(Date.now()-started))))}).catch(()=>null);if(image){previewCandidate=index;break;}}
      const item={id,source:url.toString(),title:String(info.title||'Public media').replace(/[\x00-\x1f]/g,'').slice(0,220),
        platform:String(info.extractor_key||info.extractor||url.hostname).slice(0,60),duration:Number.isFinite(Number(info.duration))&&Number(info.duration)>0?Number(info.duration):null,...videoDetails(info),formats,thumbnail:Boolean(thumbnailUrl),preview:image?.dataUrl||null,thumbnailFilesize:image?.mime==='image/jpeg'?image.bytes:null,keys:sourceKeys(info,url.toString()),created:Date.now()};
      this.media.set(id,item);
      item.thumbnailCandidates=candidates;item.previewCandidate=previewCandidate;
      for(const [key,m] of this.media)if(Date.now()-m.created>30*60_000)this.media.delete(key);
      while(this.media.size>30)this.media.delete(this.media.keys().next().value);
      const {keys,thumbnailCandidates:privateCandidates,previewCandidate:privateIndex,...publicItem}=item;
      return {...publicItem,duplicates:await this.library.known(keys,directory),formats:formats.map(({selector,...f})=>f)};
    } finally {this.inspecting=false;}
  }
  enqueue(selection) {return this.createJob(selection,'queued');}
  addDraft(selection) {return this.createJob(selection,'draft');}
  async createJob({mediaId,formatId,allowDuplicate=false,directory=this.downloadsDir},status) {
    if(this.closing)throw new Error('TurboSave is closing.');
    if(this.maintenance)throw Error('Wait for the engine update to finish.');
    const media=this.media.get(mediaId);
    if(!media || Date.now()-media.created>30*60_000)throw new Error('Fetch this link again for fresh formats.');
    const format=formatId==='thumbnail'&&media.thumbnail?{id:'thumbnail',extension:'jpg',kind:'image',mode:'thumbnail',quality:'Thumbnail',filesize:media.thumbnailFilesize||null,sizeEstimate:true}:media.formats.find(f=>f.id===formatId);
    if(!format)throw new Error('Choose an available format.');
    await this.checkFolder(directory);
    const keys=media.keys||sourceKeys({},media.source);
    if(allowDuplicate!==true){const matches=await this.library.known(keys,directory,format.kind);if(matches.length){const error=new Error('This media is already saved in the selected folder.');error.code='DUPLICATE_MEDIA';error.duplicates=matches;throw error;}}
    if(this.jobs.filter(j=>unfinished(j.status)).length>=20)throw new Error('Your batch and queue can hold 20 items. Remove an item or wait for a download to finish.');
    if(this.jobs.some(j=>(j.sourceKeys?.some(key=>keys.includes(key))||j.source===media.source)&&j.format?.selector===format.selector&&j.format?.kind===format.kind&&j.format?.extension===format.extension&&unfinished(j.status)))throw new Error('That format is already in your batch or queue.');
    const soundLabel=format.kind==='video'?{with:'With sound',without:'Without sound',unknown:'Sound not specified'}[format.sound]:null;
    const job={id:randomUUID(),source:media.source,title:media.title,platform:media.platform,format:{...format},formatLabel:[format.quality,format.extension.toUpperCase(),soundLabel].filter(Boolean).join(' · '),
      queueOrder:this.nextOrder(),estimatedBytes:format.filesize||null,sizeEstimate:format.sizeEstimate!==false,duration:media.duration||null,directory,sourceKeys:keys,allowDuplicate:allowDuplicate===true,status,progress:0,speed:null,eta:null,elapsedMs:0,downloadedBytes:0,totalBytes:null,createdAt:Date.now(),error:null,filePath:null};
    this.jobs.unshift(job);
    const live=this.jobs.filter(j=>unfinished(j.status));
    const history=this.jobs.filter(j=>!live.includes(j)).slice(0,100-live.length);
    this.jobs=[...live,...history].sort((a,b)=>b.createdAt-a.createdAt);
    await this.save();this.changed();if(status==='queued')void this.pump();return job.id;
  }
  async removeDraft(id) {
    const job=this.jobs.find(j=>j.id===id&&j.status==='draft');
    if(!job)throw new Error('This item has already started or was removed.');
    this.jobs=this.jobs.filter(j=>j!==job);await this.save();this.changed();
  }
  async updateDraft({id,directory}={}){
    const job=this.jobs.find(j=>j.id===id&&j.status==='draft');if(!job)throw Error('Only batch drafts can change folder.');
    await this.checkFolder(directory);if(job.status!=='draft')throw Error('This item already started.');job.directory=directory;await this.save();this.changed();
  }
  async retryPreview({id,skipCurrent=false}={}){
    const item=this.media.get(id);if(!item||Date.now()-item.created>30*60_000)throw Error('Fetch this link again.');
    const candidates=item.thumbnailCandidates||[];const start=skipCurrent?(item.previewCandidate??-1)+1:0;
    const started=Date.now();for(let index=start;index<candidates.length;index++){if(Date.now()-started>12_000)break;const image=await this.loadThumbnail(candidates[index],{signal:AbortSignal.timeout(Math.max(1,Math.min(5000,12_000-(Date.now()-started))))}).catch(()=>null);if(image){item.previewCandidate=index;item.preview=image.dataUrl;return {id,preview:image.dataUrl};}}
    return {id,preview:null};
  }
  async startBatch() {
    if(this.closing||!this.ready||this.maintenance)throw new Error('Wait for the local engines to be ready.');
    const drafts=this.jobs.filter(j=>j.status==='draft');if(!drafts.length)throw new Error('Add at least one link to your batch first.');
    for(const job of drafts)job.status='queued';
    try{await this.save();}catch(error){for(const job of drafts)job.status='draft';throw error;}
    this.changed();void this.pump();return drafts.map(j=>j.id);
  }
  async cancel(id) {
    const job=this.jobs.find(j=>j.id===id);if(!job||!unfinished(job.status))return;
    job.status='cancelled';job.error='Cancelled by you.';
    if(this.active?.job.id===id)this.active.stoppedAt=Date.now();
    if(this.active?.job.id===id){this.kill(this.active.child);this.active.resolveDuplicate?.('cancel');}else await cleanStage(job);
    await this.save();this.changed();
  }
  async askDuplicate(job,match){
    if(stopped(job))return 'cancel';job.status='duplicate';job.duplicate=match;job.message=match.message;await this.save();this.changed();
    if(stopped(job))return 'cancel';
    return new Promise(resolve=>{this.active.resolveDuplicate=resolve;});
  }
  resolveDuplicate({jobId,action}){
    if(!['keep-existing','save-copy'].includes(action))throw new Error('Choose whether to keep the existing file or save a copy.');
    if(this.active?.job.id!==jobId||this.active.job.status!=='duplicate'||!this.active.resolveDuplicate)throw new Error('This duplicate check has already been handled.');
    const resolve=this.active.resolveDuplicate;this.active.resolveDuplicate=null;resolve(action);
  }
  async keepExisting(job,match){
    const details=await this.library.regular(match.path);
    if(!details)throw new Error('The existing file was moved or removed. Fetch the link again.');
    if(details.size!==match.size||details.mtimeMs!==match.mtimeMs)throw new Error('The existing file changed while you were choosing. Fetch the link again to check it.');
    job.filePath=match.path;job.status='skipped';job.progress=100;job.message='Kept the existing file. No additional copy was saved.';job.error=null;
    await this.library.record(match.path,{keys:job.sourceKeys||[],kind:job.format.kind,quality:match.quality}).catch(()=>{});
  }
  async pump() {
    if(this.active||this.closing||this.maintenance)return;
    if(!this.pending().length)this.playlists.feed();
    const job=this.pending()[0];if(!job)return;
    this.active={job,child:null,startedAt:Date.now()};job.status='downloading';job.speed=null;job.eta=null;this.changed();
    const clock=setInterval(()=>this.changed(),1000);clock.unref();
    let stage;
    try {
      await this.save();
      if(stopped(job)||this.closing)return;const sourceCheckStarted=Date.now();if(job.needsRefresh)await this.refreshJob(job);job.sourceCheckMs=Date.now()-sourceCheckStarted;if(stopped(job)||this.closing)return;
      await mkdir(job.directory,{recursive:true});
      if(!job.allowDuplicate){const known=await this.library.known(job.sourceKeys||sourceKeys({},job.source),job.directory,job.format.kind);if(known.length){const action=await this.askDuplicate(job,known[0]);if(action==='cancel')return;if(action==='keep-existing'){await this.keepExisting(job,known[0]);return;}job.allowDuplicate=true;job.status='downloading';job.message=null;this.changed();}}
      const disk=await statfs(job.directory);const available=Number(disk.bavail)*Number(disk.bsize);
      if(available<Math.max(256_000_000,(job.format.filesize||0)*2))throw new Error('Not enough free disk space in the download folder.');
      stage=await ownedStage(job)||await createStage(job);await this.save();if(stopped(job))return;
      const transfer=createTransfer(job);
      job.message=null;job.downloadedBytes=0;job.totalBytes=null;this.changed();
      const args=[...this.baseArgs(),...transferArgs(this.settings),'--newline','--progress','--progress-template','download:TS_PROGRESS:%(progress)j',
        '--max-filesize','10G','--continue','--part','--windows-filenames','--output',path.join(stage,'media.%(ext)s'),'--no-write-info-json','--no-keep-video','--postprocessor-args','ffmpeg:-threads 2'];
      if(job.format.mode==='thumbnail')args.push('--skip-download','--write-thumbnail','--convert-thumbnails','jpg');
      else {
        args.push('--format',job.format.selector);
        if(job.format.mode==='merge')args.push('--merge-output-format',job.format.extension);
        if(job.format.mode==='mp3')args.push('--extract-audio','--audio-format','mp3','--audio-quality','192K');
      }
      args.push('--',job.source);
      const transferStarted=Date.now();await this.run(this.tool('yt-dlp'),args,{timeout:60*60_000,onSpawn:child=>{if(this.active?.job.id===job.id)this.active.child=child;if(stopped(job))this.kill(child);},
        onLine:line=>{if(stopped(job)||!line.startsWith('TS_PROGRESS:'))return;
          try {updateTransfer(job,JSON.parse(line.slice(12)),transfer);this.changed();}catch{}}});
      job.transferAndMergeMs=Date.now()-transferStarted;if(stopped(job))return;
      job.status='processing';job.progress=99;job.speed=null;job.eta=null;job.message='Verifying the finished file…';this.changed();
      const expected=`media.${job.format.extension}`;
      const names=await readdir(stage);if(!names.includes(expected))throw new Error('No complete output file was produced. Fetch the source again or choose another format.');
      const file=path.join(stage,expected);const details=await stat(file);if(!details.isFile()||!details.size)throw new Error('The source produced an empty file.');
      if(job.format.kind!=='image'){
        const probe=JSON.parse(await this.run(this.tool('ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',file],{timeout:30_000}));
        const streams=probe.streams||[];
        if(!streams.some(s=>s.codec_type===job.format.kind))throw new Error('The downloaded file does not contain the requested media type.');
        if(job.format.sound==='with'&&job.format.kind==='video'&&!streams.some(s=>s.codec_type==='audio'))throw new Error('The source did not deliver its promised audio track.');
        if(job.format.mode==='mp3'&&!streams.some(s=>s.codec_name==='mp3'))throw new Error('Audio conversion did not produce a valid MP3.');
      }
      if(stopped(job))return;
      job.message='Checking for an existing copy…';this.changed();
      const scan=await this.library.compare(file,job.directory,job.format.kind,{skipExisting:job.allowDuplicate,cancelled:()=>stopped(job),onSpawn:child=>{this.active.child=child;if(stopped(job))this.kill(child);},onProgress:(count,total,limited)=>{job.message=`Checking existing files (${count}/${total})…`;if(limited)job.scanNotice='Only the first 200 matching files in this folder were checked.';this.changed();}});
      if(stopped(job))return;
      if(scan.match&&!job.allowDuplicate){const action=await this.askDuplicate(job,scan.match);if(action==='cancel')return;if(action==='keep-existing'){await this.keepExisting(job,scan.match);return;}job.allowDuplicate=true;}
      job.status='processing';job.message=null;
      const basename=`${job.playlistIndex?String(job.playlistIndex).padStart(4,'0')+' - ':''}${filename(job.title)} - ${filename(job.format.quality)}`;
      for(let attempt=0;attempt<1000;attempt++) {
        const dest=path.join(job.directory,`${basename}${attempt?` (${attempt+1})`:''}.${job.format.extension}`);
        try {const started=Date.now();try{await link(file,dest);job.finalizeMethod='link';}catch(error){if(error.code==='EEXIST')throw error;await copyFile(file,dest,constants.COPYFILE_EXCL);job.finalizeMethod='copy';}job.finalizeMs=Date.now()-started;job.filePath=dest;break;}catch(error){if(error.code!=='EEXIST')throw error;}
      }
      if(!job.filePath)throw new Error('Could not choose a unique output filename.');
      if(stopped(job)){await rm(job.filePath,{force:true}).catch(()=>{});job.filePath=null;return;}
      await this.library.record(job.filePath,{keys:job.sourceKeys||sourceKeys({},job.source),kind:job.format.kind,quality:job.formatLabel,sha256:scan.sha256,signature:scan.signature},()=>stopped(job)).catch(()=>{job.message='Saved. Duplicate detection could not remember this file.';});
      if(stopped(job)){await rm(job.filePath,{force:true}).catch(()=>{});job.filePath=null;return;}
      job.status='completed';job.progress=100;job.speed=null;job.eta=null;job.completedAt=Date.now();
      this.playlists.sync(job);
    } catch(error) {if(!stopped(job)){if(error.retryable&&job.status==='downloading'&&stage){job.status='paused';job.message='Connection interrupted. Resume when your connection is available.';job.error=null;}else{job.status='failed';job.error=error.message;}}}
    finally {
      clearInterval(clock);this.active.stoppedAt||=Date.now();job.speed=null;job.eta=null;
      // Only remove the exact unique staging directory created for this job.
      if(stage&&!['paused','interrupted'].includes(job.status)){
        try{await cleanStage(job);}
        catch{job.cleanupWarning='The temporary download folder could not be removed. Close any program using it and remove this folder: '+stage;}
      }
      job.elapsedMs=this.elapsedMs(job);this.active=null;await this.save().catch(()=>{job.cleanupWarning='Queue changes could not be saved. Check disk space and folder permissions.';});this.changed();if(!this.closing)void this.pump();
    }
  }
  async close() {
    this.closing=true;
    if(this.active){this.active.stoppedAt=Date.now();const job=this.active.job;job.restartProcessing=job.status==='processing';job.status='interrupted';job.message='Stopped when the app closed. Resume to recover available parts.';this.active.resolveDuplicate?.('cancel');this.kill(this.active.child);}
    for(const child of this.children)this.kill(child);
    this.proxy?.close();
    const deadline=Date.now()+10_000;
    while((this.active||this.children.size)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    await this.save();await this.library.pending.catch(()=>{});
  }
}
