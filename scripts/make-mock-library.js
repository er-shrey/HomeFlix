// Builds a mock library of short test videos, posters, info files and subtitles,
// covering every folder convention HomeFlix understands.
// Usage: npm run mock [-- <target-folder>]   (default: ./mock-library)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(process.argv[2] || path.join(ROOT, 'mock-library'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'homeflix-mock-'));

const MOVIES = [
  {
    folder: 'Quantum Heist (2019)', hue: 0.58, len: 60, poster: 'jpg', backdrop: true, trailer: true,
    subs: [['en', 'Quantum Heist'], ['hi', 'क्वांटम हाइस्ट']],
    info: `Title: Quantum Heist
Year: 2019
Genres: Sci-Fi, Thriller, Action
Cast: Mira Castell, Dev Anand Rao, Lucas Brenner
Director: Arjun Mehta
Age Rating: 13+
Tags: heist, time-travel, twist-ending
Language: English
Audio: English
Collection: Quantum Heist
Order: 1
Credits: last 00:08

Description:
A crew of physicists plans the perfect robbery: steal a diamond
five minutes before it is ever locked away.`,
  },
  {
    folder: 'Quantum Heist 2 (2022)', hue: 0.62, len: 60, poster: 'jpg',
    subs: [['en', 'Quantum Heist 2']],
    info: `Title: Quantum Heist 2
Year: 2022
Genres: Sci-Fi, Thriller, Action
Cast: Mira Castell, Lucas Brenner, Ana Soto
Director: Arjun Mehta
Age Rating: 13+
Tags: heist, time-travel, sequel
Language: English
Collection: Quantum Heist
Order: 2

Description:
The crew is back, but this time someone from the future is robbing them first.`,
  },
  {
    folder: 'Monsoon Express (2016)', hue: 0.08, len: 60, poster: 'jpg', backdrop: true, trailer: true,
    subs: [['en', 'Monsoon Express'], ['hi', 'मानसून एक्सप्रेस'], ['en.forced', 'Monsoon Express']],
    info: `Title: Monsoon Express
Year: 2016
Genres: Drama, Romance
Cast: Kavya Iyer, Rohan Sethi
Director: Neha Kapoor
Age Rating: 13+
Tags: train, journey, rain
Language: Hindi
Audio: Hindi
Also Known As: Barsaat Express, मानसून एक्सप्रेस

Description:
Two strangers share a sleeper berth on a 40-hour train ride through the monsoon,
and a delayed train turns into the best week of their lives.`,
  },
  {
    folder: 'The Last Lighthouse (2014)', hue: 0.52, len: 60, poster: 'png', backdrop: true,
    subs: [['en', 'The Last Lighthouse'], ['en.sdh', 'The Last Lighthouse', true]],
    info: `Title: The Last Lighthouse
Year: 2014
Genres: Drama, Mystery
Cast: Ingrid Holm, Thomas Wade
Director: Elena Varga
Age Rating: 16+
Tags: island, slow-burn, isolation
Language: English

Description:
The keeper of a lighthouse on a storm-cut island starts receiving letters
from the ship that sank there fifty years ago.`,
  },
  {
    folder: 'Paper Kites (2020)', hue: 0.15, len: 45, poster: 'jpg', trailer: true,
    subs: [['en', 'Paper Kites']],
    info: `Title: Paper Kites
Year: 2020
Genres: Animation, Family
Cast: Pip Lawson, Ruby Chen
Director: Sam Okafor
Age Rating: U
Tags: friendship, kites, feel-good
Language: English

Description:
A shy girl and her talking paper kite enter the town's great kite race.`,
  },
  {
    folder: 'Midnight Circuit (2021)', hue: 0.8, len: 60, poster: 'jpg', backdrop: true,
    subs: [['en', 'Midnight Circuit']],
    info: `Title: Midnight Circuit
Year: 2021
Genres: Action, Sci-Fi
Cast: Lucas Brenner, Yuki Tanaka
Director: Arjun Mehta
Age Rating: 16+
Tags: cyberpunk, racing, neon
Language: English

Description:
In a city that never turns its lights off, an underground racer
is hired to drive a car that drives itself.`,
  },
  {
    // Messy but valid: lowercase keys, odd spacing, a comment, an unknown key.
    folder: 'Laughing Matters (2018)', hue: 0.12, len: 45,
    info: `# typed by hand in Notepad
title :   Laughing Matters
genres: comedy,   Drama
cast: Benny Ortiz,Clara Moss
age rating: 13+
favourite scene: the wedding
language: english
description: A failed stand-up comic becomes the
most popular wedding speechwriter in town.`,
  },
  {
    folder: 'Spice Route (2023)', hue: 0.03, len: 45, poster: 'jpg',
    subs: [['en', 'Spice Route']],
    info: `Title: Spice Route
Year: 2023
Genres: Comedy, Drama
Cast: Rohan Sethi, Pooja Batra Nair
Director: Neha Kapoor
Age Rating: 13+
Tags: food, road-trip, family
Language: Hindi

Description:
Three siblings drive their late grandmother's food truck from Delhi to Kochi
to recreate her secret recipe.`,
  },
  {
    folder: 'Echoes of Andromeda (2017)', hue: 0.7, len: 60, poster: 'jpg', backdrop: true,
    // The French file is saved in Windows-1252, like many old subtitle downloads.
    subs: [['en', 'Echoes of Andromeda'], ['fr', 'Échos d’Andromède', false, 'windows-1252']],
    info: `Title: Echoes of Andromeda
Year: 2017
Genres: Sci-Fi, Drama
Cast: Camille Durand, Henri Lefèvre
Director: Élise Martin
Age Rating: 13+
Tags: space, first-contact, slow-burn
Language: French

Description:
A radio astronomer hears her own voice coming back from a galaxy
two and a half million light years away.`,
  },
  {
    folder: 'Frozen Harbor (2012)', hue: 0.55, len: 45, poster: 'jpg',
    info: `Title: Frozen Harbor
Year: 2012
Genres: Thriller, Crime
Cast: Thomas Wade, Ingrid Holm
Director: Elena Varga
Age Rating: 18+
Tags: noir, winter, smuggling

Description:
A harbor master finds a container that is not on any manifest.`,
  },
  {
    folder: 'Little Dragon\'s Big Day (2015)', hue: 0.33, len: 45, poster: 'jpg', trailer: true,
    subs: [['en', 'Little Dragon']],
    info: `Title: Little Dragon's Big Day
Year: 2015
Genres: Animation, Family, Adventure
Cast: Pip Lawson, Max Ferreira
Director: Sam Okafor
Age Rating: U
Tags: dragons, birthday, feel-good
Language: English

Description:
A small dragon who can't breathe fire yet tries to light his own birthday candles.`,
  },
  {
    // Uses a Kodi/Jellyfin-style .nfo instead of info.txt.
    folder: 'Old Town Detective (2010)', hue: 0.1, len: 45, poster: 'jpg',
    nfo: `<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>Old Town Detective</title>
  <year>2010</year>
  <plot>A retired detective is pulled back for one last case in the town he swore he'd left.</plot>
  <genre>Crime</genre>
  <genre>Mystery</genre>
  <director>Marta Kowalski</director>
  <mpaa>16+</mpaa>
  <actor><name>Victor Hale</name></actor>
  <actor><name>Clara Moss</name></actor>
  <tag>small-town</tag>
</movie>`,
  },
  {
    folder: 'Kalari (2022)', hue: 0.95, len: 60, poster: 'jpg', ext: 'mkv',
    subs: [['en', 'Kalari']],
    info: `Title: Kalari
Year: 2022
Genres: Action, Drama
Cast: Arun Menon, Divya Pillai
Director: Anil Varghese
Age Rating: 16+
Tags: martial-arts, revenge, village
Language: Malayalam

Description:
A Kalaripayattu teacher must defend the village school his father built.`,
  },
  {
    // Missing description, so it shows up under "Needs info".
    folder: 'The Quiet Garden (2019)', hue: 0.38, len: 45,
    info: `Title: The Quiet Garden
Year: 2019
Genres: Drama, Family
Language: English
Age Rating: All`,
  },
  {
    // info.txt promises Hindi CC, but only an English file exists: a mismatch.
    folder: 'Starlight Serenade (2013)', hue: 0.88, len: 45, poster: 'jpg',
    subs: [['en', 'Starlight Serenade']],
    info: `Title: Starlight Serenade
Year: 2013
Genres: Musical, Romance
Cast: Clara Moss, Benny Ortiz
Age Rating: All
Tags: music, feel-good
Language: English
Subtitles: English, Hindi

Description:
A night-shift piano tuner and a radio DJ fall in love one song request at a time.`,
  },
];

