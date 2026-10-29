// Measure the delivered application's real smoke downloads in its isolated test profile.
// This script never changes the normal user profile or download folder.
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const exe=path.join(process.env.LOCALAPPDATA,'Programs','TurboSave Desktop','TurboSave Desktop.exe');
const run=await import('node:fs/promises').then(fs=>fs.mkdtemp(path.join(os.tmpdir(),'turbosave-speed-run-')));
const reportFile=path.join(root,'artifacts','installed-speed-test.json');
const smokeFile=path.join(run,'smoke.json'),workflowFile=path.join(run,'workflow.json');
const readJson=file=>readFile(file,'utf8').then(JSON.parse).catch(()=>null);
const hash=async file=>readFile(file).then(bytes=>createHash('sha256').update(bytes).digest('hex')).catch(()=>null);
const userState=path.join(process.env.APPDATA,'turbosave-desktop','state.json');
const before=await hash(userState),started=Date.now(),phases=new Map();
let profile,childError,smoke;
await stat(exe);
const child=spawn(exe,['--smoke-test','--workflow-test'],{cwd:root,stdio:'ignore',windowsHide:true,
  env:{...process.env,TURBOSAVE_SMOKE_REPORT:smokeFile,TURBOSAVE_WORKFLOW_REPORT:workflowFile}});
child.on('error',error=>childError=error.message);
console.log('Testing the installed EXE with isolated downloads.');
try{
  while(Date.now()-started<480_000){
    if(childError)throw Error(childError);
    const workflow=await readJson(workflowFile);
    if(workflow){
      profile=workflow.profile;
      for(const job of workflow.jobs){
        let record=phases.get(job.id);if(!record){record={id:job.id,format:job.formatLabel,firstSeen:Date.now()-started,statuses:[]};phases.set(job.id,record);}
        if(record.statuses.at(-1)?.status!==job.status){record.statuses.push({status:job.status,atMs:Date.now()-started});console.log(`${job.formatLabel}: ${job.status}`);}
      }
    }
    smoke=await readJson(smokeFile);if(smoke)break;
    if(child.exitCode!==null)throw Error(`Test process exited before producing a result (${child.exitCode}).`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!smoke)throw Error('Installed application test exceeded eight minutes.');
  // The final save is asynchronous; give the application's own state writer time to finish.
  await new Promise(resolve=>setTimeout(resolve,500));
  const saved=profile?await readJson(path.join(profile,'state.json')):null;
  const tests=[];
  for(const result of smoke.tests||[]){
    const job=saved?.jobs.find(job=>job.filePath===result.filePath);
    const times=job?phases.get(job.id):null;
    const downloading=times?.statuses.find(event=>event.status==='downloading');
    const processing=times?.statuses.find(event=>event.status==='processing');
    const transferSeconds=downloading&&processing?(processing.atMs-downloading.atMs)/1000:null;
    const totalSeconds=job?.elapsedMs?job.elapsedMs/1000:null;
    const transferBytes=job?.downloadedBytes||null;
    tests.push({mode:result.mode,status:result.status,outputBytes:result.bytes,
      totalSeconds,transferSeconds,transferBytes,
      averageTransferMBps:transferSeconds>0&&transferBytes?transferBytes/transferSeconds/1e6:null,
      averageTransferMbps:transferSeconds>0&&transferBytes?transferBytes*8/transferSeconds/1e6:null,
      phases:times?.statuses||[],source:job?.source});
  }
  const report={testedAt:new Date().toISOString(),executable:exe,packaged:smoke.packaged,
    ok:smoke.ok,error:smoke.error||null,versions:smoke.versions,source:smoke.source,
    availableFormats:smoke.availableFormats,totalSeconds:(Date.now()-started)/1000,
    tests,userStateUnchanged:before===await hash(userState),
    method:'Actual installed EXE smoke pipeline; wall-clock transfer interval includes downloader startup. Mbps is megabits per second. This measures this media source, not total broadband capacity.'};
  await mkdir(path.dirname(reportFile),{recursive:true});await writeFile(reportFile,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
}catch(error){
  await mkdir(path.dirname(reportFile),{recursive:true});
  await writeFile(reportFile,JSON.stringify({ok:false,executable:exe,error:error.message,phases:[...phases.values()],testProfile:profile},null,2));
  console.error(error.message);process.exitCode=1;
}finally{
  // Only the test process tree started above is stopped; the user's normal instance is untouched.
  if(child.pid&&child.exitCode===null){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  const temporary=path.resolve(os.tmpdir());
  for(const candidate of [run,profile]){
    if(!candidate)continue;const resolved=path.resolve(candidate);
    if(path.dirname(resolved)!==temporary||!path.basename(resolved).startsWith('turbosave-'))continue;
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:300}).catch(()=>{});
  }
}
