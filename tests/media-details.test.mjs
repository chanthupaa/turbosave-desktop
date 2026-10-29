import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {estimatedSize,formatsFor,videoDetails} from '../src/media.mjs';import {LocalEngine} from '../src/engine.mjs';
test('file estimates distinguish reported bytes, approximate bytes, bitrate and missing information',()=>{
  assert.deepEqual(estimatedSize({filesize:1234,tbr:100},10),{filesize:1234,sizeEstimate:false});
  assert.deepEqual(estimatedSize({filesize_approx:5678},10),{filesize:5678,sizeEstimate:true});
  assert.deepEqual(estimatedSize({tbr:800},60),{filesize:6000000,sizeEstimate:true});
  for(const value of [undefined,null,-1,NaN,Infinity,true,''])assert.equal(estimatedSize({filesize:value},null).filesize,null);
  assert.equal(estimatedSize({tbr:800},null).filesize,null);
});
test('merged estimates include video plus audio, and converted MP3 uses the output bitrate',()=>{
  const formats=[{format_id:'v',ext:'mp4',height:1080,vcodec:'h264',acodec:'none',filesize:10000000,url:'https://cdn.example.com/v'},{format_id:'a',ext:'m4a',vcodec:'none',acodec:'aac',filesize:1000000,url:'https://cdn.example.com/a'}];
  const choices=formatsFor({duration:60,formats});assert.equal(choices.find(f=>f.mode==='merge').filesize,11000000);assert.equal(choices.find(f=>f.mode==='merge').sizeEstimate,true);assert.equal(choices.find(f=>f.mode==='mp3').filesize,1440000);
  delete formats[1].filesize;assert.equal(formatsFor({duration:60,formats}).find(f=>f.mode==='merge').filesize,null,'Do not omit an unknown audio size from the total');
});
test('metadata keeps real zero views, handles missing counts, validates dates and bounds descriptions',()=>{
  const value=videoDetails({channel:'Example creator',view_count:0,like_count:123,upload_date:'20261027',description:'x'.repeat(800)});
  assert.equal(value.creator,'Example creator');assert.equal(value.viewCount,0);assert.equal(value.uploadDate,'2026-10-27');assert.equal(value.description.length,600);
  for(const count of [null,undefined,'',false,NaN,-1])assert.equal(videoDetails({view_count:count}).viewCount,null);
  assert.equal(videoDetails({upload_date:'20260230'}).uploadDate,null);assert.equal(videoDetails({description:'line1\nline2\x00'}).description,'line1\nline2');
});
test('inspect returns preview and metadata without exposing selectors; thumbnail failure does not block formats',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'turbosave-details-')),engine=new LocalEngine({toolsDir:dir,stateDir:dir,downloadsDir:dir});engine.ready=true;engine.proxy={origin:'http://127.0.0.1:1',close(){}};
  const info={title:'Sample',duration:125,channel:'Creator',view_count:987,upload_date:'20261027',thumbnail:'https://1.1.1.1/thumb.jpg',formats:[{format_id:'18',ext:'mp4',height:360,vcodec:'h264',acodec:'aac',filesize:1200000,url:'https://1.1.1.1/video'}]};
  engine.run=async()=>JSON.stringify(info);engine.loadThumbnail=async()=>({dataUrl:'data:image/jpeg;base64,/9j/',bytes:12345,mime:'image/jpeg'});
  const media=await engine.inspect('https://1.1.1.1/sample');assert.equal(media.viewCount,987);assert.equal(media.creator,'Creator');assert.equal(media.thumbnailFilesize,12345);assert.ok(media.preview.startsWith('data:'));assert.equal(media.formats[0].selector,undefined);
  engine.pump=async()=>{};await engine.addDraft({mediaId:media.id,formatId:media.formats[0].id});assert.equal(engine.jobs[0].estimatedBytes,1200000);
  engine.loadThumbnail=async()=>{throw Error('Thumbnail unavailable');};assert.equal((await engine.inspect('https://1.1.1.1/other')).preview,null);await engine.close();
});
