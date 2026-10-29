import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {ToolVerifier} from '../src/tool-verifier.mjs';
import {LocalEngine} from '../src/engine.mjs';
import {windowsSystemTool} from '../src/system-tools.mjs';
import {verifyRelease} from '../src/release-auth.mjs';
import {diagnosticReport} from '../src/diagnostics.mjs';
import {startPublicProxy} from '../src/public-proxy.mjs';
import {createStage,cleanStage} from '../src/job-stage.mjs';
import {imagePreview} from '../src/thumbnail.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function temp(t){const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-security-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('verified engines are hashed once per unchanged session, and replacement is detected',async t=>{
  const dir=await temp(t),file=path.join(dir,'engine.exe'),bytes=Buffer.from('MZtrusted engine fixture');await writeFile(file,bytes);
  const verifier=new ToolVerifier();verifier.register(file,sha(bytes),{size:bytes.length});
  await Promise.all([verifier.verify(file),verifier.verify(file)]);await verifier.verify(file);assert.equal(verifier.hashChecks,1);
  await writeFile(file,Buffer.alloc(bytes.length,42));await assert.rejects(()=>verifier.verify(file),/checksum/);assert.equal(verifier.hashChecks,2);
  await writeFile(file,bytes);await verifier.verify(file);assert.equal(verifier.hashChecks,3);
  verifier.register(file,'a'.repeat(64),{size:bytes.length});await assert.rejects(()=>verifier.verify(file),/checksum/);
});
test('unregistered executables and directory junctions cannot become verified engines',async t=>{
  const dir=await temp(t),real=path.join(dir,'real'),link=path.join(dir,'redirect');await mkdir(real);const bytes=Buffer.from('MZfixture');await writeFile(path.join(real,'engine.exe'),bytes);
  const verifier=new ToolVerifier();await assert.rejects(()=>verifier.verify(path.join(real,'engine.exe')),/not a verified/);
  await symlink(real,link,process.platform==='win32'?'junction':'dir');const file=path.join(link,'engine.exe');verifier.register(file,sha(bytes));await assert.rejects(()=>verifier.verify(file),/redirected/);
});
test('engine runner fails before spawning a modified bundled executable or a PATH command',async t=>{
  const dir=await temp(t);await mkdir(path.join(dir,'bin'));await writeFile(path.join(dir,'bin','yt-dlp.exe'),'MZmalicious');
  const engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:dir});let spawned=false;
  await assert.rejects(()=>engine.run(engine.tool('yt-dlp'),['--version'],{onSpawn(){spawned=true;}}),/unexpected size/);
  await assert.rejects(()=>engine.run('powershell.exe',[]),/absolute/);assert.equal(spawned,false);assert.equal(engine.children.size,0);
  assert.match(windowsSystemTool('powershell'),/System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i);
});
test('signed release metadata rejects changed bytes, unknown keys, replay and expired releases',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),trust={version:1,keys:[{id:'test',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}]};
  const now=Date.now(),repository='owner/turbosave-desktop',version='1.0.0',manifest={schema:1,repository,version,issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),assets:['setup.exe','portable.exe'].map(suffix=>({name:`TurboSave-Desktop-${version}-${suffix}`,bytes:123,sha256:'a'.repeat(64)}))};
  const bytes=Buffer.from(JSON.stringify(manifest)),envelope={algorithm:'Ed25519',keyId:'test',signature:sign(null,bytes,privateKey).toString('base64')};
  assert.equal(verifyRelease(bytes,envelope,trust,{repository,version,now}).version,version);
  assert.throws(()=>verifyRelease(Buffer.concat([bytes,Buffer.from(' ')]),envelope,trust,{repository,version,now}),/signature verification/);
  assert.throws(()=>verifyRelease(bytes,envelope,{version:1,keys:[]},{repository,version,now}),/not trusted/);
  assert.throws(()=>verifyRelease(bytes,envelope,trust,{repository,version:'0.9.0',now}),/does not match/);
  assert.throws(()=>verifyRelease(bytes,envelope,trust,{repository,version,now:now+2*86400000}),/expired/);
});
test('diagnostic export cannot include links, paths, titles, credentials or arbitrary errors',()=>{
  const secret='SENSITIVE_PRIVATE_VALUE',engine={settings:{dailyEngineChecks:true,releaseRepo:secret},versions:{'yt-dlp':'2026.10.26',ffmpeg:'ffmpeg version 9.0.2 full build',node:secret},jobs:[{status:'failed',source:`https://example.org/?token=${secret}`,directory:`C:\\Users\\${secret}`,title:secret,error:secret}],toolStatus:secret};
  const report=diagnosticReport(engine,'0.8.0-beta.3');assert.doesNotMatch(JSON.stringify(report),new RegExp(secret));assert.deepEqual(report.jobCounts,{failed:1});assert.equal(report.versions.node,'unavailable');
});
test('loopback proxy requires per-session authentication before resolving a target',async()=>{
  let resolutions=0;const proxy=await startPublicProxy(async()=>{resolutions++;throw Error('Private destination');});
  const url=new URL(proxy.origin);
  const request=authorization=>new Promise((resolve,reject)=>{const req=http.request({host:url.hostname,port:url.port,path:'http://127.0.0.1/private',headers:authorization?{'Proxy-Authorization':authorization}:{}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
  try{assert.equal(await request(),407);assert.equal(resolutions,0);assert.equal(await request('Basic '+Buffer.from(`${url.username}:${url.password}`).toString('base64')),403);assert.equal(resolutions,1);}finally{proxy.close();}
});
test('cleanup refuses a working folder replaced with a junction and preserves outside files',async t=>{
  const dir=await temp(t),outside=path.join(dir,'outside'),downloads=path.join(dir,'downloads');await mkdir(outside);await mkdir(downloads);const victim=path.join(outside,'keep.txt');await writeFile(victim,'keep');
  const job={id:'owned',directory:downloads},stage=await createStage(job);await rm(stage,{recursive:true});await symlink(outside,stage,process.platform==='win32'?'junction':'dir');await cleanStage(job);assert.equal(await readFile(victim,'utf8'),'keep');
});
test('compressed image headers with excessive pixel dimensions are rejected before decode',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(100000,16);png.writeUInt32BE(100000,20);assert.throws(()=>imagePreview(png),/dimensions/);
  assert.throws(()=>imagePreview(Buffer.from([255,216,255,224,0,0])),/dimensions/);
});
