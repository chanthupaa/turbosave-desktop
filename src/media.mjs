// SPDX-License-Identifier: GPL-3.0-only
import net from 'node:net';
import { lookup } from 'node:dns/promises';

export function privateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && [0,2].includes(c)) || (a === 198 && [18,19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIP(address) !== 6) return true;
  const value = address.toLowerCase();
  const first = parseInt(value.split(':')[0], 16);
  return !Number.isInteger(first) || (first & 0xe000) !== 0x2000 || /^2001:(?:db8|0*):|^2002:/.test(value);
}

export function parseSource(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Paste a public HTTPS video or audio link.');
  let url; try { url = new URL(value.trim()); } catch { throw new Error('This does not look like a complete link.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host || host === 'localhost' ||
    /\.(?:localhost|local|internal|invalid|test|example)$/.test(host) || (net.isIP(host) && privateAddress(host))) {
    throw new Error('Use a public HTTPS link. Local files and private network addresses are not supported.');
  }
  url.hash = ''; return url;
}

export async function publicTarget(value) {
  const url = parseSource(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try{addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });}
  catch{throw new Error('This source could not be reached. Check your connection and try again.');}
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error('This link resolves to a private or reserved network address.');
  return { url, addresses };
}

const video = f => Boolean(f.vcodec && f.vcodec !== 'none');
const audio = f => f.acodec ? f.acodec !== 'none' : ['mp3','m4a','aac','wav','flac','opus'].includes(f.ext);
const unknown = f => f.vcodec == null && f.acodec == null && ['mp4','webm','mov','mkv'].includes(f.ext);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value);
export const allowedExtensions = ['mp4','webm','mov','mkv','mp3','m4a','aac','wav','flac','opus','ogg'];
const numeric=value=>typeof value==='number'||typeof value==='string'&&value.trim()!=='';
const positive=value=>numeric(value)&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
export function estimatedSize(format,duration){
  const exact=positive(format.filesize);if(exact)return {filesize:exact,sizeEstimate:false};
  const approximate=positive(format.filesize_approx);if(approximate)return {filesize:approximate,sizeEstimate:true};
  const seconds=positive(format.duration)||positive(duration),bitrate=positive(format.tbr)||(positive(format.vbr)||0)+(positive(format.abr)||0);
  return {filesize:seconds&&bitrate?Math.round(seconds*bitrate*1000/8):null,sizeEstimate:true};
}
const cleanText=(value,max)=>typeof value==='string'?value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim().slice(0,max):null;
export function videoDetails(info){
  const raw=String(info.upload_date||'');let uploadDate=null;
  if(/^\d{8}$/.test(raw)){const iso=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;const date=new Date(iso);if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso)uploadDate=iso;}
  const count=value=>numeric(value)&&Number.isFinite(Number(value))&&Number(value)>=0?Math.floor(Number(value)):null;
  return {creator:cleanText(info.channel||info.uploader||info.artist,160),viewCount:count(info.view_count),likeCount:count(info.like_count),uploadDate,description:cleanText(info.description,600)};
}

export function formatsFor(info) {
  const source = (Array.isArray(info.formats) ? info.formats : [info]).filter(f => id(f.format_id) &&
    typeof f.url === 'string' && /^https?:/.test(f.url) && !f.has_drm && allowedExtensions.includes(f.ext) && (video(f) || audio(f) || unknown(f)));
  const tracks = source.filter(f => audio(f) && !video(f)).sort((a,b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  const result = [];
  const add = (f, selector, extension, kind, sound, mode = 'original',track=null) => {
    let size=estimatedSize(f,info.duration);
    if(track){const other=estimatedSize(track,info.duration);size={filesize:size.filesize&&other.filesize?size.filesize+other.filesize:null,sizeEstimate:true};}
    result.push({ selector, extension, kind, sound, mode,
    quality: f.height ? `${Math.round(f.height)}p` : kind === 'audio' && (f.abr || f.tbr) ? `${Math.round(f.abr || f.tbr)} kbps` : 'Original',
    height: Number(f.height) || 0,width:Number(f.width)||0, fps:Number(f.fps)||null,codec: String(f.vcodec==='none'?f.acodec:f.vcodec || f.acodec || '').split('.')[0].slice(0,24),...size });
  };
  for (const f of source.filter(f => video(f) || unknown(f)).sort((a,b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))) {
    add(f, f.format_id, f.ext, 'video', unknown(f) ? 'unknown' : audio(f) ? 'with' : 'without');
    if (video(f) && !audio(f)) {
      const track = tracks.find(a => f.ext === 'mp4' ? ['m4a','aac','mp3'].includes(a.ext) : ['webm','opus','ogg'].includes(a.ext));
      if (track) add(f, `${f.format_id}+${track.format_id}`, f.ext, 'video', 'with', 'merge',track);
    }
  }
  for (const f of tracks) add(f, f.format_id, f.ext, 'audio', 'with');
  const best = tracks[0] || source.find(f => video(f) && audio(f));
  if (best && best.ext !== 'mp3') result.push({ selector: best.format_id, extension: 'mp3', kind: 'audio', sound: 'with',
    quality: '192 kbps', height: 0, codec: 'MP3', mode: 'mp3',...estimatedSize({tbr:192},info.duration||best.duration) });
  const preferred = [...result.filter(f => f.mode === 'merge'), ...result.filter(f => f.mode !== 'merge')];
  const seen = new Set();
  return preferred.filter(f => { const key = [f.selector,f.mode].join(':'); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0,200)
    .map((f,index) => ({ ...f, id: String(index) }));
}

export function filename(title) {
  return String(title || 'TurboSave media').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g,' ').replace(/[. ]+$/g,'').slice(0,110)
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i,'Media $1') || 'TurboSave media';
}

export function safeError(stderr, fallback = 'The source could not be downloaded. Try a different public link or format.') {
  if (/sign in|cookies|login|bot|403|429/i.test(stderr)) return 'The source requires sign-in or verification, or is restricting access. TurboSave cannot bypass that restriction.';
  if (/unsupported url/i.test(stderr)) return 'This link is not supported by the bundled yt-dlp version.';
  if (/no space|disk full|not enough space/i.test(stderr)) return 'The destination drive does not have enough free space.';
  if (/requested format.*not available/i.test(stderr)) return 'That format is no longer available. Fetch the link again for fresh options.';
  if (/timed out|timeout/i.test(stderr)) return 'The source took too long to respond. Check your connection and retry.';
  if (/permission denied|access.*denied/i.test(stderr)) return 'The download folder is not writable. Choose another folder.';
  return fallback;
}
