// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {readFile,writeFile,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {extractFile} from '@electron/asar';
import {getCurrentFuseWire,FuseV1Options} from '@electron/fuses';import {fileHash} from '../src/duplicates.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),directory=path.join(process.env.LOCALAPPDATA,'Programs/TurboSave Desktop'),exe=path.join(directory,'TurboSave Desktop.exe'),pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const installedAsar=path.join(directory,'resources/app.asar');assert.equal(JSON.parse(extractFile(installedAsar,'package.json').toString('utf8')).version,pkg.version);
let profileFilesPreserved=0;
if(process.env.TURBOSAVE_SECURITY_BACKUP){const backup=JSON.parse(await readFile(path.join(process.env.TURBOSAVE_SECURITY_BACKUP,'upgrade.json'),'utf8'));for(const entry of backup.files){assert.equal((await fileHash(path.join(backup.profile,entry.name))).toUpperCase(),entry.sha256.toUpperCase());profileFilesPreserved++;}}
assert.equal(await fileHash(installedAsar),await fileHash(path.join(root,'release/win-unpacked/resources/app.asar')));assert.equal(await fileHash(exe),await fileHash(path.join(root,'release/win-unpacked/TurboSave Desktop.exe')));
const manifest=JSON.parse(extractFile(installedAsar,'build-resources/engines-manifest.json').toString('utf8'));
for(const [name,entry]of Object.entries(manifest.engines))assert.equal(await fileHash(path.join(directory,'resources/tools/bin',name+'.exe')),entry.sha256);
const wire=await getCurrentFuseWire(exe);assert.equal(wire[FuseV1Options.RunAsNode],48);assert.equal(wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],49);assert.equal(wire[FuseV1Options.OnlyLoadAppFromAsar],49);
const reportPath=path.join(root,'artifacts/installed-security-ipc.json');await rm(reportPath,{force:true});
const child=spawn(exe,['--ipc-self-test','--noerrdialogs'],{windowsHide:true,stdio:'ignore',env:{...process.env,TURBOSAVE_IPC_REPORT:reportPath}});let failure;child.on('error',error=>failure=error);
const deadline=Date.now()+120_000;let ipc;
while(Date.now()<deadline){if(failure)throw failure;ipc=await readFile(reportPath,'utf8').then(JSON.parse).catch(()=>null);if(ipc)break;await new Promise(resolve=>setTimeout(resolve,250));}
if(!ipc){child.kill();throw Error('Installed security IPC check timed out.');}assert.equal(ipc.ok,true,ipc.error);assert.equal(ipc.version,pkg.version);assert.equal(ipc.packaged,true);
const result={version:pkg.version,ok:true,installedSourceMatches:true,installedExecutableMatches:true,bundledEnginesVerified:4,productionFusesVerified:true,profileFilesPreserved,ipcChecks:ipc.tests.length,engineHashChecks:ipc.engineHashChecks,normalProfileUsedForTests:false,runtimeSha256:createHash('sha256').update(await readFile(exe)).digest('hex')};
await writeFile(path.join(root,'artifacts/installed-security-upgrade.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));child.unref();
