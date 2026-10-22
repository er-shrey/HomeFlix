# HomeFlix

A Netflix-style streaming app for the movies and shows on your own computer. Everyone at home watches from a phone, laptop or smart-TV browser over the home Wi-Fi. Nothing goes to the internet: no CDN, no cloud, no account outside your home.

- One household sign-in, then **"Who's watching?"** profiles with optional 4-digit PINs and kids profiles
- **Continue Watching** that picks up at the exact second, on any device
- **Series** with seasons, auto "up next", Skip Intro and "Are you still watching?"
- **5-star ratings**, asked once at the end of a movie, after 3 episodes and at the end of each season
- **Recommendations** ("Top Picks", "Because you watched…", "More Like This"), each with a reason
- **Subtitles (CC)** in any language, auto-detected from files, with timing and size controls
- **Search** that handles typos, alternate titles, other scripts, cast names and episode titles

## Running it

Requires Node.js 22.13 or newer. ffmpeg is optional, but recommended: it makes posters from video frames and reads video lengths.

```bash
npm install
npm run build
npm start
```

Open the address it prints (for example `http://localhost:8080`). The setup wizard asks for a household sign-in, your name and the library folder. Other devices use the network address shown on the **Admin** page, which also has a QR code to scan.

To try it without your own files, `npm run mock` creates a sample library in `mock-library/` (needs ffmpeg and macOS for the poster renderer).

## Organizing the library

Inside your library folder, put movies in `Movies/` and shows in `Series/`:

```
Library/
  Movies/
    Inception (2010)/
      Inception (2010).mp4
      info.txt               ← details (optional)
      poster.jpg             ← optional; otherwise a frame from the movie is used
      backdrop.jpg           ← optional wide image for the banner
      trailer.mp4            ← optional
      Inception (2010).en.srt
      Inception (2010).hi.srt
  Series/
    Breaking Bad/
      info.txt
      poster.jpg
      Season 1/
        season.txt           ← optional: season description, intro/credits times
        S01E01 - Pilot.mp4
        S01E01 - Pilot.txt   ← optional: episode title and description
        S01E01 - Pilot.jpg   ← optional: episode thumbnail
        S01E01 - Pilot.en.srt
```

**The one rule:** a `.txt`, `.jpg` or `.srt` with the same name as a video belongs to that video.

New files show up within a few seconds. Everything is re-checked when the app starts and every 30 minutes. **Scan now** on the Admin page re-checks right away.

### info.txt

Plain text: one `Label: value` per line, with the description last. Every line is optional, capitals and spaces don't matter, and lines HomeFlix doesn't know are kept.

```
Title: 3 Idiots
Year: 2009
Genres: Comedy, Drama
Cast: Aamir Khan, Kareena Kapoor
Director: Rajkumar Hirani
Age Rating: 13+
Tags: college, friendship, feel-good
Language: Hindi
Audio: Hindi, English
Also Known As: Three Idiots, 3 इडियट्स
Collection: Harry Potter
Order: 3
Intro: 00:30-01:15
Credits: last 02:00

Description:
Two friends search for their long-lost companion…
```

- **Also Known As** lets people find a title by another name or in another script.
- **Collection** and **Order** group sequels into a row shown in viewing order.
- **Intro** turns on the Skip Intro button. **Credits** is when "up next" and the rating question appear: either `last 02:00` or a time like `42:10`. Without it, the last 3% counts as credits.
- **Subtitles** is filled in automatically from the subtitle files that really exist. If it lists a language with no file, the Admin page warns you.
- **Age Rating** is what kids profiles use: `U`, `All`, `PG`, `UA`, `13+`, `16+`, `18+`, `PG-13`, `R`, `TV-MA` and so on. Titles without one are hidden from kids profiles.

A Kodi/Jellyfin `.nfo` file is read too, if there is no info.txt. Editing a title on the Admin page saves the changes back into info.txt.

### season.txt

Applies to every episode in that season. An episode's own `.txt` overrides it.

```
Description: The blackout begins.
Intro: 00:30-01:15
Credits: last 01:40
```

### Subtitles

`Movie Name.<language>.<flags>.srt`. The language can be a code (`en`, `hi`, `eng`) or a name (`English`). Flags:

- `sdh` or `cc`: includes sound descriptions
- `forced`: always shown, for example for signs or foreign-language scenes

`.srt`, `.vtt`, `.ass` and `.ssa` files work, and so do text subtitles inside `.mkv` files. Old non-UTF-8 files are decoded automatically. Image-based subtitles (Blu-ray PGS, DVD `.sub`) can't be shown; the Admin page lists them.

### Video formats

MP4 (H.264 + AAC) plays everywhere. MKV and AVI usually play in Chrome but not always in Safari or on TVs; the Admin page lists them.

## How recommendations work

All of this runs inside the app; nothing is sent anywhere.

1. **Content similarity.** Each title is described by its genres, tags, director, cast, language and decade. Rare features count for more than common ones.
2. **Household ratings.** "Profiles who rated this 4★ or more also rated…"
3. **Your taste.** Built from your star ratings, measured against your own average, so a strict rater's 4★ counts as strong praise. Finishing something does not count as liking it.

"More Like This" shows a reason under each title: *Same director*, *Also starring…*, *Rated 5★ by Mom*, or the genres and tags it shares.

## Not in this version yet

- One-click installers for Windows and macOS (with Node and ffmpeg bundled)
- Converting MKV/HEVC files to browser-friendly MP4
- Switching between several audio tracks in one file
- Uploading files and subtitles through the Admin page
- Optional "fetch details from the internet" (TMDB)
- A `movies.local` address instead of an IP address

## Development

```bash
npm run dev   # API on :8080 (restarts on change) + Vite on :5173 with hot reload
```

- `server/`: Express + Node's built-in SQLite. The database and thumbnail cache are in `data/`; delete it to start over.
- `web/`: React + Vite. `npm run build` outputs to `web/dist/`, which the server serves.
- `scripts/make-mock-library.js`: the sample library.
