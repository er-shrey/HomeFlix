# HomeFlix

A Netflix-style streaming app for the movies and shows on your own computer. Everyone at home watches from a phone, laptop or smart-TV browser, or the **Android app for phones and TVs**, over the home Wi-Fi. Nothing goes to the internet: no CDN, no cloud, no account outside your home.

HomeFlix has two parts:

- **The server** (`server/`) runs on the computer that has the movies. It scans the library, streams video and keeps profiles, progress and ratings.
- **The app** (`web/`) is what people watch on. The server also serves it to any browser at its address. The same app is packaged for Android phones, tablets and TVs (`web/android/`).

- One **Admin** sign-in per device, then **"Who's watching?"** with everyone's profiles and a **+** to add one. Optional 4-digit PINs and kids profiles
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

Open the address it prints (for example `http://localhost:8080`) **on the computer running HomeFlix**. The first-time setup asks for just two things: an **Admin password** and the library folder. Setup only works on that computer, so nobody else on the Wi-Fi can make themselves Admin first.

### Signing in and profiles

- There's one sign-in: **Admin**, with just a password. Sign in once on each phone, laptop or TV; the device stays signed in.
- After signing in you see **"Who's watching?"**: tap a profile to watch, or the big **+** to add one (name, colour, optional PIN, kids limits).
- The Admin is a role, not a profile. **⚙ Admin settings** at the top of that screen asks for the Admin password **every time** (a signed-in device is shared by the whole family), and locks again when you go back to the profiles, start watching, or leave it idle for 10 minutes. It opens the library settings, the Library Fixer, the network address with a QR code for other devices, profile editing and removal, and the Admin password.
- Inside a profile, the menu only has *Switch profile*, *Viewing history* and *Profile & subtitles*. A kids profile can't lift its own age limit, and can't get into Admin settings without the password.
- **Forgot the Admin password?** Choose *Forgot password?* on the sign-in screen **on the computer running HomeFlix** to set a new one. Other devices are signed out.

To try it without your own files, `npm run mock` creates a sample library in `mock-library/` (needs ffmpeg and macOS for the poster renderer).

## The Android app (phones, tablets and TVs)

1. Install the APK on the phone or TV (see *Building the Android app* below).
2. Open **HomeFlix**. It searches the Wi-Fi network for the server by itself, usually in a few seconds.
3. If it can't find one, type the server's address and port (shown in **Admin settings → Watch on other devices**, for example `192.168.1.20` and `8080`).
4. Sign in with the Admin password, and you're at "Who's watching?".

The app remembers the server and stays signed in. **Change server** on the sign-in screen and on "Who's watching?" connects to a different one.

On **Android TV**, HomeFlix appears on the home screen. The remote's arrows move between items, **OK** selects (or plays/pauses in the player), and **Back** goes back. Phones use touch as usual.

The phone or TV must be on the same Wi-Fi as the server. Video streams straight from the server; nothing is stored on the device.

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

**Only have the video files?** That's fine. Drop them in, then open **Admin → Library Fixer**. It lists every title missing a poster, an info file or key details. Pick one and:

- **Poster or banner:** play the video, jump to a suggested moment or step frame by frame, move the crop, and save. The frame is saved as `poster.jpg` / `backdrop.jpg` in the folder (`<file name>-poster.jpg` next to a loose video file). You can upload your own picture instead. A poster that's being replaced is kept as `poster.replaced-<date>.jpg`, never deleted.
- **Info file missing:** fill in a short form (title and year are guessed from the folder name) and HomeFlix creates `info.txt` for you.

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
- Uploading videos and subtitles through the Admin page (posters and banners can already be uploaded in the Library Fixer)
- Optional "fetch details from the internet" (TMDB)
- A `movies.local` address instead of an IP address
- A signed release build of the Android app (today's APK is a debug build), and an iOS app
- Opening the video player's subtitle/settings menus with a TV remote (playback, seeking and Back work)

## Development

```bash
npm run dev   # API on :8080 (restarts on change) + Vite on :5173 with hot reload
```

It's an npm workspace with two packages:

- `server/` (`@homeflix/server`): Express + Node's built-in SQLite. The database and thumbnail cache are in `data/` at the repo root; delete it to start over. Set `PORT` to change the port (default 8080).
- `web/` (`@homeflix/web`): React + Vite, plus Capacitor for Android. `npm run build` outputs to `web/dist/`, which the server serves (`HOMEFLIX_WEB` points elsewhere).
- `scripts/make-mock-library.js`: the sample library (silent test videos). `scripts/render-app-icons.swift`: the Android icons, TV banner and splash screens.

### How the app talks to the server

- `GET /api/hello` (no sign-in) identifies a HomeFlix server; the app's network search looks for it.
- Signing in returns a token, which the app sends as `Authorization: Bearer …`. There are no cookies, so the API allows any origin (CORS).
- Images, video and subtitles can't send headers, so their URLs carry a separate **media token** (`?mt=…`). It works only for `/media/…` and can't open the API or Admin settings.
- In the Android app, a small native plugin (`NetInfoPlugin.java`) reports the device's Wi-Fi address, so the search only scans that network (254 addresses, 48 at a time).

### Building the Android app

Needs the Android SDK and Java 21.

```bash
npm run android:apk
```

The APK is written to `web/android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r <apk>` or by copying it to the device. To open the project in Android Studio, run `npm run android:open -w web`.
