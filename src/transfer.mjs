// SPDX-License-Identifier: GPL-3.0-only
const nonnegative = value => Number.isFinite(value) && value >= 0;

export function transferArgs(settings) {
  const fragments = settings.speedLimit ? 1 : {fast:8, balanced:4, gentle:1}[settings.downloadProfile] || 8;
  return ['--concurrent-fragments', String(fragments), '--buffer-size', '1M', '--resize-buffer', '--progress-delta', '0.5',
    ...(settings.speedLimit ? ['--limit-rate', String(settings.speedLimit)] : [])];
}

export function createTransfer(job) {
  return {tracks:new Map(), expectedTracks:job.format?.mode === 'merge' ? 2 : 1, lastBytes:0, lastAt:0};
}

export function updateTransfer(job, progress, transfer, now=Date.now()) {
  const key=String(progress.filename || progress.info_dict?.format_id || 'media').slice(-500);
  if(!transfer.tracks.has(key) && transfer.tracks.size >= 4)return;
  const done=nonnegative(progress.downloaded_bytes) ? progress.downloaded_bytes : 0;
  const total=nonnegative(progress.total_bytes) && progress.total_bytes>0 ? progress.total_bytes :
    nonnegative(progress.total_bytes_estimate) && progress.total_bytes_estimate>0 ? progress.total_bytes_estimate : null;
  transfer.tracks.set(key, {done,total,finished:progress.status === 'finished'});
  const tracks=[...transfer.tracks.values()];
  const downloaded=tracks.reduce((sum,track)=>sum+track.done,0);
  const allKnown=tracks.length >= transfer.expectedTracks && tracks.every(track=>track.total);
  const estimated=Number.isFinite(job.estimatedBytes)&&job.estimatedBytes>0 ? job.estimatedBytes : null;
  const expected=allKnown ? tracks.reduce((sum,track)=>sum+track.total,0) : estimated;
  let speed=nonnegative(progress.speed) ? progress.speed : null;
  // Some extractors omit speed. Use measured byte growth only after a real sample interval.
  if(speed===null && progress.status!=='finished' && transfer.lastAt && now-transfer.lastAt>=500 && downloaded>transfer.lastBytes)
    speed=(downloaded-transfer.lastBytes)*1000/(now-transfer.lastAt);
  if(!transfer.lastAt || now-transfer.lastAt>=500){transfer.lastAt=now;transfer.lastBytes=downloaded;}
  job.downloadedBytes=downloaded;
  job.totalBytes=expected;
  job.transferSizeEstimate=!allKnown || !nonnegative(progress.total_bytes);
  job.speed=progress.status==='finished' ? null : speed;
  const complete=tracks.length>=transfer.expectedTracks && tracks.every(track=>track.finished);
  job.eta=complete ? null : expected && speed>0 ? Math.max(0,Math.ceil((expected-downloaded)/speed)) :
    transfer.expectedTracks===1 && nonnegative(progress.eta) ? progress.eta : null;
  job.progress=complete ? 99 : expected ? Math.min(98,Math.max(0,100*downloaded/expected)) : 0;
  job.status=complete ? 'processing' : 'downloading';
  job.message=complete ? 'Combining or converting the downloaded media…' : null;
}
