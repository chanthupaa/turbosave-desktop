# How TurboSave Desktop is built

TurboSave Desktop is a Windows app made with **Electron** and plain HTML, CSS and JavaScript. The app bundles its media tools so users do not need to install Python or provide API keys.

## What each part does

| Part | Job |
| --- | --- |
| `ui/` | Independent Single/Batch/Playlist workspaces, destinations, tutorial, progress and duplicate warnings |
| Electron main process | Native folder picker, local settings, queue, safe file access and starting the media tools |
| Isolated preload | A small bridge exposing only specific actions to the interface |
| yt-dlp | Fetches source information and downloads the selected streams directly to this PC |
| FFmpeg | Combines video and audio, converts MP3/thumbnails, and decodes local frames for duplicate comparisons |
| FFprobe | Checks that output files contain the requested video/audio streams and reads duration |
| Bundled Node.js | Supports yt-dlp's JavaScript processing when a source requires it |
| electron-builder / NSIS | Packages the app and tools into a portable executable and a per-user Windows installer |

## What happens when somebody uses it

1. First launch asks for a download folder and saves the confirmed choice locally.
2. A pasted public HTTPS link is checked by yt-dlp on the PC. Available formats, duration, views, creator and other reported metadata are returned to the interface. The main process fetches a bounded thumbnail preview; a failed preview does not block formats. File-size estimates use source bytes or duration and bitrate, adding both tracks for merged video.
3. A single item enters the queue immediately. A bulk item stays in the review list with its chosen quality until **Download batch** is pressed.
4. The app checks saved source identities before adding/downloading the item. New or unknown reuploads require a content check after downloading into a temporary staging folder.
5. FFprobe verifies the output. Duplicate checks compare exact file hashes and, for videos, duration plus five small frame signatures. A possible match pauses the job for a decision.
6. The app keeps the existing file, or saves a new copy with a unique filename. It does not overwrite the original file.
7. The final chosen output is placed with an exclusive same-volume link where supported, or an exclusive copy as fallback. The job's own temporary streams and partial files are removed after completion, failure or cancellation. Paused/interrupted parts intentionally remain for resume. For an MP4 With sound choice, FFprobe must confirm both video and audio before the file is saved. Separate Audio and Thumbnail choices remain available.

Playlist entries are persisted separately from working-job history and resolve formats just before transfer. Engine repair/updates live under the application's user-data directory and never replace the user's system tools. Publisher metadata checks are daily by default, with an opt-out; normal updates require a click.

The website and VPS are not involved in this Windows download flow. File hashes, frame signatures, the queue and history stay on this PC. The selected media source still receives normal download requests and sees the PC's public IP.

## Reproduce a Windows build

From this folder, using Node.js 24 LTS and npm:

```powershell
npm ci
npm run tools:prepare
npm test
npm run build
```

Allow at least 3 GB of free disk space. `tools:prepare` verifies the publisher SHA-256 hashes listed in `engines.lock.json` before using the downloaded engines. The original app source is covered by GPLv3, with separate notices and source obligations for bundled third-party components.

Build outputs go into `release/` as `TurboSave-Desktop-<version>-portable.exe` and `TurboSave-Desktop-<version>-setup.exe`. The installer folder is separate from the media download folder chosen on first launch.

The official logo is `build-resources/icon.png`, with multi-size Windows icons in `icon.ico`. Windows resource editing stays enabled so the actual executable and shortcuts use TurboSave's icon; unsigned development builds disable signing separately. The signed build overrides that setting only when signing credentials are supplied.

The app source and matching build scripts can be archived with:

```powershell
powershell.exe -NoProfile -File scripts/package-source.ps1
```

Current test builds are unsigned. Generating a build does not publish it to GitHub. A public release still needs the redistribution/source checklist in `THIRD_PARTY_NOTICES.md` and a clean-PC installation check.

## Security builds and verification

`tools:prepare` re-extracts binaries from checksum-verified publisher archives and writes `build-resources/engines-manifest.json`. Review that manifest with lock-file changes; never regenerate trust from arbitrary replacement executables. The packaging hook checks vendor files against it and embeds the manifest inside integrity-checked app.asar. Every build path uses the same production fuse settings.

Run `node scripts/benchmark-tool-verification.mjs` to measure startup hashing and unchanged-tool checks. Run `npm run security:packaged` after building to verify fuses, embedded integrity, environment-injection rejection, engine tampering rejection and modified-ASAR termination. It tests an isolated copy and never mutates the installed app or normal profile. Run the existing beta, details, IPC, reliability and experience smoke scripts against the current portable build too.

`npm run build:signed` fails without configured Authenticode credentials. `SIGNING.md` describes separate Ed25519 release metadata provisioning. No private signing material is included in the source or this beta.
