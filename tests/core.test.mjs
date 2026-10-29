import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSource, privateAddress, formatsFor, filename, safeError, publicTarget } from '../src/media.mjs';
import { LocalEngine, processEnv } from '../src/engine.mjs';

test('public HTTPS only: private, mapped, credentials and local file input rejected',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.2','100.64.0.1','::1','::ffff:7f00:1','fc00::1'])assert.equal(privateAddress(address),true,address);
  for(const value of ['file:///C:/secret.txt','http://example.com/v','https://127.0.0.1/v','https://[::ffff:127.0.0.1]/v','https://user:password@example.com/v','https://server.local/a','--exec anything'])assert.throws(()=>parseSource(value));
  assert.equal(parseSource('https://youtube.com/watch?v=ac7KhViaVqc#t=4').hash,'');
});
test('public target rejects a hostname that resolves to loopback',async()=>{await assert.rejects(()=>publicTarget('https://localhost/'));});
test('each source quality survives with compatible combined audio; silent and unknown stay distinct',()=>{
  const formats=[360,720,1080,2160].map(h=>({format_id:`v${h}`,height:h,ext:'mp4',vcodec:'avc1',acodec:'none',url:'https://cdn.example.com/v'}));
  formats.push({format_id:'a',ext:'m4a',acodec:'aac',vcodec:'none',abr:128,url:'https://cdn.example.com/a'});
  const output=formatsFor({formats});assert.deepEqual(output.filter(f=>f.mode==='merge').map(f=>f.height),[2160,1080,720,360]);
  assert.equal(output.filter(f=>f.sound==='without').length,4);assert.ok(output.some(f=>f.mode==='mp3'));
  assert.equal(formatsFor({formats:[{format_id:'mp4',ext:'mp4',url:'https://cdn.example.com/v'}]})[0].sound,'unknown');
  assert.equal(formatsFor({formats:formats.slice(0,4)}).some(f=>f.sound==='with'),false);
});
test('unsafe selectors, DRM and executable formats are excluded',()=>{
  const good={format_id:'video',height:720,ext:'mp4',vcodec:'avc1',acodec:'none',url:'https://cdn.example.com/v'};
  for(const bad of [{format_id:'v; touch /tmp/pwned'},{has_drm:true},{ext:'exe'},{url:'file:///etc/passwd'}])assert.deepEqual(formatsFor({formats:[{...good,...bad}]}),[]);
});
test('filenames cannot escape a folder or use Windows device names',()=>{
  for(const title of ['../../evil','CON','NUL.mp4','a\\b/c:bad?name*','  . ']){const name=filename(title);assert.ok(name.length);assert.doesNotMatch(name,/[<>:"/\\|?*\x00-\x1f]/);assert.doesNotMatch(name,/^(CON|NUL)(\.|$)/i);}
});
test('subprocess environment never inherits provider keys or executable injection flags',()=>{
  process.env.TURBOSAVE_TEST_SECRET='fixture';process.env.NODE_OPTIONS='--inspect';
  try{const env=processEnv();assert.equal(env.TURBOSAVE_TEST_SECRET,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.ELECTRON_RUN_AS_NODE,undefined);}finally{delete process.env.TURBOSAVE_TEST_SECRET;delete process.env.NODE_OPTIONS;}
});
test('source errors are meaningful and never echo remote output or keys',()=>{
  assert.match(safeError('ERROR: HTTP 403 token=secret'),/verification|restricting/);
  assert.doesNotMatch(safeError('ERROR: remote https://x.example/?key=secret'),/secret|https:/);
});
test('queue deduplicates live jobs and downloads no longer require a confirmation checkbox',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'turbosave-test-'));const engine=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});engine.pump=async()=>{};
  engine.media.set('m',{source:'https://example.com/v',title:'Test',platform:'Test',created:Date.now(),formats:[{id:'0',selector:'v',extension:'mp4',kind:'video',quality:'720p'}]});
  await assert.rejects(()=>engine.enqueue({mediaId:'m',formatId:'missing'}),/available format/);
  const id=await engine.enqueue({mediaId:'m',formatId:'0'});assert.ok(id);
  await assert.rejects(()=>engine.enqueue({mediaId:'m',formatId:'0',rightsConfirmed:true}),/already/);
  await engine.cancel(id);assert.equal(engine.jobs[0].status,'cancelled');assert.ok(await engine.enqueue({mediaId:'m',formatId:'0',rightsConfirmed:true}));
  assert.equal(JSON.parse(await readFile(path.join(directory,'state.json'),'utf8')).version,2);
});
test('history cap never drops the current download and clearing history keeps live jobs',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'turbosave-test-'));const engine=new LocalEngine({toolsDir:directory,stateDir:directory,downloadsDir:directory});engine.pump=async()=>{};
  engine.jobs=Array.from({length:100},(_,i)=>({id:String(i),status:i===99?'downloading':'completed',createdAt:i}));
  engine.media.set('m',{source:'https://example.com/v',title:'Test',created:Date.now(),formats:[{id:'0',selector:'v',extension:'mp4',kind:'video',quality:'720p'}]});
  await engine.enqueue({mediaId:'m',formatId:'0',rightsConfirmed:true});assert.equal(engine.jobs.length,100);assert.ok(engine.jobs.some(j=>j.id==='99'));
  await engine.clearHistory();assert.equal(engine.jobs.length,2);
});
test('renderer has no Node access, remote scripts, telemetry or arbitrary IPC surface',async()=>{
  const main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8');const preload=await readFile(new URL('../src/preload.cjs',import.meta.url),'utf8');const html=await readFile(new URL('../ui/index.html',import.meta.url),'utf8');
  assert.match(main,/contextIsolation:true,nodeIntegration:false,sandbox:true/);assert.match(main,/assertTrustedSender\(event,window,uiUrl\)/);
  assert.match(html,/connect-src 'none'/);assert.doesNotMatch(preload,/exposeInMainWorld\(['"](?:ipcRenderer|require)/);assert.doesNotMatch(html,/<script[^>]+src=['"]https?:/);
});
