# Windows 0.7.0 interface verification — 2026-10-28

- All 72 automated tests passed. After moving active controls beside the title, the 17 renderer interaction tests passed again.
- The exact 0.7.0 portable executable passed 9 experience checks, 6 media-details checks and 3 preload/IPC checks using isolated profiles and generated fixtures. This covers overview filters, compact saved rows, Pause/Resume, quality selection, onboarding, themes, sampled text contrast of at least 4.5:1, and no horizontal overflow at 880px/920px.
- Inspected screenshots from the packaged application for the link composer, active downloads, light/dark themes and media details. Active Pause controls were verified visible without scrolling at 920px.
- UI files and self-test helpers in the packaged app.asar matched the source files. Built an NSIS installer and portable executable; the normal installed application remains 0.6.0. No normal user settings, history or media files were modified by this release verification.
- Download-engine code and transfer settings are unchanged. This interface release does not claim improved network speed; no additional live-source download benchmark was required for the visual changes.
- Windows executables remain unsigned.

# Windows 0.5.1 validation — 2026-10-27

- The user's supplied official lime-green PNG is used unchanged (SHA-256 `bcfa8c00b9f2a8ec66ec44add3e618b8339d081f009ccf26191f39c2191bc134`). It now appears in the sidebar, welcome and download landing screen. Window, tray and notification icons use the matching multi-size ICO.
- Windows resource editing is enabled independently of signing. PE icon resources in the built application, portable EXE, installer and installed application were inspected; each contains the exact official PNG. The desktop shortcut points at the installed application icon. Native executable product metadata now reports TurboSave Desktop 0.5.1 instead of Electron's defaults.
- `npm test`: **65 passed, 0 failed, 0 skipped**. The final portable app passed six metadata/layout checks (including actual logo decoding in sidebar/welcome) and three IPC checks. Its rendered branding was visually inspected.
- Local installation upgraded to **0.5.1**, preserving settings/history, engine-update settings and downloaded-file inventory. The installed runtime matches the build, all three installed IPC checks passed, the shell icon cache was notified, and the normal app was reopened.
- The build remains unsigned. The credential-required signed build explicitly enables signing when a real certificate is supplied. No GitHub push or publication was performed. Download behaviour is unchanged; the live transfer evidence below belongs to 0.5.0.

## Previous 0.5.0 evidence

- `npm test`: **65 passed, 0 failed, 0 skipped**. Tests cover owned partial-folder persistence, pause/resume, queue priority, transient network recovery, cancel cleanup, close/resume races, preferences, history filters, update checksums, engine rollback/tamper fallback and previous functionality.
- The final portable executable passed **17 packaged checks**: eight reliability/tray/update/UI checks, six metadata/layout checks and three renderer IPC checks. Reports: `artifacts/packaged-reliability.json`, `artifacts/packaged-details.json`, `artifacts/packaged-ipc.json`. The packaged queue and settings screenshots were captured and inspected.
- The bundled downloader resumed an interrupted **3,370,094-byte** generated MP4 using HTTP Range and produced an identical SHA-256. This loopback fixture is restricted to explicit self-tests; production URL/network validation is unchanged.
- **Live public-source check passed:** Blender Foundation's Big Buck Bunny (`https://www.youtube.com/watch?v=aqz-KE-bpKQ`). The live run fetched 95 format choices (not 95 unique resolutions), paused/resumed the selected video and completed a **144p MP4 with sound, 35,374,807 bytes**, a **192 kbps MP3, 15,232,463 bytes**, and a **JPEG thumbnail, 108,323 bytes**. The production queue verified media streams and saved outputs in an isolated temporary profile, not personal downloads. See `artifacts/live-download-results.json`.
- Thumbnail preview availability varied between live requests: the earlier live metadata check returned a preview; the full download check fell back to its placeholder. The separate thumbnail download passed. No guarantee is made for all sites or every CDN response.
- A live official GitHub updater check passed after an initial connection failure: stable/current **2026.10.26**, with no newer release reported. An actual engine replacement was not needed and is not claimed. Checksum rejection, startup verification, version checking and bundled rollback are tested using isolated fixtures.
- Native Windows tray close/reopen behaviour passed. Notification support and the saved opt-in preference were verified; actual OS toast delivery depends on Windows notification/Focus settings and was not visually certified.
- App update checks require a public desktop release repository; none is configured yet. They open that repository's release downloads and never silently execute app installers. Code-signing preparation is included in `SIGNING.md`; the credential-required build correctly failed without a certificate. The current binaries remain unsigned.
- Installer and portable builds completed. Packaged source matches the checkout and passed a private-credential-pattern scan. Public signing, publishing/complete corresponding-source obligations and testing on a separate clean PC remain open.
- The local per-user installation was upgraded from **0.4.0 to 0.5.0**. Existing settings/history files and the downloaded-file inventory were preserved, with a private backup under `%APPDATA%/TurboSave-backups`. The installed ASAR matches the tested runtime; its three IPC checks passed, and the normal installed app was opened. This is an upgrade on this PC, not a separate clean-PC certification. Nothing was pushed to GitHub; the user deferred publishing and has no signing certificate yet.

