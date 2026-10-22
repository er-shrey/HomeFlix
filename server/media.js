// Optional ffmpeg/ffprobe helpers. Everything here degrades gracefully when the tools are missing:
// no duration until the player reports it, and SVG placeholder posters instead of video frames.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { CACHE_DIR } from './config.js';

const SEARCH_DIRS = [...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

function findTool(name) {
  for (const dir of SEARCH_DIRS) {
    for (const file of [name, `${name}.exe`]) {
      const full = path.join(dir, file);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

export const FFMPEG = findTool('ffmpeg');
export const FFPROBE = findTool('ffprobe');

fs.mkdirSync(CACHE_DIR, { recursive: true });

function run(cmd, args, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
  });
}

const IMAGE_SUB_CODECS = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub']);

/** Duration plus embedded subtitle / audio streams, or null without ffprobe. */
export async function probe(file) {
  if (!FFPROBE) return null;
  try {
    const out = JSON.parse(await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
    const streams = out.streams || [];
    return {
      duration: parseFloat(out.format?.duration) || null,
      videoCodec: streams.find((s) => s.codec_type === 'video')?.codec_name || null,
      audio: streams.filter((s) => s.codec_type === 'audio').map((s) => ({ index: s.index, lang: s.tags?.language || null, codec: s.codec_name })),
      subtitles: streams.filter((s) => s.codec_type === 'subtitle').map((s) => ({
        index: s.index,
        lang: s.tags?.language || null,
        title: s.tags?.title || null,
        codec: s.codec_name,
        imageBased: IMAGE_SUB_CODECS.has(s.codec_name),
        forced: !!s.disposition?.forced,
        sdh: !!s.disposition?.hearing_impaired,
      })),
    };
  } catch {
    return null;
  }
}

// Avoid generating the same thumbnail twice when several requests arrive at once.
const inflight = new Map();

function cached(key, ext, make) {
  const out = path.join(CACHE_DIR, `${crypto.createHash('sha1').update(key).digest('hex')}.${ext}`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (inflight.has(out)) return inflight.get(out);
  const p = make(out).then(() => (fs.existsSync(out) ? out : null)).catch(() => null).finally(() => inflight.delete(out));
  inflight.set(out, p);
  return p;
}

/** A JPEG frame from the video, or null without ffmpeg. */
export function frameThumbnail(videoPath, mtime, atSeconds, width = 640) {
  if (!FFMPEG) return Promise.resolve(null);
  return cached(`thumb:${videoPath}:${mtime}:${atSeconds}:${width}`, 'jpg', (out) =>
    run(FFMPEG, ['-v', 'error', '-y', '-ss', String(atSeconds), '-i', videoPath, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', out]));
}

/** Pull an embedded text subtitle out of a video as WebVTT. */
export function extractSubtitle(videoPath, mtime, streamIndex) {
  if (!FFMPEG) return Promise.resolve(null);
  return cached(`sub:${videoPath}:${mtime}:${streamIndex}`, 'vtt', (out) =>
    run(FFMPEG, ['-v', 'error', '-y', '-i', videoPath, '-map', `0:${streamIndex}`, '-c:s', 'webvtt', out], 120_000));
}

/** Convert .ass/.ssa to WebVTT (styling is lost, text is kept). */
export function convertSubtitleFile(subPath, mtime) {
  if (!FFMPEG) return Promise.resolve(null);
  return cached(`subfile:${subPath}:${mtime}`, 'vtt', (out) =>
    run(FFMPEG, ['-v', 'error', '-y', '-i', subPath, '-c:s', 'webvtt', out]));
}

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

/** Placeholder artwork: a colored card with the title, used when nothing better exists. */
export function placeholderSvg(title, wide = false) {
  const hue = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const [w, h] = wide ? [640, 360] : [400, 600];
  const words = title.split(/\s+/);
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= (wide ? 22 : 14)) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  const size = wide ? 44 : 46;
  const startY = h / 2 - ((lines.length - 1) * size * 1.15) / 2;
  const text = lines.map((l, i) => `<text x="50%" y="${startY + i * size * 1.15}" text-anchor="middle" dominant-baseline="middle">${escapeXml(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360},55%,10%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g fill="#fff" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${size}">${text}</g>
</svg>`;
}
