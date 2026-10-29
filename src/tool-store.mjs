// SPDX-License-Identifier: GPL-3.0-only
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import {windowsSystemTool} from './system-tools.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const names={ffmpeg:['ffmpeg','ffprobe'],node:['node']};
const quote=value=>"'"+value.replaceAll("'","''")+"'";
export class ToolStore{
  constructor(engine){this.engine=engine;this.records={};}
  async restore(){
    const e=this.engine;let saved;try{saved=JSON.parse(await readFile(path.join(e.stateDir,'tools-state.json'),'utf8'));}catch{return;}
    for(const kind of Object.keys(names))try{
      const record=saved[kind];if(!record||record.enabled===false)continue;
      if(!/^[a-zA-Z0-9._-]{1,100}$/.test(record.folder)||!Array.isArray(record.files))throw Error();
      const dir=path.join(e.stateDir,'managed-tools',record.folder),dirInfo=await lstat(dir);if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink())throw Error();
      for(const name of names[kind]){
        const expected=record.files.find(f=>f.name===name),file=path.join(dir,name+'.exe'),info=await lstat(file);
        if(!expected||!info.isFile()||info.isSymbolicLink()||info.size>200_000_000||!/^[a-f0-9]{64}$/.test(expected.sha256))throw Error();
        e.verifier.register(file,expected.sha256);await e.verifier.verify(file);
      }
      this.records[kind]=record;for(const name of names[kind])e.toolOverrides[name]=path.join(dir,name+'.exe');
    }catch{e.engineUpdateWarning='A saved tool failed verification. Using the bundled tools.';}
  }
  async install(kind,bytes,{version,sha256}){
    if(!names[kind]||!/^[\w.+-]{1,80}$/.test(version)||hash(bytes)!==sha256)throw Error('Tool archive verification failed.');
    const e=this.engine,folder=`${kind}-${version}-${randomUUID()}`,dir=path.join(e.stateDir,'managed-tools',folder);
    await mkdir(dir,{recursive:true});const archive=path.join(dir,'verified.zip');await writeFile(archive,bytes,{flag:'wx'});
    try{
      const extracts=names[kind].map(name=>`$entry=@($zip.Entries|Where-Object {$_.FullName.EndsWith(${quote('/'+(kind==='ffmpeg'?'bin/':'')+name+'.exe')})});if($entry.Count -ne 1 -or $entry[0].Length -gt 200000000){throw 'Unexpected archive content'};[IO.Compression.ZipFileExtensions]::ExtractToFile($entry[0],${quote(path.join(dir,name+'.exe'))},$false);`).join('');
      await e.run(windowsSystemTool('powershell'),['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;$zip=[IO.Compression.ZipFile]::OpenRead(${quote(archive)});try{${extracts}}finally{$zip.Dispose()}`],{timeout:60_000});
      const files=[];
      for(const name of names[kind]){
        const file=path.join(dir,name+'.exe'),data=await readFile(file);if(data.toString('ascii',0,2)!=='MZ')throw Error('The archive did not contain a Windows executable.');
        const digest=hash(data);e.verifier.register(file,digest,{size:data.length});await e.verifier.verify(file);
        const reported=(await e.run(file,[kind==='node'?'--version':'-version'],{timeout:20_000})).trim().split(/\r?\n/)[0];
        if(kind==='node'?!reported.startsWith(version):!reported.startsWith(`${name} version ${version}`))throw Error('The downloaded tool reported a different version.');
        files.push({name,sha256:digest,version:reported.slice(0,120)});
      }
      const record={enabled:true,folder,version,files};
      const previous=this.records[kind];this.records[kind]=record;try{await this.save();}catch(error){if(previous)this.records[kind]=previous;else delete this.records[kind];throw error;}
      for(const file of files){e.toolOverrides[file.name]=path.join(dir,file.name+'.exe');e.versions[file.name]=file.version;}
    }finally{await rm(archive,{force:true}).catch(()=>{});}
  }
  async save(){const file=path.join(this.engine.stateDir,'tools-state.json');await writeFile(file+'.tmp',JSON.stringify(this.records),{mode:0o600});await rename(file+'.tmp',file);}
  async rollback(kind){
    if(!names[kind])throw Error('Unknown engine.');const e=this.engine;const versions={};
    for(const name of names[kind])versions[name]=(await e.run(path.join(e.toolsDir,'bin',name+'.exe'),[kind==='node'?'--version':'-version'],{timeout:20_000})).trim().split(/\r?\n/)[0].slice(0,120);
    this.records[kind]={enabled:false};await this.save();for(const name of names[kind]){delete e.toolOverrides[name];e.versions[name]=versions[name];}
  }
}