## Previous 0.4.0 evidence

- `npm test`: **51 passed, 0 failed, 0 skipped**. New checks cover reported/approximate/bitrate sizes, video-plus-audio totals, MP3 output size, missing counts, valid dates, safe text rendering, checkbox removal, thumbnail limits/redirect validation and preview failure handling.
- The exact **0.4.0 portable executable** passed **six metadata/preview/workflow checks** through its real renderer/preload bridge and **three IPC regression checks**. Reports: `artifacts/packaged-details.json` and `artifacts/packaged-ipc.json`.
- Generated preview imagery and fixture metadata are used for the offline packaged UI checks. These test real image decoding, visible duration/views/creator, per-quality sizes, MP3/thumbnail estimates, bulk staging and removal of the ownership checkbox. They do not claim a new live-platform extraction or download.
- Normal and 920px window screenshots were captured from the packaged app. The rendered details panel was visually inspected; there is no horizontal overflow in the compact check.
- A live public YouTube-thumbnail request to `i.ytimg.com` timed out here (both the bounded preview request and a separate curl check). Live thumbnail retrieval is therefore not marked passed. An unavailable preview leaves a placeholder and does not block available formats; this fallback is tested. Other metadata is shown only when supplied by the source.
- Thumbnail HTTP is main-process-only, HTTPS/DNS-pinned, redirect-validated, capped at 2 MB and bounded by a six-second deadline. Only raster image data reaches the renderer; remote renderer networking stays disabled. View/description metadata and previews stay in the temporary metadata cache, rather than saved download history.
- Portable and NSIS installer builds completed; both are unsigned. Packaged source matches the checkout. Clean-PC installation and public redistribution/source obligations remain open.

## Previous 0.3.2 evidence

- `npm test`: **40 passed, 0 failed, 0 skipped**.
- Reproduced “Untrusted application frame” through real renderer IPC. Two string-comparison errors were identified: fragment navigation changed the document URL, and Node's Windows short-path URL encoded `~` as `%7E` while Chromium retained `~`.
- The guard now strictly decodes file URLs and compares the exact normalized local paths, retaining the owning-WebContents and main-frame checks. Other documents, query URLs, remote hosts, subframes and destroyed windows remain rejected. Encoded separators and double-encoded paths are covered by regression tests.
- A packaged unpacked-app check passed from a Windows 8.3 short path. The final **0.3.2 portable executable** also passed all **three renderer/preload IPC checks** (initial document, empty fragment and `#download`). See `artifacts/packaged-ipc.json`. Both `state:get` and `media:inspect` are exercised through the actual preload bridge. Inspection deliberately uses an invalid URL to verify engine input validation without fetching remote media.
- Portable and per-user NSIS installer builds completed. Both remain unsigned. Clean-PC installer testing and the public redistribution/source checklist remain open. No new live-provider download is claimed by these IPC checks.

## Previous 0.3.1 evidence

- `npm test`: **37 passed, 0 failed, 0 skipped**.
- Portable and per-user NSIS installer builds completed. Both are unsigned; clean-PC installer testing remains open.
- The exact **0.3.1 portable executable** was launched with the isolated offline self-test. All **11 packaged checks passed**: the five duplicate checks below, plus final MP4-with-audio preservation, missing-audio rejection, failed/cancelled transfer cleanup, and separate MP3/JPEG preservation. See `artifacts/packaged-duplicates.json`.
- Cleanup checks use generated clips, simulated source transfer and real bundled FFmpeg/FFprobe through the production queue. They verify no temporary stream, partial, metadata or thumbnail pieces remain in that job's destination after finishing, failing or cancelling. Pre-existing files and a different staging-like folder remain untouched. These are offline pipeline checks, not new live-source download claims.
- Cleanup retries transient Windows file locks. If removal still fails, Activity displays the exact temporary folder instead of silently hiding the failure. A DOM test verifies this warning remains visible for a completed download.
- Runtime source and all four media tools match the packaged files. MP4 With sound selections require both video and audio before saving. Separate Audio/Thumbnail choices, and deliberately selected silent-video formats, remain available.

## Previous 0.3.0 evidence

- `npm test`: **35 passed, 0 failed, 0 skipped**. This includes welcome/folder persistence, bulk items with independent resolutions, duplicate-choice UI, known-source matching, renamed bytes, resized re-encodes, cancellation, changed-file protection, and no-overwrite copying.
- Portable and per-user NSIS installer builds completed. Both are unsigned. The installer was generated and has not been installed on a clean Windows account as part of this check.
- The delivered **0.3.0 portable executable** was launched with the isolated offline duplicate self-test. Its real packaged backend and bundled FFmpeg passed all five cases below. The report is `artifacts/packaged-duplicates.json`.
- Runtime source files and bundled engines are checked against the files actually shipped. No private downloader API key or VPS connection is required.

