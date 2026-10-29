import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {existsSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {LocalEngine} from '../src/engine.mjs';import {cleanupSelfTest} from '../src/cleanup-selftest.mjs';

test('real merge, missing sound, failure, cancellation, MP3 and thumbnail clean only their own staging files', {timeout:120_000,skip:existsSync(path.resolve('vendor/bin/ffmpeg.exe'))?false:'Run tools:prepare for bundled-engine integration checks'}, async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-cleanup-test-'));
  const engine=new LocalEngine({toolsDir:path.resolve('vendor'),stateDir:dir,downloadsDir:path.join(dir,'downloads')});
  try{await engine.init();const checks=await cleanupSelfTest(engine);assert.equal(checks.length,6);assert.ok(checks.every(check=>check.passed));}
  finally{await engine.close();}
});
