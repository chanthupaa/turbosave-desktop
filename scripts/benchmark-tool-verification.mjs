// SPDX-License-Identifier: GPL-3.0-only
import {performance} from 'node:perf_hooks';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ToolVerifier,engineNames} from '../src/tool-verifier.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),manifest=JSON.parse(await readFile(path.join(root,'build-resources/engines-manifest.json'),'utf8')),verifier=new ToolVerifier();
for(const name of engineNames){const entry=manifest.engines[name];verifier.register(path.join(root,'vendor/bin',name+'.exe'),entry.sha256,{size:entry.bytes});}
const start=performance.now();for(const name of engineNames)await verifier.verify(path.join(root,'vendor/bin',name+'.exe'));const startupMs=performance.now()-start;
const cachedStart=performance.now();for(let pass=0;pass<25;pass++)for(const name of engineNames)await verifier.verify(path.join(root,'vendor/bin',name+'.exe'));
if(verifier.hashChecks!==4)throw Error('Unchanged engines were needlessly rehashed.');
const report={startupHashMs:Math.round(startupMs),cachedToolchainCheckMs:Math.round((performance.now()-cachedStart)/25*100)/100,toolchainChecks:26,fullHashes:verifier.hashChecks,bytes:Object.values(manifest.engines).reduce((sum,entry)=>sum+entry.bytes,0),note:'Local warm-cache measurement; startup varies with disk, antivirus and hardware.'};
await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts/tool-verification-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
