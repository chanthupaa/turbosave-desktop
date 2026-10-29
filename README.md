# TurboSave Desktop

Free, open-source video downloads on Windows 10/11 x64. Built with Electron, yt-dlp and FFmpeg.

**Publication status:** Windows source is public. The tested 0.8.0-beta.4 installer and portable app are staged in a **draft release**, pending matching-source coverage for bundled third-party dependencies. Public installer downloads are not enabled yet. See [dependency source status](DEPENDENCY_SOURCES.md) and [release readiness](RELEASE_READINESS.md).

[Releases](https://github.com/chanthupaa/turbosave-desktop/releases) · [Report a bug](https://github.com/chanthupaa/turbosave-desktop/issues) · [Report a vulnerability privately](https://github.com/chanthupaa/turbosave-desktop/security/advisories/new)

## Build the Windows app

Install Node.js 24 LTS and Git, then run these commands in PowerShell:

```powershell
git clone https://github.com/chanthupaa/turbosave-desktop.git
cd turbosave-desktop
npm ci
npm run tools:prepare
npm test
npm start
```

Use `npm run build` for installer and portable outputs. Engine preparation downloads checksum-verified publisher files. See [BUILD_GUIDE.md](BUILD_GUIDE.md). This repository contains only the Windows desktop project; Android, Web and Telegram sources are separate.

## 0.8.0-beta.4

New download, Batch and Playlist destinations follow the saved default folder. A per-screen custom choice is labelled and can be reset with Use default; existing queued items retain their original folder. See `FOLDER_FIX_VALIDATION.md` for this patch's checks.

This security beta verifies engines before use, caches unchanged engine hashes, hardens Electron's packaged runtime, authenticates the local download proxy and adds privacy-safe diagnostic export. See `SECURITY.md` for controls and limits, and `SIGNING.md` for the remaining maintainer signing setup. Desktop update links require signed metadata; no release key is configured yet.

Free, open-source downloads on your computer. Windows 10/11 x64; unsigned beta.

- **New download**, **Batch download**, **Playlists** and **Downloads** are separate screens. Settings is anchored at the bottom of the sidebar.
- Choose **Change** beside Save to before fetching or starting. This overrides the destination for that composer, without changing the Settings default. Batch draft folders remain editable until Start.
- YouTube playlists preview 100 entries at a time, up to 1,000 per import. Select videos and a shared target (default: up to 1080p) or MP3. The best supported quality at or below your target is used; video always includes sound. Entries run serially and retain their original positions in filenames.
- Playlist selections persist separately from the 20-item working queue. Groups restore paused after restart; resume them explicitly. Failed/unavailable entries are reported while remaining entries continue. Cancel stops future entries; it does not delete completed files.
- Previews try up to four source-provided HTTPS candidates within a bounded deadline. **Retry preview** is available; an unavailable thumbnail does not prevent format selection. Dark source artwork is not treated as an error.
- Fresh profiles use **Follow device theme**, **High** (eight media fragments when supported) and **Unlimited** speed. Upgrades retain saved preferences.
- Tools ship with the app. Missing tools are automatically repaired into the app data directory; the publishers are checked at most daily, unless disabled in Settings. Available updates install only on request. yt-dlp, FFmpeg/FFprobe and Node updates are checksum/version verified, and bundled rollback is available. An offline healthy installation continues working.
- Onboarding confirms your folder, then offers a short optional guide. Replay it from Settings anytime.

Temporary parts remain in ownership-marked job folders for safe resume and cleanup. Final output uses exclusive same-volume linking where available, falling back to an exclusive copy; existing files are never overwritten. A paused job intentionally retains parts. Cleanup warnings identify folders that Windows still has locked.

Run `npm test`, `npm run build`, then `node scripts/beta-smoke.mjs`. Packaged acceptance reports and screenshots are under `artifacts/`. See `RELEASE_READINESS.md`, `DEPENDENCY_SOURCES.md` and `BETA_RELEASE.md` before public distribution. Building the beta does not upgrade the installed app.

A Windows desktop app that saves public media **on your PC**, using bundled yt-dlp and FFmpeg. No downloader API key, account, VPS or Python installation is required.

## Use

1. Open the portable executable, or run the per-user installer. On the first app launch, the welcome screen asks where to save downloaded files. Choose a writable folder or confirm the suggested Downloads/TurboSave folder. This is separate from the install location. Your choice is remembered.
2. Paste a public HTTPS video/audio link and choose **Find formats**.
3. Review the thumbnail, duration, views, creator, upload date and description when the source provides them. Choose Video, Audio or Thumbnail. Video qualities are separated into with sound, without sound, and unknown sound. Where compatible separate audio exists, TurboSave offers a locally merged version.
4. Check the selected file's size, choose your folder and add the item to your queue. No ownership checkbox is required. The footer retains a short reminder about permission to download media.

Sizes marked **~** are estimates. Direct source bytes are shown as reported sizes; otherwise the app uses approximate source bytes or duration × bitrate. Merged sizes include both tracks; converted MP3 uses the selected 192 kbps output bitrate. A thumbnail estimate is available from the fetched JPEG preview when possible. Unknown sizes/counts are labelled unavailable or not reported. Container conversion and source changes can affect final size, and temporary processing needs extra free space. Each draft keeps its chosen estimate.

Thumbnail previews are fetched in the main process as bounded public HTTPS raster images, with DNS validation on redirects, a 2 MB limit and a six-second deadline. The renderer receives only image data, keeping its network access disabled. Failed previews show a placeholder without blocking format selection. Preview images and descriptions stay in the temporary metadata cache rather than the saved job history.

Activity shows progress, failures, cancellation and completed files. Clear history removes finished records, not downloaded files; drafts, paused and interrupted downloads are kept. Closing during a download asks whether to stop it. Interrupted jobs do not restart automatically; choose **Resume** in Activity to recover available parts.

## Queue, pause and background controls

Use **Pause** while a file is downloading, **Resume** for paused/interrupted items, or **Retry** after a failure. Resume refreshes source links while keeping the selected media type and quality. If the server supports continuation, existing `.part` files/fragments are reused. Some sources may restart the transfer. A changed format selector or stopped conversion starts again to avoid mixing incompatible partial files.

Paused/interrupted parts live in a unique, ownership-marked temporary folder under the chosen download folder and survive app restarts. **Discard parts** cancels that item and removes only its verified temporary folder. Successful downloads keep only the selected final output. Transient network failures can leave a paused, recoverable item; ordinary failures still clean up their parts.

Waiting items have **↑**, **↓** and **Next** controls. Draft batches can also be reordered. **Retry** refreshes available formats and returns the same item to the queue; if the selected quality disappeared, Fetch again lets you choose another. History can be searched by title/link/filename and filtered by status and media type.

Settings offers a speed limit for new or resumed downloads. Pause/resume an active item to apply a changed limit. Tray mode and Windows completion/failure notifications are optional and off by default. With tray mode enabled, closing the window keeps the app running; use the tray menu to reopen or quit. Notifications contain generic messages rather than source links/video titles. Windows settings can suppress delivery.

## Updates and signed releases

Engine metadata checks run at most daily by default and can be disabled or triggered manually. Downloader checks use the official `yt-dlp/yt-dlp` stable release feed. An installed update must match the official SHA-256 manifest, pass its version check and is stored separately from the bundled engines. Its hash is checked again at startup. **Use bundled engine** provides rollback; downloads/source checks must be idle while switching engines. Checksum verification is not a claim of an Authenticode or GPG signature.

App update checks need the public **desktop** GitHub release repository, entered as `owner/repository`. No desktop repository has been configured by this task. The app compares its version with the latest release and opens that repository's release downloads; it does not silently download or execute desktop installers. GitHub/network errors are reported without claiming the app is up to date.

The normal build remains unsigned. A separate credential-required signing build is prepared in `scripts/build-signed.mjs`; see `SIGNING.md`. A signing certificate/service and publisher verification are still needed before a genuinely signed public release can be produced.

When upgrading, close the older TurboSave window before opening the new executable. Version 0.3.2 fixes IPC frame-validation bugs caused by Windows short-path URL encoding and in-page fragment navigation. The app still validates the exact local UI document, owning window and main frame; it does not grant other pages IPC access.

## Bulk downloads, one link at a time

Open **Bulk download** (or **Build a batch**). Paste one link, fetch its information, choose its own format/resolution, and click **Add to batch**. The entry is saved with that selection and folder; the input clears for your next link. Repeat for each link, then review/reorder the list and click **Download batch**. Items download one at a time through the queue.

Each item can use a different quality or media type. Removing a draft does not delete files. A draft batch is saved on this PC across restarts and never starts by itself. Changing the folder applies to newly added items; existing items keep their displayed folders. The batch and active queue share the 20-item limit. Source changes may invalidate an old format; use Fetch again if a download fails. Previous 0.1.0 users keep their saved folder without an extra welcome screen.

## Duplicate warnings

TurboSave recognises known source video IDs, including alternate watch/short/music URLs and tracking links. It remembers completed files separately from Activity, so clearing history does not forget previous downloads. Video, audio and thumbnails are checked separately: saving audio from an existing video is still allowed.

For files already in the chosen folder, byte-identical content is matched using SHA-256 regardless of filename. For different encodes or resolutions of a video, TurboSave compares duration and five small, locally decoded frame signatures. This is a conservative **possible match**, not proof that every reupload is identical. Static, heavily edited, cropped, trimmed or watermarked copies may not match. Different videos are not treated as duplicates merely because their filenames match.

Known source matches warn before a new item is added. Content matches with a new/unknown source ID can only be checked after the new file has downloaded into a temporary folder. Activity pauses that job and offers **Keep existing** or **Save another copy**. Nothing overwrites the original. Cancel also preserves the existing file. Other queued downloads wait for the decision. Old draft batches are checked again when they start.

Only the first 200 matching regular media files directly inside the selected destination are checked per job; subfolders and symbolic links are excluded. A larger folder shows a scan-limit note. Cached signatures are reused until a file's size or modification time changes. The local index holds up to 3,000 records and can be reset from Settings without deleting media. Files saved by another app, or renamed before TurboSave indexed them, may need a download/content check before an alternate link is recognised.

## Limits

- Windows 10/11 x64. The current artifacts are unsigned; code signing remains a public-release task.
- Source availability, geographic restrictions and upstream changes affect downloads. Not every site or quality is guaranteed. No DRM, login/cookie import or live streams. Playlist imports are limited to public YouTube playlists.
- A higher resolution is offered only if the source supplies it. MP3 conversion cannot improve the original audio quality.
- One active job; up to 20 pending jobs; up to 100 local history entries. No remote analytics or history upload.
- This is a separate desktop project. It does not change TurboSave Web or prove the recovered Android project is ready.

For a plain-language walkthrough, see `BUILD_GUIDE.md`.

## Build from source

Install Node.js 24 LTS and npm on Windows. Then:

```powershell
npm ci
npm run tools:prepare
npm test
npm start
npm run build
```

`tools:prepare` fetches pinned publisher engines and verifies SHA-256 before using them. Exact versions, hashes and upstream references are in `engines.lock.json`. Tools are stored in `vendor/`, excluded from Git. `build` produces portable and per-user NSIS executables in `release/`. A source checkout is not the same as a tested packaged app.

```powershell
npm run smoke
```

The smoke check runs the actual packaged portable executable with the public Blender Sintel sample, saves a locally merged MP4, a converted MP3 and a thumbnail, and writes `artifacts/packaged-smoke.json`. It leaves its visible app window open for inspection. Test files stay in an isolated temporary self-test profile, whose output paths are recorded in the report.

`node scripts/ipc-smoke.mjs` launches the current portable executable in an isolated profile and tests state/inspection requests through its actual sandboxed renderer and preload bridge, before and after fragment changes. It writes `artifacts/packaged-ipc.json` and closes the test window. Inspection uses an invalid URL to verify the engine's input-validation response without contacting a media source.

`node scripts/details-smoke.mjs` tests fetched metadata, thumbnail rendering, size changes, checkbox removal and bulk staging through the packaged interface. It uses generated media and fixture metadata, writes `artifacts/packaged-details.json` and captures normal/compact window screenshots. It does not represent a live-platform extraction test.

`node scripts/reliability-smoke.mjs` tests the packaged queue controls, history filtering, speed-limit preference, actual Windows tray behaviour and update-response handling. A generated loopback media fixture also verifies real partial-byte continuation with the bundled yt-dlp executable. Production public-URL validation is not relaxed for this test. Notification delivery by Windows and live external services remain separate checks.

The packaged `--duplicate-self-test` mode uses generated, harmless local clips to test renamed content, resized encodes, different videos sharing a filename, alternate source URLs and Keep existing. It does not access a downloading API or scan your personal media folder.

## Privacy and security

Links and the last 100 jobs stay in the local Electron user-data directory, normally `%APPDATA%/turbosave-desktop/state.json`. Playlist selections and outcomes are stored separately in that versioned state. Your selected folder and file paths are saved there. Duplicate checks use a separate `media-library.json` containing up to 3,000 local file records, source identities, hashes and small frame signatures. Clearing Activity keeps that index; Reset duplicate memory in Settings clears the stored index without deleting media. This app contacts the media source and services required by its extractor through a loopback proxy that rejects private/reserved network destinations. Those services can see your public IP, like any direct browser download. Engine metadata checks contact GitHub/Node publishers daily unless disabled. Missing-tool repair downloads executables; normal updates require a click. The app contains no TurboSave provider credentials, telemetry SDK or advertisements.

The renderer has sandboxing and context isolation, no Node access or remote scripts, and a strict CSP. IPC is narrow and validates its sender. Subprocesses receive a minimal environment; commands never use a shell. Downloads use a unique staging folder, verify media streams, then copy to a unique output filename without overwriting existing files. Only the job's own temporary folder is cleaned up.

For an MP4 **With sound** download, only the finished MP4 is saved. Separate video/audio streams, partial files and post-processing leftovers stay in that job's staging folder and are removed after success, failure or cancellation. yt-dlp is explicitly told not to keep intermediate streams. Cleanup retries temporary Windows file locks and shows a warning in Activity if the folder still cannot be removed. Existing files, other temporary folders and separately requested MP3/thumbnail outputs are preserved. Choosing Without sound still deliberately saves a silent video.

## License and redistribution

TurboSave's original code is **GPL-3.0-only**; see `LICENSE`. Keep the license and notices, disclose changes, and provide the complete corresponding source when distributing covered binaries. Commercial use is allowed. Merely using the app does not require publishing your private files or private edits.

The bundled tools have separate notices and source requirements. Read `THIRD_PARTY_NOTICES.md` before redistributing an installer. The source archive for TurboSave itself is not a complete corresponding-source bundle for every bundled dependency. Public release must include the required dependency sources/build instructions too. Do not claim a public binary release is license-complete until that bundle has been checked.

Only save media you own, have permission to download, or that the source explicitly permits you to save.
# Version 0.7.0: a clearer workspace

The redesigned interface has a focused link composer, consistent navigation icons, dark and light themes, and overview filters for all, in-progress and saved downloads. Active transfer controls sit beside the title, so Pause and Resume remain easy to reach. Speed, time remaining, elapsed time and transferred bytes have separate fields; finished downloads use compact rows.

This is an interface update. It does not change the download engine or promise faster network transfers. The installer and portable executable are built separately; creating them does not upgrade the installed application.

# Version 0.6.0: clearer downloads

Activity shows speed, transferred bytes, elapsed time and time remaining as, for example, **5 min (300 seconds)**. Checking a source uses an indeterminate bar; conversion has its own status rather than a misleading download ETA. Unknown values say so. Video and audio track progress is combined, and status messages cannot hide the live statistics.

The Start download action opens Activity. Pause keeps recoverable parts, Resume refreshes the source safely, and Cancel discards the job's own temporary files. Keyboard focus stays on the current control when transfer statistics update. Ctrl+L focuses a link; Ctrl+J opens Activity.

Dark, Light and Follow Windows appearances are saved locally. The first-run screen stays short and confirms your folder. Quick guide can be replayed without resetting an existing setup.

New downloads default to Fast: up to eight concurrent DASH/HLS fragments, a 1MB initial buffer and twice-per-second progress reporting. Balanced uses four fragments and Gentle uses one. A user-selected speed limit uses one fragment so the limit is not multiplied. These profiles cannot exceed the source's limits or your connection capacity; ordinary direct-file downloads may use one connection. Profile changes apply to new/resumed transfers.

The installer and portable executable are unsigned. Building and isolated smoke-testing them does not install or uninstall the existing PC application. An open-source source archive is included separately; GitHub publication and Windows signing are still separate steps.

