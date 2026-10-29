// SPDX-License-Identifier: GPL-3.0-only
// Mutates only an isolated copy, never the installed application or user profile.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {getCurrentFuseWire,FuseV1Options} from '@electron/fuses';
import {NtExecutable,NtExecutableResource} from 'resedit';import {getRawHeader,extractFile} from '@electron/asar';
const root=fileURLToPath(new URL('..',import.meta.url)),original=path.join(root,'release/win-unpacked'),exe=path.join(original,'TurboSave Desktop.exe'),checks=[];
const wire=await getCurrentFuseWire(exe);
// Fuse wire states are ASCII '0' and '1'.
for(const [option,expected]of [[FuseV1Options.RunAsNode,48],[FuseV1Options.EnableNodeOptionsEnvironmentVariable,48],[FuseV1Options.EnableNodeCliInspectArguments,48],[FuseV1Options.EnableEmbeddedAsarIntegrityValidation,49],[FuseV1Options.OnlyLoadAppFromAsar,49]])assert.equal(wire[option],expected,'Unexpected production fuse '+option);
checks.push({name:'Production fuses disable Node/debug injection and enforce ASAR integrity',passed:true});
const executableBytes=await readFile(exe),runtimeSha256=createHash('sha256').update(executableBytes).digest('hex'),executable=NtExecutable.from(executableBytes),resources=NtExecutableResource.from(executable),entry=resources.entries.find(item=>String(item.type).toUpperCase()==='INTEGRITY'&&String(item.id).toUpperCase()==='ELECTRONASAR');assert.ok(entry,'Missing integrity resource');
const integrity=JSON.parse(Buffer.from(entry.bin).toString('utf8')),asar=path.join(original,'resources/app.asar');
assert.equal(integrity[0].value,createHash('sha256').update(getRawHeader(asar).headerString).digest('hex'));checks.push({name:'Executable pins the matching ASAR header hash',passed:true});
await mkdir(path.join(root,'artifacts'),{recursive:true});const dir=await mkdtemp(path.join(root,'artifacts/security-runtime-'));
async function run(folder,report,extraEnv={}){
  console.log('Checking '+path.basename(report));
  await rm(report,{force:true});
  const child=spawn(path.join(folder,'TurboSave Desktop.exe'),['--noerrdialogs','--disable-gpu','--ipc-self-test'],{windowsHide:true,cwd:folder,env:{...process.env,...extraEnv,TURBOSAVE_IPC_REPORT:report},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output=(output+chunk).slice(-20_000));child.stderr.on('data',chunk=>output=(output+chunk).slice(-20_000));
  let timer;const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});timer=setTimeout(()=>{child.kill();reject(Error('Security runtime check timed out: '+path.basename(report)+' '+output));},120_000);});
  return {exit,output,report:await readFile(report,'utf8').then(JSON.parse).catch(()=>null)};
}
try{
  const injected=await run(original,path.join(dir,'injection.json'),{ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'--invalid-turbosave-injection-flag'});assert.equal(injected.report?.ok,true,injected.output);assert.equal(injected.report.packaged,true);checks.push({name:'Packaged app ignores Node environment injection and completes real renderer IPC checks',passed:true});
  const copy=path.join(dir,'app');await cp(original,copy,{recursive:true});
  const badTool=path.join(copy,'resources/tools/bin/ffprobe.exe'),bytes=await readFile(badTool);bytes[bytes.length-1]^=1;await writeFile(badTool,bytes);
  const tampered=await run(copy,path.join(dir,'bad-engine.json'));assert.equal(tampered.report?.ok,false,tampered.output);assert.equal(tampered.report.engines?.ffprobe,'Not available');checks.push({name:'A modified bundled FFprobe is rejected in the actual packaged runtime',passed:true});
  await cp(path.join(original,'resources/tools/bin/ffprobe.exe'),badTool);
  const copiedAsar=path.join(copy,'resources/app.asar'),archiveBytes=await readFile(copiedAsar),engineBytes=extractFile(copiedAsar,'src/engine.mjs'),offset=archiveBytes.indexOf(engineBytes);assert.ok(offset>0);archiveBytes[offset+20]^=1;await writeFile(copiedAsar,archiveBytes);
  const altered=await run(copy,path.join(dir,'bad-asar.json'));assert.notEqual(altered.exit,0);assert.equal(altered.report,null);assert.match(altered.output,/integrity|hash mismatch/i);checks.push({name:'Modified application code terminates before producing a successful IPC report',passed:true});
  const version=JSON.parse(extractFile(asar,'package.json').toString('utf8')).version,result={ok:true,packaged:true,version,runtimeSha256,tests:checks};await writeFile(path.join(root,'artifacts/packaged-security.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
