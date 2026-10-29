import test from 'node:test';import assert from 'node:assert/strict';
import {createTransfer,updateTransfer,transferArgs} from '../src/transfer.mjs';
test('transfer combines both tracks instead of counting each one as an entire video',()=>{
 const job={format:{mode:'merge'},estimatedBytes:1200,message:'Checking source…'},t=createTransfer(job);
 updateTransfer(job,{filename:'video.mp4',downloaded_bytes:800,total_bytes:1000,speed:100,status:'downloading'},t,1000);
 assert.equal(job.downloadedBytes,800);assert.equal(job.eta,4);assert.equal(job.message,null);
 updateTransfer(job,{filename:'video.mp4',downloaded_bytes:1000,total_bytes:1000,status:'finished'},t,2000);
 assert.equal(job.status,'downloading','The audio track is still pending');
 updateTransfer(job,{filename:'audio.m4a',downloaded_bytes:100,total_bytes:200,speed:50,status:'downloading'},t,3000);
 assert.equal(job.downloadedBytes,1100);assert.equal(job.totalBytes,1200);assert.equal(job.eta,2);
 updateTransfer(job,{filename:'audio.m4a',downloaded_bytes:200,total_bytes:200,status:'finished'},t,4000);
 assert.equal(job.status,'processing');assert.equal(job.progress,99);assert.equal(job.eta,null);assert.equal(job.speed,null);
});
test('zero ETA stays valid, missing values remain unknown and measured speed needs a sample',()=>{
 const job={format:{}},t=createTransfer(job);updateTransfer(job,{downloaded_bytes:10,status:'downloading',eta:0},t,1000);assert.equal(job.eta,0);assert.equal(job.speed,null);
 updateTransfer(job,{downloaded_bytes:30,status:'downloading'},t,2000);assert.equal(job.speed,20);assert.equal(job.eta,null);assert.equal(job.totalBytes,null);
 updateTransfer(job,{downloaded_bytes:30,total_bytes:100,status:'downloading',speed:0,eta:0},t,3000);assert.equal(job.speed,0);assert.equal(job.eta,0);
});
test('fast mode is bounded and explicit speed caps avoid multiplying the limit across fragments',()=>{
 for(const [profile,count]of [['fast','8'],['balanced','4'],['gentle','1']]){const args=transferArgs({downloadProfile:profile,speedLimit:0});assert.equal(args[args.indexOf('--concurrent-fragments')+1],count);assert.equal(args.includes('--limit-rate'),false);}
 const limited=transferArgs({downloadProfile:'fast',speedLimit:1000000});assert.equal(limited[limited.indexOf('--concurrent-fragments')+1],'1');assert.equal(limited[limited.indexOf('--limit-rate')+1],'1000000');
});
