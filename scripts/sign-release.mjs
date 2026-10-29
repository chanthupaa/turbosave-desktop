// SPDX-License-Identifier: GPL-3.0-only
// Generate keys privately outside this repository. This script never prints a key.
import {createPrivateKey,createPublicKey,sign,createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRelease} from '../src/release-auth.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const keyFile=process.env.TURBOSAVE_RELEASE_PRIVATE_KEY,keyId=process.env.TURBOSAVE_RELEASE_KEY_ID;
if(!keyFile||!path.isAbsolute(keyFile)||!keyId)throw Error('Configure a private Ed25519 key file and key ID outside the repository. See SIGNING.md.');
const key=createPrivateKey(await readFile(keyFile));if(key.asymmetricKeyType!=='ed25519')throw Error('Release metadata needs an Ed25519 key.');
const trust=JSON.parse(await readFile(path.join(root,'build-resources/update-trust.json'),'utf8'));
const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
if(!trust.keys?.some(item=>item.id===keyId&&item.publicKey===publicKey))throw Error('The signing public key is not pinned in this build.');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),repository=process.env.TURBOSAVE_RELEASE_REPOSITORY;
if(!/^[\w-]{1,39}\/[\w.-]{1,100}$/.test(repository||''))throw Error('Set the exact desktop release repository.');
const assets=[];for(const suffix of ['setup.exe','portable.exe']){const name=`TurboSave-Desktop-${pkg.version}-${suffix}`,file=path.join(root,'release',name);assets.push({name,bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}
const bytes=Buffer.from(JSON.stringify({schema:1,repository,version:pkg.version,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400_000).toISOString(),assets},null,2)+'\n');
const envelope={algorithm:'Ed25519',keyId,signature:sign(null,bytes,key).toString('base64')};
verifyRelease(bytes,envelope,trust,{repository,version:pkg.version});
await writeFile(path.join(root,'release/turbosave-release.json'),bytes);
await writeFile(path.join(root,'release/turbosave-release.sig.json'),JSON.stringify(envelope,null,2)+'\n');
console.log('Signed release metadata saved. Publish both metadata files beside the exact installers.');
