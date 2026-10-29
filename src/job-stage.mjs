// SPDX-License-Identifier: GPL-3.0-only
import path from 'node:path';import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,lstat,realpath,rm} from 'node:fs/promises';
export async function ownedStage(job){
  if(typeof job.stageName!=='string'||!/^\.turbosave-[A-Za-z0-9_-]+$/.test(job.stageName)||typeof job.stageToken!=='string')return null;
  const root=path.resolve(job.directory),stage=path.join(root,job.stageName);
  try{
    const info=await lstat(stage),marker=path.join(stage,'.owner.json'),markerInfo=await lstat(marker);
    if(!info.isDirectory()||info.isSymbolicLink()||!markerInfo.isFile()||markerInfo.isSymbolicLink()||markerInfo.size>1024)return null;
    if(path.dirname(await realpath(stage))!==await realpath(root))return null;
    const owner=JSON.parse(await readFile(marker,'utf8'));return owner.jobId===job.id&&owner.token===job.stageToken?stage:null;
  }catch{return null;}
}
export async function createStage(job){
  const stage=await mkdtemp(path.join(path.resolve(job.directory),'.turbosave-'));
  job.stageName=path.basename(stage);job.stageToken=randomUUID();
  await writeFile(path.join(stage,'.owner.json'),JSON.stringify({jobId:job.id,token:job.stageToken}),{flag:'wx',mode:0o600});return stage;
}
export async function cleanStage(job){
  const stage=await ownedStage(job);if(stage)await rm(stage,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  delete job.stageName;delete job.stageToken;
}
