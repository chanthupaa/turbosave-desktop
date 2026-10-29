// SPDX-License-Identifier: GPL-3.0-only
import {execFileSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:10_000_000}).split('\0').filter(Boolean);
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{36,}\b/,/\bgithub_pat_[A-Za-z0-9_]{60,}\b/,/\bAKIA[A-Z0-9]{16}\b/];
let failed=false;
for(const file of new Set(files)){
  if(/\.(?:pfx|p12|key)$/i.test(file)){console.error('Private credential file must not be tracked: '+file);failed=true;continue;}
  if((await stat(file)).size>2_000_000)continue;
  const bytes=await readFile(file);if(bytes.includes(0))continue;
  if(patterns.some(pattern=>pattern.test(bytes.toString('utf8')))){console.error('Possible credential detected in '+file+' (value withheld).');failed=true;}
}
if(failed)process.exitCode=1;else console.log('Secret scan passed (high-confidence patterns; not a guarantee).');
