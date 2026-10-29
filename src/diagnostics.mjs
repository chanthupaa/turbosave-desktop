// SPDX-License-Identifier: GPL-3.0-only
// Deliberate allowlist: never serialize the engine, jobs, URLs or local paths.
export function diagnosticReport(engine,appVersion){
  const versions={};
  for(const name of ['yt-dlp','ffmpeg','ffprobe','node']){
    const raw=String(engine.versions?.[name]||'');
    const match=name.startsWith('ff')?raw.match(/^ff(?:mpeg|probe) version ([\w.+-]{1,80})(?:\s|$)/):raw.match(/^(v?\d[\d.+-]{1,40})$/);
    versions[name]=match?.[1]||'unavailable';
  }
  const counts={};for(const job of engine.jobs||[])if(['draft','queued','downloading','processing','completed','failed','paused','interrupted','cancelled','skipped'].includes(job.status))counts[job.status]=(counts[job.status]||0)+1;
  return {schema:1,appVersion,platform:process.platform,architecture:process.arch,versions,ready:Boolean(engine.ready),initializing:Boolean(engine.initializing),maintenance:Boolean(engine.maintenance),dailyEngineChecks:Boolean(engine.settings?.dailyEngineChecks),jobCounts:counts};
}
