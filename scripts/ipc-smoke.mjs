// Launch the released executable and exercise the renderer's actual preload bridge.
import {spawn} from 'node:child_process';import {mkdir,readFile,rm,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const report=path.join(root,'artifacts','packaged-ipc.json'),exe=path.join(root,'release',`TurboSave-Desktop-${version}-portable.exe`);
await stat(exe);await mkdir(path.dirname(report),{recursive:true});await rm(report,{force:true});
const child=spawn(exe,['--ipc-self-test'],{stdio:'ignore',windowsHide:true,env:{...process.env,TURBOSAVE_IPC_REPORT:report}});let launchError;
child.on('error',error=>{launchError=error;});const deadline=Date.now()+120_000;
while(Date.now()<deadline){if(launchError)throw launchError;const result=await readFile(report,'utf8').then(JSON.parse).catch(()=>null);
  if(result){console.log(JSON.stringify(result,null,2));child.unref();process.exit(result.ok&&result.packaged&&result.version===version&&result.tests.length===3?0:1);}await new Promise(resolve=>setTimeout(resolve,500));}
child.unref();throw Error('Packaged renderer IPC test timed out.');
