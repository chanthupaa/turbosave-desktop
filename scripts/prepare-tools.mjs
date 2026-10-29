// Fetch build-time engines from their publishers; never run a downloaded file before its checksum matches.
import { mkdir, readFile, writeFile, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {writeEngineManifest} from './engine-manifest.mjs';
import {windowsSystemTool} from '../src/system-tools.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = path.join(root,'vendor'), downloads = path.join(vendor,'downloads');
await mkdir(path.join(vendor,'bin'),{recursive:true}); await mkdir(path.join(vendor,'licenses'),{recursive:true}); await mkdir(downloads,{recursive:true});
const headers = { 'user-agent':'TurboSave-Desktop-Build/0.1' };
async function fetchText(url) { try {const r=await fetch(url,{headers,signal:AbortSignal.timeout(60_000)}); if(!r.ok)throw new Error(`Publisher request failed: HTTP ${r.status}`); return await r.text();} catch { return execFileSync('curl.exe',['--fail','--location','--silent','--show-error','--max-time','90',url],{encoding:'utf8',maxBuffer:20_000_000,windowsHide:true});} }
async function download(url,destination,expected) {
  if(!/^[a-f0-9]{64}$/i.test(expected))throw new Error('Publisher SHA-256 is required.');
  try { const old=await readFile(destination); if(createHash('sha256').update(old).digest('hex')===expected.toLowerCase()) return; } catch {}
  let data;
  try {const r=await fetch(url,{headers,signal:AbortSignal.timeout(600_000)}); if(!r.ok)throw new Error(`Engine download failed: HTTP ${r.status}`);data=Buffer.from(await r.arrayBuffer());}
  catch {data=execFileSync('curl.exe',['--fail','--location','--silent','--show-error','--max-time','600',url],{maxBuffer:300_000_000,windowsHide:true});}
  if(createHash('sha256').update(data).digest('hex')!==expected.toLowerCase())throw new Error('Engine checksum mismatch.');
  await writeFile(destination,data); console.log(`Verified ${path.basename(destination)} (${Math.round(data.length/1e6)} MB)`);
}
function extract(zip,suffix,destination) {
  // Extract only the needed file; avoid unpacking Node's thousands of SDK files.
  const q=s=>`'${s.replaceAll("'","''")}'`;
  const script=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;$zip=[IO.Compression.ZipFile]::OpenRead(${q(zip)});try{$entries=@($zip.Entries|Where-Object {$_.FullName.EndsWith(${q(suffix)}) -and $_.FullName.Split('/').Length -eq ${suffix.split('/').length}});if($entries.Count -ne 1 -or $entries[0].Length -gt 200000000){throw 'Unexpected archive entry'};[IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0],${q(destination)},$true)}finally{$zip.Dispose()}`;
  execFileSync(windowsSystemTool('powershell'),['-NoProfile','-NonInteractive','-Command',script],{stdio:'inherit',windowsHide:true});
}
const locked = await readFile(path.join(root,'engines.lock.json'),'utf8').then(JSON.parse).catch(()=>null);
let yt,ff,node;
if(locked) ({yt,ff,node}=locked);
else {
  const release=JSON.parse(await fetchText('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'));
  const sums=await fetchText(`https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/SHA2-256SUMS`);
  const match=sums.split('\n').find(line=>/\s+yt-dlp\.exe\s*$/.test(line));
  if(!match)throw new Error('yt-dlp publisher checksum missing.');
  yt={version:release.tag_name,url:`https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/yt-dlp.exe`,sha256:match.trim().split(/\s+/)[0],source:`https://github.com/yt-dlp/yt-dlp/tree/${release.tag_name}`};
  const ffRelease=JSON.parse(await fetchText('https://api.github.com/repos/GyanD/codexffmpeg/releases/tags/9.0.2'));
  const ffAsset=ffRelease.assets.find(a=>a.name==='ffmpeg-9.0.2-essentials_build.zip');
  if(!ffAsset?.digest?.startsWith('sha256:'))throw new Error('FFmpeg publisher checksum missing.');
  ff={version:ffRelease.tag_name,url:ffAsset.browser_download_url,sha256:ffAsset.digest.slice(7),source:'https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2'};
  const nodeSums=await fetchText('https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt');
  const line=nodeSums.split('\n').find(l=>l.endsWith('-win-x64.zip'));
  const [sha256,name]=line.trim().split(/\s+/);
  node={version:name.replace(/^node-|\-win-x64.zip$/g,''),url:`https://nodejs.org/dist/${name.split('-win-')[0].replace('node-','')}/${name}`,sha256,source:'https://github.com/nodejs/node'};
  await writeFile(path.join(root,'engines.lock.json'),JSON.stringify({yt,ff,node},null,2)+'\n');
}
await download(yt.url,path.join(vendor,'bin','yt-dlp.exe'),yt.sha256);
const ffZip=path.join(downloads,'ffmpeg.zip'), nodeZip=path.join(downloads,'node.zip');
await download(ff.url,ffZip,ff.sha256);
await download(node.url,nodeZip,node.sha256);
{
  for(const binary of ['ffmpeg.exe','ffprobe.exe'])extract(ffZip,`/bin/${binary}`,path.join(vendor,'bin',binary));
  for(const name of ['LICENSE','README.txt'])extract(ffZip,`/${name}`,path.join(vendor,'licenses',`ffmpeg-${name}.txt`));
}
{
  extract(nodeZip,'/node.exe',path.join(vendor,'bin','node.exe'));
  extract(nodeZip,'/LICENSE',path.join(vendor,'licenses','node-LICENSE.txt'));
}
await writeEngineManifest(root,{yt,ff,node});
for(const name of ['LICENSE','THIRD_PARTY_LICENSES.txt']){
  const destination=path.join(vendor,'licenses',`yt-dlp-${name}`);
  let text;
  try{text=await fetchText(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${yt.version}/${name}`);}
  catch{const value=JSON.parse(await fetchText(`https://api.github.com/repos/yt-dlp/yt-dlp/contents/${name}?ref=${yt.version}`));text=Buffer.from(value.content,'base64').toString('utf8');}
  if(!text.trim())throw new Error('Required downloader license missing.');
  await writeFile(destination,text);
}
await writeFile(path.join(vendor,'engines.lock.json'),JSON.stringify({yt,ff,node},null,2)+'\n');
console.log('All local engines prepared. Their versions and publisher checksums are recorded in engines.lock.json.');
