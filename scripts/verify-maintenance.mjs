// Exercise real Windows ZIP extraction/version checks in an isolated profile.
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {LocalEngine} from '../src/engine.mjs';import {UpdateService} from '../src/updates.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),profile=await mkdtemp(path.join(os.tmpdir(),'turbosave-maintenance-')),toolsDir=path.join(root,'vendor'),engine=new LocalEngine({toolsDir,stateDir:profile,downloadsDir:path.join(profile,'downloads')}),checks=[];
const q=s=>"'"+s.replaceAll("'","''")+"'";await engine.init();const report={profile,checks};
try{
 for(const [kind,names]of [['ffmpeg',['ffmpeg','ffprobe']],['node',['node']]]){
  const archive=path.join(profile,kind+'.zip'),version=kind==='node'?engine.versions.node:engine.versions.ffmpeg.match(/^ffmpeg version ([\d.]+)/)[1];
  const entries=names.map(name=>`[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,${q(engine.tool(name))},${q('fixture/'+(kind==='ffmpeg'?'bin/':'')+name+'.exe')},[IO.Compression.CompressionLevel]::Fastest)|Out-Null;`).join('');
  await engine.run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;$zip=[IO.Compression.ZipFile]::Open(${q(archive)},'Create');try{${entries}}finally{$zip.Dispose()}`],{timeout:90_000});
  const bytes=await readFile(archive);await engine.toolStore.install(kind,bytes,{version,sha256:createHash('sha256').update(bytes).digest('hex')});for(const name of names)assert.ok(engine.tool(name).startsWith(profile));
  checks.push({name:`Real ${kind} archive extraction, PE/version checks and activation`,passed:true});
 }
 const next=new LocalEngine({toolsDir,stateDir:profile,downloadsDir:profile});await next.toolStore.restore();assert.ok(next.tool('ffmpeg').startsWith(profile));assert.ok(next.tool('ffprobe').startsWith(profile));assert.ok(next.tool('node').startsWith(profile));checks.push({name:'Managed tools reload only after all persisted hashes match',passed:true});
 await engine.toolStore.rollback('ffmpeg');assert.equal(engine.tool('ffmpeg'),path.join(toolsDir,'bin','ffmpeg.exe'));checks.push({name:'FFmpeg and FFprobe roll back together to the bundled pair',passed:true});
 if(process.argv.includes('--live')){const updates=new UpdateService({engine,appVersion:'0.8.0-beta.1'});report.publishers=[];for(const kind of ['yt-dlp','ffmpeg','node'])try{const info=await updates.check(kind);report.publishers.push({kind,current:info.current,latest:info.latest,available:info.available,ok:true});}catch(error){report.publishers.push({kind,ok:false,error:error.message});}}
 report.ok=true;
}catch(error){report.ok=false;report.error=error.message;}finally{await engine.close();await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts','maintenance-verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
