// SPDX-License-Identifier: GPL-3.0-only
import {generateKeyPairSync} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {windowsSystemTool} from '../src/system-tools.mjs';
const directory=process.env.TURBOSAVE_RELEASE_KEY_DIRECTORY,id=process.env.TURBOSAVE_RELEASE_KEY_ID,root=fileURLToPath(new URL('..',import.meta.url));
if(!directory||!path.isAbsolute(directory)||!id||!/^[\w.-]{1,80}$/.test(id)||!path.relative(root,directory).startsWith('..'+path.sep))throw Error('Choose a new key directory outside this repository and a key ID. See SIGNING.md.');
await mkdir(directory,{mode:0o700});
if(process.platform==='win32'){
  const sid=execFileSync(windowsSystemTool('powershell'),['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();
  if(!/^S-1-[\d-]+$/.test(sid))throw Error('Cannot determine the current Windows user. No private key was generated.');
  execFileSync(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','icacls.exe'),[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'ignore',windowsHide:true});
}
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
await writeFile(path.join(directory,'release-private.pem'),privateKey.export({format:'pem',type:'pkcs8'}),{flag:'wx',mode:0o600});
await writeFile(path.join(directory,'public-key.json'),JSON.stringify({id,publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')},null,2)+'\n',{flag:'wx'});
console.log('Release key created outside the repository. Copy only the public-key.json record into build-resources/update-trust.json and rebuild. Back up the private key securely.');