| Packaged-executable check | Result |
| --- | --- |
| Renamed file matched by SHA-256 | Passed |
| Alternate YouTube watch/music URLs matched the saved identity | Passed |
| Resized, re-encoded video matched sampled frames | Passed |
| Different content sharing the incoming filename avoided a duplicate warning | Passed |
| Bulk queue paused; Keep existing preserved the original bytes | Passed |

The packaged tests use generated, non-explicit clips in an isolated temporary profile. They do not scan personal media folders. JavaScript DOM tests cover the choice buttons; an exhaustive manual check of every native dialog and a clean-PC installation remain open. Earlier computer-control verification was stopped by the user; that is not represented as a completed manual UI test.

## Practical limits

Known source identities can warn before another download. Unknown reposts require downloading to staging before comparing their content. Visual similarity is a conservative possible match, not a universal detector: heavily edited, cropped, watermarked, trimmed or static copies may be missed. Exact bytes still match by SHA-256. Checks cover up to 200 matching regular media files directly in the selected folder, with a scan-limit notice for larger folders. Subfolders and symbolic links are excluded. Source restrictions and verification requirements still apply.

The welcome and one-link-at-a-time bulk workflows are included in this build. Neither this build nor its source has been published to GitHub by this task. The public-release/source checklist in THIRD_PARTY_NOTICES.md still applies.

---

## Earlier 0.1.0 live-source evidence

The following results were from the earlier 0.1.0 build. They were not repeated as live-source tests of 0.3.1; the current run focused on local cleanup, duplicate and workflow changes.

### Windows 0.1.0 — 2026-10-27

- `npm test`: **12 passed, 0 failed**, including URL/filename boundaries, format selection, permissions, queue retention, interrupted-job recovery and real child-process shutdown.
- Portable and per-user NSIS installer builds completed on Windows x64. Both are unsigned. The installer was generated; it was not installed as part of this test.
- The delivered portable executable was launched. Its extracted Electron runtime reported `app.isPackaged = true`, context isolation enabled, sandbox enabled and renderer Node integration disabled.
- The packaged source files were compared byte-for-byte with the checkout. All four packaged engines matched the prepared binaries. Build archives and SDK extraction directories were excluded from the app.

## Real portable-app download check

Public test source: Blender Foundation's **Sintel — Open Movie**, `https://www.youtube.com/watch?v=eRsGyueVLvQ`.

The extractor returned **58 format choices** (including audio tracks and combined-stream choices; this is not 58 different resolutions).

| Operation | Result | Output |
| --- | --- | --- |
| Separate video + audio merged locally | Passed | MP4, 19,830,153 bytes; FFprobe confirmed AV1 video at 256×128 plus AAC audio, duration 888.09 s |
| Local audio conversion | Passed | MP3, 21,314,348 bytes; FFprobe confirmed MP3 audio, duration 888.05 s |
| Source thumbnail | Passed | JPG, 17,814 bytes |

The smoke intentionally selected a small available video resolution to limit test bandwidth. Higher resolutions were listed, but were not individually downloaded during this check. Automated selector tests cover 360p, 720p, 1080p and 2160p selection and audio pairing using fixtures.

Earlier attempts encountered DNS failures and source verification/rate restrictions; those limits still apply and were not bypassed. One successful source test does not guarantee every website or every future request. Browser-cookie import and DRM bypass are not included.

The live test ran through the same engine and queue used by the interface. The window was observed through Windows accessibility, but an exhaustive manual test of every GUI control and a clean-PC installation have not been completed. Current test downloads remain in Downloads/TurboSave for inspection.

## Public release gates

Decide on code signing, verify the installer on a clean Windows account/device, prepare and check the required corresponding-source bundle for bundled GPL components, and choose a public repository/release destination. Source code, build instructions and the original-code GPLv3 license are included here. No GitHub publication was performed by this build task.
# Version 0.6.0 verification and installed upgrade — 2026-10-27

- 71 automated tests passed, including combined-track telemetry, real HTTP Range resume, cleanup, private-network guards, persistence and renderer flows.
- Exact 0.6.0 portable: 7 experience checks, 6 media-details checks and 8 reliability checks passed. Dark/light samples met 4.5:1 text contrast for the tested elements; 920px layout had no horizontal overflow. This is sampled verification, not a claim of a complete accessibility certification.
- Installer SHA-256: `D0C03A7FF42092A1123FCEAEC55A6D461E5C3ACB66748739D02B800DA4F1014D`.
- At the user's later explicit request, used the official 0.5.1 uninstaller and 0.6.0 NSIS installer; both returned exit code 0. A local backup of the persistent app files was made first under LocalAppData/TurboSave Upgrade Backups.
- Installed executable reports 0.6.0.0. Its app.asar matches the tested build. The actual installed executable passed all 3 preload/renderer IPC checks at the initial page and URL fragments.
- Local state/history and duplicate library hashes remained unchanged through the upgrade. Both history entries and the existing external download folder were retained. The new installed app was opened.
- Builds remain unsigned. No GitHub publication or clean-machine/Windows certificate claim is made.

