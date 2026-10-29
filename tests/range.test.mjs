import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import {LocalEngine} from '../src/engine.mjs';import {rangeSelfTest} from '../src/range-selftest.mjs';
test('bundled yt-dlp recovers a stopped HTTP transfer without starting from byte zero',{timeout:120_000,skip:existsSync(path.resolve('vendor/bin/yt-dlp.exe'))?false:'Prepare bundled tools for HTTP Range integration'},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-range-test-')),engine=new LocalEngine({toolsDir:path.resolve('vendor'),stateDir:dir,downloadsDir:dir});try{assert.equal((await rangeSelfTest(engine)).passed,true);}finally{await engine.close();}
});
