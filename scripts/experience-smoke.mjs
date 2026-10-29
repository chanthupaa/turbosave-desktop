import {spawn} from 'node:child_process';import {mkdir,readFile,rm,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const report=path.join(root,'artifacts','packaged-experience.json'),exe=path.join(root,'release',`TurboSave-Desktop-${version}-portable.exe`);
await stat(exe);await mkdir(path.dirname(report),{recursive:true});await rm(report,{force:true});
const child=spawn(exe,['--experience-self-test'],{stdio:'ignore',windowsHide:true,env:{...process.env,TURBOSAVE_EXPERIENCE_REPORT:report}});let failure;child.on('error',error=>failure=error);
const deadline=Date.now()+120000;
while(Date.now()<deadline){if(failure)throw failure;const result=await readFile(report,'utf8').then(JSON.parse).catch(()=>null);if(result){console.log(JSON.stringify(result,null,2));child.unref();process.exit(result.ok&&result.packaged&&result.version===version?0:1);}await new Promise(resolve=>setTimeout(resolve,500));}
child.unref();throw Error('Packaged experience test timed out.');
