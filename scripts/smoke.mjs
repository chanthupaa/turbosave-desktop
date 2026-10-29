// Launch the actual delivered portable, not an Electron development process.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const exe=path.join(root,'release',`TurboSave-Desktop-${version}-portable.exe`);
const report=path.join(root,'artifacts','packaged-smoke.json');
await stat(exe);await mkdir(path.dirname(report),{recursive:true});
await rm(report,{force:true}); // Exact owned report file only.
const child=spawn(exe,['--smoke-test'],{cwd:root,stdio:'ignore',env:{...process.env,TURBOSAVE_SMOKE_REPORT:report}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
const deadline=Date.now()+480_000;
while(Date.now()<deadline){
  const value=await readFile(report,'utf8').then(JSON.parse).catch(()=>null);
  if(value){console.log(JSON.stringify(value,null,2));child.unref();if(!value.ok)process.exitCode=1;process.exit(process.exitCode||0);}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
console.error('Packaged smoke timed out. Inspect the open application.');child.unref();process.exit(1);
