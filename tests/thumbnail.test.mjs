import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {imagePreview,loadThumbnail} from '../src/thumbnail.mjs';
const jpeg=Buffer.from([255,216,255,192,0,8,8,0,10,0,20,0]);
function requestFixture(replies,visits=[]){return (url,options,callback)=>{
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{visits.push(url.href);options.lookup(url.hostname,{},(error,address)=>{assert.equal(error,null);assert.equal(address,'1.1.1.1');});
    const reply=replies.shift(),res=new PassThrough();res.statusCode=reply.status||200;res.headers=reply.headers||{};callback(res);if(!res.destroyed)res.end(reply.body||jpeg);
  });return req;
};}
test('thumbnail preview accepts raster images and rejects HTML/SVG and oversized payloads',()=>{
  assert.equal(imagePreview(jpeg).mime,'image/jpeg');
  for(const text of ['<svg></svg>','<html>login page</html>'])assert.throws(()=>imagePreview(Buffer.from(text)));
  assert.throws(()=>imagePreview(Buffer.concat([jpeg,Buffer.alloc(2*1024*1024)])));
});
test('thumbnail requests pin the validated address and return only an image data URL',async()=>{
  const visits=[],result=await loadThumbnail('https://1.1.1.1/thumb',{request:requestFixture([{body:jpeg}],visits)});assert.equal(visits.length,1);assert.ok(result.dataUrl.startsWith('data:image/jpeg;base64,'));
});
test('thumbnail redirects are revalidated and cannot reach private network addresses',async()=>{
  const visits=[];await assert.rejects(()=>loadThumbnail('https://1.1.1.1/thumb',{request:requestFixture([{status:302,headers:{location:'https://127.0.0.1/private'}}],visits)}),/public HTTPS/);assert.equal(visits.length,1);
});
test('redirect loops, oversized responses and non-image responses are rejected',async()=>{
  await assert.rejects(()=>loadThumbnail('https://1.1.1.1/thumb',{request:requestFixture(Array.from({length:4},()=>({status:302,headers:{location:'/again'}})))}),/redirects/);
  await assert.rejects(()=>loadThumbnail('https://1.1.1.1/thumb',{request:requestFixture([{headers:{'content-length':'3000000'}}])}),/unavailable/);
  await assert.rejects(()=>loadThumbnail('https://1.1.1.1/thumb',{request:requestFixture([{body:Buffer.from('<svg/>')}])}),/Unsupported/);
});
test('the preview deadline also bounds DNS validation',async()=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new Error('Preview deadline')),20);
  try{await assert.rejects(()=>loadThumbnail('https://1.1.1.1/thumb',{validate:()=>new Promise(()=>{}),signal:controller.signal}),/deadline/);}finally{clearTimeout(timer);}
});