// A loose file straight in Movies/ with nothing else: should appear as "needs info".
const LOOSE_MOVIES = [{ file: 'Grandma Birthday 2019.mp4', hue: 0.45, len: 30 }];

const SERIES = [
  {
    folder: 'Signal Lost', hue: 0.6, poster: 'jpg', backdrop: true,
    info: `Title: Signal Lost
Year: 2020
Genres: Sci-Fi, Mystery
Cast: Ana Soto, Yuki Tanaka, Thomas Wade
Director: Elena Varga
Age Rating: 16+
Tags: radio, small-town, conspiracy
Language: English

Description:
When every phone in a mountain town loses signal at once,
the only working radio starts broadcasting tomorrow's news.`,
    seasons: [
      { n: 1, season: 'Intro: 00:03-00:08\nCredits: last 00:06\nDescription: The blackout begins.', eps: ['Static', 'Tomorrow\'s News', 'The Tower'] },
      { n: 2, season: 'Intro: 00:03-00:08\nCredits: last 00:06', eps: ['Aftershock', 'Two Towns', 'Frequency'] },
    ],
    epDescriptions: { '1-1': 'The town goes silent at 9:41 pm.', '1-2': 'Ana hears a broadcast about a fire that hasn\'t happened yet.' },
    subs: [['en', 'Signal Lost']],
  },
  {
    folder: 'Chai & Chaos', hue: 0.05, poster: 'jpg',
    info: `Title: Chai & Chaos
Year: 2021
Genres: Comedy
Cast: Rohan Sethi, Kavya Iyer, Pooja Batra Nair
Director: Neha Kapoor
Age Rating: 13+
Tags: family, office, feel-good
Language: Hindi
Also Known As: Chai aur Chaos

Description:
A family-run tea stall becomes the unofficial office of half of Old Delhi.`,
    seasons: [
      { n: 1, season: 'Intro: 00:02-00:06', eps: ['Opening Day', 'The Investor', 'Rain Check'] },
      { n: 2, eps: ['Franchise', 'Cousin Trouble', 'Diwali Rush'] },
    ],
    subs: [['en', 'Chai & Chaos']],
  },
  {
    folder: 'Tiny Explorers', hue: 0.3, poster: 'jpg',
    info: `Title: Tiny Explorers
Year: 2019
Genres: Animation, Family
Cast: Ruby Chen, Max Ferreira
Age Rating: U
Tags: nature, learning, feel-good
Language: English

Description:
Two ants with a magnifying glass explore the giant world of the back garden.`,
    seasons: [{ n: 1, eps: ['The Puddle Sea', 'Mount Flowerpot', 'The Night Garden', 'Rainstorm!'] }],
    subs: [['en', 'Tiny Explorers']],
  },
  {
    // Episodes sit directly in the show folder and use 1x02-style names.
    folder: 'Harbor Lights', hue: 0.56, poster: 'jpg', flat: true,
    info: `Title: Harbor Lights
Year: 2018
Genres: Crime, Drama
Cast: Victor Hale, Ingrid Holm
Director: Marta Kowalski
Age Rating: 16+
Tags: noir, harbor, police
Language: English

Description:
A night-shift harbor patrol unit polices the busiest port in the north.`,
    seasons: [{ n: 1, eps: ['Low Tide', 'Contraband', 'Lighthouse Road'] }],
  },
];

