// SPDX-License-Identifier: GPL-3.0-only
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu,Tray,Notification,nativeImage } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {APP_ID,APP_NAME,taskbarDetails} from './branding.mjs';
import { LocalEngine } from './engine.mjs';
import { assertTrustedSender,isTrustedUiUrl } from './trusted-frame.mjs';
import {UpdateService} from './updates.mjs';
import {diagnosticReport} from './diagnostics.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.platform==='win32')app.setAppUserModelId(APP_ID);
const smoke=process.argv.includes('--smoke-test');
const workflowTest=process.argv.includes('--workflow-test');
const duplicateSmoke=process.argv.includes('--duplicate-self-test');
const ipcSmoke=process.argv.includes('--ipc-self-test');
const detailsSmoke=process.argv.includes('--details-self-test');
const reliabilitySmoke=process.argv.includes('--reliability-self-test');
const experienceSmoke=process.argv.includes('--experience-self-test');
const betaSmoke=process.argv.includes('--beta-self-test');
if(smoke||workflowTest||duplicateSmoke||ipcSmoke||detailsSmoke||reliabilitySmoke||experienceSmoke||betaSmoke)app.setPath('userData',path.join(os.tmpdir(),`turbosave-${betaSmoke?'beta-test':experienceSmoke?'experience-test':reliabilitySmoke?'reliability-test':detailsSmoke?'details-test':ipcSmoke?'ipc-test':duplicateSmoke?'duplicate-test':smoke?'smoke':'workflow'}-${randomUUID()}`));
if(!app.requestSingleInstanceLock())app.exit(0);
let window,engine,updates,tray,quitting=false,bootError=null;const previousStatuses=new Map(),chosenFolders=new Set();
const uiPath=path.join(root,'ui','index.html'),uiUrl=pathToFileURL(uiPath).href;
function assertSender(event) {
  assertTrustedSender(event,window,uiUrl);
}
function handle(name,callback){ipcMain.handle(name,async(event,...args)=>{assertSender(event);try{return{ok:true,data:await callback(...args)};}catch(error){return{ok:false,error:error.message||'The operation could not be completed.',...(error.code==='DUPLICATE_MEDIA'?{code:error.code,duplicates:error.duplicates}:{})};}});}
function showApp(){if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}}
app.on('second-instance',showApp);
// Finish evaluating the ESM entry point before waiting for Electron's ready event.
app.whenReady().then(async()=>{
Menu.setApplicationMenu(null);
const brandIcon=nativeImage.createFromBuffer(readFileSync(path.join(root,'build-resources','icon.png')));
if(brandIcon.isEmpty())throw Error('The TurboSave logo could not be loaded.');
const taskbarIconPath=app.isPackaged?path.join(process.resourcesPath,'branding','turbosave.ico'):path.join(root,'build-resources','icon.ico');
const portable=process.env.PORTABLE_EXECUTABLE_FILE;
const relaunchExecutable=app.isPackaged&&typeof portable==='string'&&path.isAbsolute(portable)&&!/["\r\n]/.test(portable)&&path.extname(portable).toLowerCase()==='.exe'&&existsSync(portable)?portable:process.execPath;
const windowsBranding=process.platform==='win32'?taskbarDetails({executable:relaunchExecutable,iconPath:taskbarIconPath}):null;
// Update only our existing installer-created shortcuts; never create or repin items.
if(windowsBranding&&app.isPackaged&&!portable)for(const shortcut of [path.join(app.getPath('desktop'),'TurboSave Desktop.lnk'),path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','TurboSave Desktop.lnk')]){
  try{const current=shell.readShortcutLink(shortcut);if(path.resolve(current.target).toLowerCase()===path.resolve(process.execPath).toLowerCase())shell.writeShortcutLink(shortcut,'update',{icon:taskbarIconPath,iconIndex:0,appUserModelId:APP_ID});}catch{}
}
engine=new LocalEngine({toolsDir:app.isPackaged?path.join(process.resourcesPath,'tools'):path.join(root,'vendor'),
  stateDir:app.getPath('userData'),downloadsDir:smoke||duplicateSmoke||ipcSmoke||detailsSmoke||reliabilitySmoke||experienceSmoke||betaSmoke?path.join(app.getPath('userData'),'downloads'):path.join(app.getPath('downloads'),'TurboSave')});
window=new BrowserWindow({width:1220,height:820,minWidth:880,minHeight:620,backgroundColor:'#10141b',title:'TurboSave Desktop',
  icon:brandIcon,show:false,
  webPreferences:{preload:path.join(root,'src','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
function applyTaskbarBranding(){window.setIcon(brandIcon);if(windowsBranding)window.setAppDetails(windowsBranding);}
applyTaskbarBranding();window.on('show',applyTaskbarBranding);
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
window.webContents.on('will-navigate',(event,url)=>{if(!isTrustedUiUrl(url,uiUrl))event.preventDefault();});
window.webContents.on('will-attach-webview',event=>event.preventDefault());
window.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
window.webContents.session.setPermissionCheckHandler(()=>false);
window.webContents.session.webRequest.onBeforeRequest((details,callback)=>{callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')});});
updates=new UpdateService({engine,appVersion:app.getVersion()});
const fetchPreview=engine.loadThumbnail;engine.loadThumbnail=async(...args)=>{const result=await fetchPreview(...args);if(nativeImage.createFromDataURL(result.dataUrl).isEmpty())throw Error('The thumbnail could not be decoded.');return result;};
function updateTray(state){
  if(quitting||!state.settings.minimizeToTray){tray?.destroy();tray=null;return;}
  try{
  if(!tray){tray=new Tray(brandIcon);tray.on('double-click',showApp);tray.on('click',showApp);}
  const current=state.jobs.find(j=>j.id===state.activeId),paused=state.jobs.find(j=>j.status==='paused'||j.status==='interrupted');
  tray.setToolTip(`TurboSave Desktop${current?' · '+Math.round(current.progress||0)+'%':''}`);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open TurboSave',click:showApp},{label:'Pause current download',enabled:Boolean(current&&['downloading','refreshing'].includes(current.status)),click:()=>engine.pause(current.id).catch(()=>{})},{label:'Resume a paused download',enabled:Boolean(paused),click:()=>engine.retry(paused.id).catch(()=>{})},{type:'separator'},{label:'Quit TurboSave',click:()=>app.quit()}]));
  }catch{tray?.destroy();tray=null;}
}
let workflowWrite=Promise.resolve();
engine.on('state',state=>{if(!window?.isDestroyed())window.webContents.send('state:update',state);updateTray(state);
  for(const job of state.jobs){const previous=previousStatuses.get(job.id);if(state.settings.notifications&&previous&&previous!==job.status&&['completed','failed'].includes(job.status)&&Notification.isSupported()){
    try{const notification=new Notification({title:job.status==='completed'?'TurboSave download completed':'TurboSave needs your attention',body:job.status==='completed'?'Your file is ready in the selected download folder.':'Open Activity to review the failed download.',icon:brandIcon});notification.on('click',()=>{showApp();window.webContents.send('app:navigate','activity');});notification.show();}catch{}
  }previousStatuses.set(job.id,job.status);}
  for(const id of previousStatuses.keys())if(!state.jobs.some(job=>job.id===id))previousStatuses.delete(id);
  if(workflowTest&&process.env.TURBOSAVE_WORKFLOW_REPORT){
    const report={packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData'),onboardingComplete:state.onboardingComplete,initializing:state.initializing,downloadsDir:state.downloadsDir,
      jobs:state.jobs.map(job=>({id:job.id,title:job.title,source:job.source,formatLabel:job.formatLabel,status:job.status,directory:job.directory,error:job.error})),preferences:window.webContents.getLastWebPreferences()};
    workflowWrite=workflowWrite.catch(()=>{}).then(async()=>{const file=process.env.TURBOSAVE_WORKFLOW_REPORT;await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));});
  }
});
handle('state:get',()=>({...engine.snapshot(),version:app.getVersion(),license:'GPL-3.0-only',bootError}));
handle('media:inspect',(value,directory)=>engine.inspect(value,{directory:directory||engine.downloadsDir}));
handle('media:preview',value=>engine.retryPreview(value));
handle('playlist:inspect',value=>engine.playlists.inspect(value));
handle('playlist:start',value=>engine.playlists.start(value));
handle('playlist:control',(id,action)=>engine.playlists.control(id,action));
handle('playlist:retry',(id,key)=>engine.playlists.retryEntry(id,key));
handle('download:add',value=>engine.enqueue(value||{}));
handle('bulk:add',value=>engine.addDraft(value||{}));
handle('bulk:remove',id=>engine.removeDraft(id));
handle('bulk:update',value=>engine.updateDraft(value));
handle('bulk:start',()=>engine.startBatch());
handle('onboarding:complete',()=>engine.finishOnboarding());
handle('download:cancel',id=>engine.cancel(id));
handle('download:pause',id=>engine.pause(id));
handle('download:retry',id=>engine.retry(id));
handle('queue:move',(id,direction)=>engine.move(id,direction));
handle('settings:set',async value=>{const result=await engine.setSettings(value);if(value.minimizeToTray&&!tray){await engine.setSettings({minimizeToTray:false});throw Error('The Windows tray is unavailable. TurboSave will close normally.');}return result;});
handle('updates:check',kind=>updates.check(kind));
handle('updates:install-engine',()=>updates.installDownloader());
handle('updates:install-tool',kind=>updates.installTool(kind));
handle('updates:repair',()=>updates.repair());
handle('updates:check-all',()=>updates.dailyCheck({force:true}));
handle('diagnostics:export',async()=>{
  const choice=await dialog.showSaveDialog(window,{title:'Save privacy-safe diagnostics',defaultPath:'TurboSave-diagnostics.json',filters:[{name:'JSON diagnostics',extensions:['json']}]});
  if(choice.canceled||!choice.filePath)return {saved:false};
  await writeFile(choice.filePath,JSON.stringify(diagnosticReport(engine,app.getVersion()),null,2),{mode:0o600});return {saved:true};
});
handle('updates:rollback',kind=>updates.rollback(kind));
handle('updates:use-bundled',()=>engine.useBundledDownloader());
handle('updates:open-release',async()=>{const info=await updates.check('app');if(!info.configured)throw Error(info.message);await shell.openExternal(info.releaseUrl);});
handle('duplicate:resolve',value=>engine.resolveDuplicate(value||{}));
handle('history:clear',()=>engine.clearHistory());
handle('duplicates:clear',async()=>{engine.library.entries=[];await engine.library.save();});
handle('clipboard:read',()=>clipboard.readText().slice(0,4096));
handle('folder:choose',async(options={})=>{if(engine.initializing)throw new Error('Wait for startup to finish.');const initial=typeof options.directory==='string'&&path.isAbsolute(options.directory)?options.directory:engine.downloadsDir;const choice=await dialog.showOpenDialog(window,{title:'Where should TurboSave save your downloads?',defaultPath:initial,properties:['openDirectory','createDirectory']});
  const changed=!choice.canceled&&Boolean(choice.filePaths[0]),directory=changed?choice.filePaths[0]:initial;if(changed){await engine.checkFolder(directory);chosenFolders.add(directory);if(options.makeDefault!==false)await engine.setFolder(directory);}return {directory,changed};});
handle('folder:open',async(directory)=>{const allowed=[engine.downloadsDir,...chosenFolders,...engine.jobs.map(j=>j.directory),...engine.playlists.groups.map(g=>g.directory)];directory||=engine.downloadsDir;if(!allowed.includes(directory))throw Error('Choose a known download folder.');await mkdir(directory,{recursive:true});const error=await shell.openPath(directory);if(error)throw new Error('The folder could not be opened.');});
handle('file:reveal',async id=>{const job=engine.jobs.find(j=>j.id===id&&['completed','skipped'].includes(j.status));if(!job?.filePath||!(await stat(job.filePath).catch(()=>null)))throw new Error('This file was moved or removed.');shell.showItemInFolder(job.filePath);});
handle('project:link',async name=>{const urls={ytdlp:'https://github.com/yt-dlp/yt-dlp',ffmpeg:'https://ffmpeg.org/',license:'https://www.gnu.org/licenses/gpl-3.0.html'};
  if(!Object.hasOwn(urls,name))throw new Error('Unknown project link.');await shell.openExternal(urls[name]);});
window.once('ready-to-show',()=>window.show());
window.on('close',event=>{if(!quitting&&engine.settings.minimizeToTray&&tray){event.preventDefault();window.hide();return;}if(!quitting&&engine.active&&!smoke){const choice=dialog.showMessageBoxSync(window,{type:'question',title:'A download is still running',message:'Stop downloads and close TurboSave?',detail:'Available download parts will be kept. Resume from Activity next time. A stopped conversion may need to start again.',buttons:['Keep downloading','Stop and close'],defaultId:0,cancelId:0});if(choice===0){event.preventDefault();return;}}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;tray?.destroy();tray=null;engine.close().finally(()=>app.quit());});
await window.loadFile(uiPath);
try{await engine.init();}catch(error){engine.initializing=false;bootError=error.message;window.webContents.send('state:update',{...engine.snapshot(),bootError});}
if(!smoke&&!workflowTest&&!duplicateSmoke&&!ipcSmoke&&!detailsSmoke&&!reliabilitySmoke&&!experienceSmoke&&!betaSmoke){
  void (async()=>{if(!engine.ready)await updates.repair();await updates.dailyCheck();})().catch(()=>{});
  const daily=setInterval(()=>{void updates.dailyCheck().catch(()=>{});},60*60_000);daily.unref();
}
if(betaSmoke){
  const file=process.env.TURBOSAVE_BETA_REPORT||path.join(app.getPath('userData'),'beta-selftest.json'),report={version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData'),tests:[]};
  try{const {betaSelfTest}=await import('./beta-selftest.mjs');report.tests=await betaSelfTest(engine,window,path.dirname(file));report.ok=true;}catch(error){report.ok=false;report.error=error.message;report.stack=error.stack;}
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));app.quit();
}
if(experienceSmoke){
  const file=process.env.TURBOSAVE_EXPERIENCE_REPORT||path.join(app.getPath('userData'),'experience-selftest.json'),report={version:app.getVersion(),packaged:app.isPackaged,executable:process.execPath,tests:[]};
  try{const {experienceSelfTest}=await import('./experience-selftest.mjs');report.tests=await experienceSelfTest(engine,window,path.dirname(file));report.ok=true;}catch(error){report.ok=false;report.error=error.message;}
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));app.quit();
}
if(reliabilitySmoke){
  const file=process.env.TURBOSAVE_RELIABILITY_REPORT||path.join(app.getPath('userData'),'reliability-selftest.json'),report={version:app.getVersion(),packaged:app.isPackaged,executable:process.execPath,notificationsSupported:Notification.isSupported(),tests:[]};
  try{const {reliabilitySelfTest}=await import('./reliability-selftest.mjs');report.tests=await reliabilitySelfTest({engine,window,updates,hasTray:()=>Boolean(tray&&!tray.isDestroyed()),artifacts:path.dirname(file)});report.ok=true;}catch(error){report.ok=false;report.error=error.message;}
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));app.quit();
}
if(detailsSmoke){
  const file=process.env.TURBOSAVE_DETAILS_REPORT||path.join(app.getPath('userData'),'details-selftest.json'),report={version:app.getVersion(),packaged:app.isPackaged,executable:process.execPath,tests:[]};
  try{const {detailsSelfTest}=await import('./details-selftest.mjs');report.tests=await detailsSelfTest(engine,window,path.dirname(file));report.ok=true;}catch(error){report.ok=false;report.error=error.message;}
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));app.quit();
}
if(ipcSmoke){
  const report={version:app.getVersion(),packaged:app.isPackaged,executable:process.execPath,engines:engine.versions,engineHashChecks:engine.verifier.hashChecks,tests:[]};
  try{
    for(const hash of ['', '#', '#download']){
      await window.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)};`);
      await new Promise(resolve=>setTimeout(resolve,100));
      const result=await window.webContents.executeJavaScript(`(async()=>{const state=await window.turbo.state();let error;try{await window.turbo.inspect('not-a-url');}catch(e){error=e.message;}return {ready:state.ready,error};})()`);
      if(!result.ready||result.error!=='This does not look like a complete link.')throw Error(`Renderer IPC failed at ${hash||'initial document'}: ${result.error}`);
      report.tests.push({name:`Renderer state and media:inspect through preload at ${hash||'initial document'}`,passed:true});
    }
    report.ok=true;
  }catch(error){report.ok=false;report.error=error.message;report.document={expected:uiUrl,actual:window.webContents.getURL()};}
  const file=process.env.TURBOSAVE_IPC_REPORT||path.join(app.getPath('userData'),'ipc-selftest.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));app.quit();
}
if(smoke){
  const reportFile=path.join(app.getPath('userData'),'packaged-smoke.json');
  // A fixed non-explicit test clip. The renderer remains isolated during this packaged-runtime check.
  const prefs=window.webContents.getLastWebPreferences();
  const report={packaged:app.isPackaged,executable:process.execPath,contextIsolation:prefs.contextIsolation,sandbox:prefs.sandbox,nodeIntegration:prefs.nodeIntegration,versions:engine.versions,tests:[]};
  try{
    await engine.finishOnboarding();
    const media=await engine.inspect('https://www.youtube.com/watch?v=eRsGyueVLvQ');
    report.source=media.source;report.availableFormats=media.formats.length;
    for(const mode of ['merge','mp3','thumbnail']){
      const format=mode==='thumbnail'?{id:'thumbnail',extension:'jpg'}:mode==='merge'?media.formats.filter(f=>f.mode==='merge'&&f.extension==='mp4').sort((a,b)=>a.height-b.height)[0]:media.formats.find(f=>f.mode==='mp3');
      if(!format||(mode==='thumbnail'&&!media.thumbnail))throw new Error('Expected sample format missing.');
      const id=await engine.enqueue({mediaId:media.id,formatId:format.id,rightsConfirmed:true});
      await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{engine.off('state',listen);reject(new Error('Sample download timed out.'));},180_000);
        const listen=state=>{const job=state.jobs.find(j=>j.id===id);if(job&&['completed','failed','cancelled'].includes(job.status)){clearTimeout(deadline);engine.off('state',listen);job.status==='completed'?resolve():reject(new Error(job.error));}};engine.on('state',listen);listen(engine.snapshot());});
      const job=engine.jobs.find(j=>j.id===id);report.tests.push({mode,extension:format.extension,status:job.status,filePath:job.filePath,bytes:(await stat(job.filePath)).size});
    }report.ok=true;
  }catch(error){report.ok=false;report.error=error.message;for(const job of engine.jobs.filter(job=>['queued','downloading','processing'].includes(job.status)))await engine.cancel(job.id);}
  const destination=process.env.TURBOSAVE_SMOKE_REPORT||reportFile;await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2));
}
if(duplicateSmoke){
  const report={version:app.getVersion(),packaged:app.isPackaged,executable:process.execPath,tests:[]};
  try{await engine.finishOnboarding();const {duplicateSelfTest}=await import('./duplicate-selftest.mjs');report.tests=await duplicateSelfTest(engine);report.ok=true;}catch(error){report.ok=false;report.error=error.message;}
  const file=process.env.TURBOSAVE_DUPLICATE_REPORT||path.join(app.getPath('userData'),'duplicate-selftest.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2));
}
}).catch(error=>{dialog.showErrorBox('TurboSave could not start',error.message||'An application startup error occurred.');app.exit(1);});
