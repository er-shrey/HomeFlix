// Subtitle discovery (from file names), text decoding and SRT/VTT conversion.
import fs from 'node:fs';

const LANGUAGES = [
  ['en', 'eng', 'English'], ['hi', 'hin', 'Hindi'], ['fr', 'fre', 'French', 'fra'], ['es', 'spa', 'Spanish'],
  ['de', 'ger', 'German', 'deu'], ['it', 'ita', 'Italian'], ['pt', 'por', 'Portuguese'], ['ru', 'rus', 'Russian'],
  ['ja', 'jpn', 'Japanese'], ['ko', 'kor', 'Korean'], ['zh', 'chi', 'Chinese', 'zho'], ['ar', 'ara', 'Arabic'],
  ['ta', 'tam', 'Tamil'], ['te', 'tel', 'Telugu'], ['ml', 'mal', 'Malayalam'], ['kn', 'kan', 'Kannada'],
  ['bn', 'ben', 'Bengali'], ['mr', 'mar', 'Marathi'], ['gu', 'guj', 'Gujarati'], ['pa', 'pan', 'Punjabi'],
  ['ur', 'urd', 'Urdu'], ['nl', 'dut', 'Dutch', 'nld'], ['sv', 'swe', 'Swedish'], ['no', 'nor', 'Norwegian'],
  ['da', 'dan', 'Danish'], ['fi', 'fin', 'Finnish'], ['pl', 'pol', 'Polish'], ['tr', 'tur', 'Turkish'],
  ['he', 'heb', 'Hebrew'], ['th', 'tha', 'Thai'], ['id', 'ind', 'Indonesian'], ['vi', 'vie', 'Vietnamese'],
  ['el', 'gre', 'Greek', 'ell'], ['cs', 'cze', 'Czech', 'ces'], ['hu', 'hun', 'Hungarian'], ['ro', 'rum', 'Romanian', 'ron'],
];

const LOOKUP = new Map();
for (const [code, three, name, alt] of LANGUAGES) {
  for (const key of [code, three, name.toLowerCase(), alt]) if (key) LOOKUP.set(key, { code, name });
}

/** "hi" / "hin" / "Hindi" -> { code: 'hi', name: 'Hindi' } */
export function lookupLanguage(token) {
  return token ? LOOKUP.get(String(token).trim().toLowerCase()) || null : null;
}

export const languageName = (code) => lookupLanguage(code)?.name || null;

/**
 * Work out language and flags from the parts of a subtitle file name after the video name.
 * "Movie.en.sdh.srt" -> tokens ['en', 'sdh']
 */
export function describeSubtitle(tokens) {
  let lang = null;
  let sdh = false;
  let forced = false;
  for (const t of tokens.map((x) => x.toLowerCase())) {
    if (t === 'sdh' || t === 'cc') sdh = true;
    else if (t === 'forced') forced = true;
    else if (!lang) lang = lookupLanguage(t);
  }
  let label = lang ? lang.name : 'Subtitles';
  if (sdh) label += ' (CC)';
  if (forced) label += ' (Forced)';
  return { lang: lang?.code || null, label, sdh, forced };
}

/**
 * Read a subtitle file as text. Many old .srt files aren't UTF-8; when the bytes aren't valid
 * UTF-8 we fall back to Windows-1252, which covers most Western European downloads.
 */
export function readSubtitleText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})|(\d{1,2}):(\d{2})[,.](\d{1,3})/g;

function shiftTimes(line, offsetMs) {
  return line.replace(TIME, (m, h, mi, s, ms, mi2, s2, ms2) => {
    let total = h !== undefined
      ? ((+h * 60 + +mi) * 60 + +s) * 1000 + +ms.padEnd(3, '0')
      : (+mi2 * 60 + +s2) * 1000 + +ms2.padEnd(3, '0');
    total = Math.max(0, total + offsetMs);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(total / 3600000))}:${p(Math.floor(total / 60000) % 60)}:${p(Math.floor(total / 1000) % 60)}.${p(total % 1000, 3)}`;
  });
}

/** Convert SRT (or re-time existing VTT) to WebVTT, applying an optional offset. */
export function toVtt(text, offsetMs = 0) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = ['WEBVTT', ''];
  let i = lines[0]?.startsWith('WEBVTT') ? 1 : 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('-->')) {
      // Drop a bare SRT cue number on the line before.
      if (out.length && /^\d+$/.test(out[out.length - 1].trim())) out.pop();
      out.push(shiftTimes(line.replace(/,(\d{3})/g, '.$1'), offsetMs));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