const EP_LEN = 40;
const cards = [];
const videos = [];
const pad = (n) => String(n).padStart(2, '0');

function write(file, text, encoding = 'utf8') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (encoding === 'windows-1252') {
    // Node can't encode to cp1252 directly; Latin-1 covers the accented letters used here.
    fs.writeFileSync(file, Buffer.from(text.replace(/’/g, "'").replace(/—/g, '-'), 'latin1'));
  } else {
    fs.writeFileSync(file, text);
  }
}

function image(out, w, h, title, subtitle, hue) {
  const png = out.endsWith('.png') ? out : path.join(TMP, `img-${cards.length}.png`);
  cards.push({ out: png, w, h, title, subtitle, hue, final: out });
}

function video(out, len, title, subtitle, hue) {
  const card = path.join(TMP, `card-${videos.length}.png`);
  cards.push({ out: card, w: 640, h: 360, title, subtitle, hue, final: card });
  videos.push({ out, len, card });
}

function srt(title, lang, len, sdh) {
  const lines = {
    en: ['Did you hear that?', 'We don\'t have much time.', 'Trust me, just this once.', 'Look at the sky.', 'It\'s starting again.'],
    hi: ['क्या तुमने वो सुना?', 'हमारे पास ज़्यादा समय नहीं है।', 'बस एक बार मुझ पर भरोसा करो।', 'आसमान की ओर देखो।', 'फिर से शुरू हो रहा है।'],
    fr: ['Tu as entendu ça ?', 'Nous n\'avons pas beaucoup de temps.', 'Fais-moi confiance, juste une fois.', 'Regarde le ciel, là-bas.', 'Ça recommence, déjà.'],
  }[lang] || [];
  const ts = (s) => `00:${pad(Math.floor(s / 60))}:${pad(s % 60)},000`;
  let out = '';
  let i = 1;
  for (let t = 2; t + 3 < len; t += 5) {
    let line = `${title} — ${lines[(i - 1) % lines.length]}`;
    if (sdh && i % 2 === 0) line = `[thunder rumbles]\n${line}`;
    out += `${i}\n${ts(t)} --> ${ts(t + 3)}\n${line}\n\n`;
    i++;
  }
  return out;
}

