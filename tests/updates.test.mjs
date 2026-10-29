import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {UpdateService,newer,checksumFor,githubBytes} from '../src/updates.mjs';
import {generateKeyPairSync,sign} from 'node:crypto';

test('desktop release discovery fails closed without pinned keys and binds signed metadata to published assets',async()=>{
 const engine={settings:{releaseRepo:'owner/turbosave-desktop'},versions:{}},empty=new UpdateService({engine,appVersion:'0.8.0',read:async()=>{throw Error('No unsigned discovery');},trust:{version:1,keys:[]}});assert.equal((await empty.check('app')).configured,false);
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),trust={version:1,keys:[{id:'fixture',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}]},version='0.9.0',base='https://github.com/owner/turbosave-desktop/releases/download/v0.9.0/';
 const assets=['setup.exe','portable.exe'].map(suffix=>({name:`TurboSave-Desktop-${version}-${suffix}`,bytes:123,sha256:'a'.repeat(64)})),bytes=Buffer.from(JSON.stringify({schema:1,repository:engine.settings.releaseRepo,version,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),assets})),envelope={algorithm:'Ed25519',keyId:'fixture',signature:sign(null,bytes,privateKey).toString('base64')};
 const published=assets.map(a=>({name:a.name,size:a.bytes,digest:'sha256:'+a.sha256,browser_download_url:base+a.name}));
 const read=async url=>url.includes('api.github.com')?Buffer.from(JSON.stringify({tag_name:'v0.9.0',assets:published})):url.endsWith('.sig.json')?Buffer.from(JSON.stringify(envelope)):bytes;
 const service=new UpdateService({engine,appVersion:'0.8.0',trust,read});assert.equal((await service.check('app')).available,true);published[0].digest='sha256:'+'b'.repeat(64);await assert.rejects(()=>service.check('app'),/differ from the signed/);
});
test('release comparisons and checksum parsing reject ambiguous update inputs',async()=>{
 assert.equal(newer('0.10.0','0.9.9'),true);assert.equal(newer('2026.10.26','2026.10.25'),true);assert.equal(newer('0.4.0','0.4.0'),false);assert.equal(newer('garbage','0.4.0'),false);
 const digest='a'.repeat(64);assert.equal(checksumFor(`${digest}  yt-dlp.exe\n`,'yt-dlp.exe'),digest);assert.throws(()=>checksumFor(`${digest}  other.exe`,'yt-dlp.exe'));
 for(const url of ['http://github.com/file','https://evil.example/file','https://github.com.evil.example/file','https://user:pass@github.com/file'])await assert.rejects(()=>githubBytes(url),/trusted/);
});
test('app checks remain explicitly unconfigured without a desktop release repository',async()=>{
 const service=new UpdateService({engine:{settings:{releaseRepo:''}},appVersion:'0.5.0',read:async()=>{throw Error('Must not contact a provider');}});assert.equal((await service.check('app')).configured,false);
});
test('official engine update is checksum-verified before it can be installed',async()=>{
 const binary=Buffer.from('MZverified fixture'),hash=createHash('sha256').update(binary).digest('hex'),visits=[];let installed=false;
 const engine={settings:{releaseRepo:''},versions:{'yt-dlp':'2026.10.25'},assertIdleForUpdate(){},changed(){},pump(){},async installDownloader(bytes,version,digest){assert.deepEqual(bytes,binary);assert.equal(version,'2026.10.26');assert.equal(digest,hash);installed=true;}};
 const read=async url=>{visits.push(url);return url.includes('api.github.com')?Buffer.from(JSON.stringify({tag_name:'2026.10.26'})):url.endsWith('SHA2-256SUMS')?Buffer.from(`${hash}  yt-dlp.exe`):binary;};
 const service=new UpdateService({engine,appVersion:'0.5.0',read});assert.equal((await service.installDownloader()).installed,true);assert.equal(installed,true);assert.ok(visits.every(url=>url.startsWith('https://api.github.com/repos/yt-dlp/yt-dlp/')||url.startsWith('https://github.com/yt-dlp/yt-dlp/releases/download/')));assert.equal(engine.maintenance,false);
 installed=false;const tampered=new UpdateService({engine,appVersion:'0.5.0',read:async url=>url.endsWith('yt-dlp.exe')?Buffer.from('MZtampered'):read(url)});await assert.rejects(()=>tampered.installDownloader(),/verification failed/);assert.equal(installed,false);assert.equal(engine.maintenance,false);
});
