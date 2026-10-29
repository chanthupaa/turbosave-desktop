// SPDX-License-Identifier: GPL-3.0-only
import {createPublicKey,verify} from 'node:crypto';

export function verifyRelease(bytes,envelope,trust,{repository,version,now=Date.now()}){
  if(!Buffer.isBuffer(bytes)||bytes.length>100_000||!envelope||envelope.algorithm!=='Ed25519'||!/^[\w.-]{1,80}$/.test(envelope.keyId)||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature||''))throw Error('Invalid release signature.');
  const trusted=trust?.version===1&&trust.keys?.find(key=>key.id===envelope.keyId);
  if(!trusted||typeof trusted.publicKey!=='string')throw Error('The release signing key is not trusted.');
  const key=createPublicKey({key:Buffer.from(trusted.publicKey,'base64'),format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ed25519'||!verify(null,bytes,key,Buffer.from(envelope.signature,'base64')))throw Error('Release signature verification failed.');
  const manifest=JSON.parse(bytes.toString('utf8')),issued=Date.parse(manifest.issuedAt),expires=Date.parse(manifest.expiresAt);
  if(manifest.schema!==1||manifest.repository!==repository||manifest.version!==version||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now+300_000||expires<=now||expires<=issued||expires-issued>35*86400_000)throw Error('Release metadata is expired or does not match this release.');
  if(!Array.isArray(manifest.assets)||manifest.assets.length<2||manifest.assets.length>30)throw Error('Invalid release assets.');
  const names=new Set();
  for(const asset of manifest.assets){
    if(typeof asset.name!=='string'||!/^TurboSave-Desktop-[\w.-]+$/.test(asset.name)||names.has(asset.name)||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>2_000_000_000)throw Error('Invalid release asset identity.');
    names.add(asset.name);
  }
  for(const suffix of ['setup.exe','portable.exe'])if(!names.has(`TurboSave-Desktop-${version}-${suffix}`))throw Error('Signed release is missing a Windows download.');
  return manifest;
}