function forcedSrt(len) {
  return `1\n00:00:05,000 --> 00:00:09,000\n[Sign: Platform 4 — Mumbai Central]\n\n2\n00:00:${pad(Math.min(len - 4, 30))},000 --> 00:00:${pad(Math.min(len - 1, 33))},000\n[Song lyrics in Hindi]\n`;
}

fs.rmSync(TARGET, { recursive: true, force: true });

for (const m of MOVIES) {
  const dir = path.join(TARGET, 'Movies', m.folder);
  const base = m.folder;
  const title = m.folder.replace(/\s*\(\d{4}\)$/, '');
  const year = (m.folder.match(/\((\d{4})\)/) || [])[1] || '';
  video(path.join(dir, `${base}.${m.ext || 'mp4'}`), m.len, title, `${year} · Feature`, m.hue);
  if (m.poster) image(path.join(dir, `poster.${m.poster}`), 400, 600, title, year, m.hue);
  if (m.backdrop) image(path.join(dir, 'backdrop.jpg'), 1280, 720, title, year, m.hue + 0.03);
  if (m.trailer) video(path.join(dir, 'trailer.mp4'), 15, title, 'Official Trailer', m.hue);
  if (m.info) write(path.join(dir, 'info.txt'), m.info + '\n');
  if (m.nfo) write(path.join(dir, 'movie.nfo'), m.nfo + '\n');
  for (const [tag, subTitle, sdh, enc] of m.subs || []) {
    const lang = tag.split('.')[0];
    const content = tag.endsWith('.forced') ? forcedSrt(m.len) : srt(subTitle, lang, m.len, sdh);
    write(path.join(dir, `${base}.${tag}.srt`), content, enc);
  }
}

for (const m of LOOSE_MOVIES) {
  video(path.join(TARGET, 'Movies', m.file), m.len, path.parse(m.file).name, 'Home video', m.hue);
}

for (const s of SERIES) {
  const dir = path.join(TARGET, 'Series', s.folder);
  if (s.poster) image(path.join(dir, `poster.${s.poster}`), 400, 600, s.folder, 'Series', s.hue);
  if (s.backdrop) image(path.join(dir, 'backdrop.jpg'), 1280, 720, s.folder, 'Series', s.hue + 0.03);
  write(path.join(dir, 'info.txt'), s.info + '\n');
  for (const season of s.seasons) {
    const sdir = s.flat ? dir : path.join(dir, `Season ${season.n}`);
    if (season.season) write(path.join(sdir, 'season.txt'), season.season + '\n');
    season.eps.forEach((epTitle, i) => {
      const e = i + 1;
      const base = s.flat ? `${season.n}x${pad(e)} ${epTitle}` : `S${pad(season.n)}E${pad(e)} - ${epTitle}`;
      video(path.join(sdir, `${base}.mp4`), EP_LEN, s.folder, `S${season.n}:E${e} · ${epTitle}`, s.hue + e * 0.01);
      const desc = s.epDescriptions?.[`${season.n}-${e}`];
      if (desc) write(path.join(sdir, `${base}.txt`), `Title: ${epTitle}\nDescription:\n${desc}\n`);
      for (const [lang, subTitle] of s.subs || []) write(path.join(sdir, `${base}.${lang}.srt`), srt(subTitle, lang, EP_LEN));
    });
  }
}

// Render every image in one Swift run (Swift start-up is slow).
const specFile = path.join(TMP, 'cards.json');
fs.writeFileSync(specFile, JSON.stringify(cards.map(({ final, ...c }) => c)));
console.log(`Rendering ${cards.length} images…`);
execFileSync('swift', [path.join(ROOT, 'scripts', 'render-cards.swift'), specFile], { stdio: 'inherit' });

for (const c of cards) {
  if (c.final !== c.out) {
    fs.mkdirSync(path.dirname(c.final), { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', c.out, '-q:v', '3', c.final]);
  }
}

console.log(`Encoding ${videos.length} videos…`);
for (const [i, v] of videos.entries()) {
  fs.mkdirSync(path.dirname(v.out), { recursive: true });
  // Title card in the background, a small ticking test clock in the corner, a quiet tone.
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-loop', '1', '-framerate', '25', '-i', v.card,
    '-f', 'lavfi', '-i', 'testsrc=size=192x108:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100,volume=0.08',
    '-filter_complex', '[0:v]format=yuv420p[bg];[1:v]format=yuv420p[clock];[bg][clock]overlay=W-w-16:H-h-16[v]',
    '-map', '[v]', '-map', '2:a', '-t', String(v.len),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', v.out,
  ]);
  process.stdout.write(`\r  ${i + 1}/${videos.length}`);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nMock library ready at ${TARGET}`);
