# Windows 0.8.0-beta.1 verification — 28 October 2026

## Source and migration

- Four independent local repositories under `TurboSave/MOBILE APP`, `WEB`, `PC APP`, `TG BOT`. Existing website Git history/remote retained; no public push or deployment performed.
- 1,665 original source/evidence files were checked against a pre-migration SHA-256 inventory. Recoverable source ZIPs and the original desktop snapshot are in the sibling migration-backup directory.
- 32 recovered Android Dart/asset files remain hash-identical to the migration baseline. Android analysis passes; its existing audit still reports 17 passing / 5 failing cases. Native reconstruction/device release remains outside this milestone.
- Relocated Web: build and 158 tests pass. Relocated Telegram: 22 tests, real tool checks and nine generated-media/mock-transport smoke checks pass. These do not establish hosted readiness or real Telegram delivery.

## Windows tests

- Full suite: 86 passed, zero failed/skipped. Tests include real merging/MP3/thumbnail output, cleanup, duplicate protection, interrupted-job recovery, real HTTP Range continuation, per-job folders, independent workspaces, thumbnail fallback, engine tamper checks and playlist persistence.
- The playlist/maintenance subset was rerun after the final pagination refinement: 11 passed.
- Test-file concurrency is bounded to two to avoid competing engine boot/extraction workloads on low-resource Windows machines. An earlier unbounded run hit a tool-startup deadline; it is not counted as a passing run.
- A playlist feeder integration fixture resolved three fresh entries, recorded a quality-unavailable failure, continued to the next entry and saved verified outputs with original position prefixes. Cleanup assertions wait until the active job finishes its cleanup phase.

## Packaged runtime

Final installer and portable builds are unsigned Windows x64 executables. The final release inventory is generated only after all five acceptance reports are newer than the portable executable, report `packaged=true`, match this version and pass:

| Report under `artifacts/` | Checks |
| --- | --- |
| `packaged-beta.json` | 14: independent screens, fallback preview, 100 playlist selections, group controls, tutorial/defaults, widths and real media cleanup |
| `packaged-details.json` | 6: decoded thumbnail, sizes, audio/image choices, batch draft and layout |
| `packaged-ipc.json` | 3: actual isolated preload at initial/fragment URLs |
| `packaged-reliability.json` | 8: real Range resume, queue controls, history, speed limit, tray, preferences and update responses |
| `packaged-experience.json` | 9: progress, keyboard focus, overview, both themes, sampled contrast, guide and minimum-width controls |

Screenshots are captured from the packaged renderer and visually reviewed. A hidden batch-review panel found during that review was corrected and covered by regression checks before the final build. These are generated fixtures, not claims of every live platform working.

`scripts/prepare-release.mjs` compares packaged source/assets with the checkout and all four packaged engine binaries with the prepared binaries. It emits an engine manifest, matching source ZIP, release notes and SHA-256 sums. The exact identity counts and hashes are in `artifacts/release-0.8.0-beta.1.json`.

## Live and maintenance evidence

- Live YouTube enumeration returned **Official Blender Open Movies**, 17 entries, without downloading the playlist videos.
- Live public direct-MP4 sample: **788,493 bytes**, downloaded and FFprobe-verified. Final-file placement used an exclusive link in 1 ms on this run. Source/network availability is not universal.
- `maintenance-verification.json`: real Windows FFmpeg/FFprobe and Node archive extraction, PE/version checks, activation, persisted hash reload and bundled pair rollback passed in an isolated profile. Publisher metadata requests succeeded for yt-dlp 2026.10.26, FFmpeg 9.0.2 and Node v24.22.1. This exercise repackaged the known bundled engines; it does not falsely claim a new upstream engine version was installed.
- `finalize-benchmark.json`: three 64 MiB same-volume trials, with SHA-256 equality. Copy took about 155–366 ms; linking about 16–41 ms. This measures final placement only, not internet speed.

## Remaining publication gates

The normal installed application was observed as **0.7.0.0** and was not replaced. Tests used isolated profiles; personal state/history/downloads and hosted services were not changed. A fresh Windows device/VM installation and real installed upgrade of this beta remain separate checks. Signature/publisher reputation is unresolved. Complete corresponding-source/build-provenance coverage for GPL-covered bundled dependencies remains a binary-publication gate; see `DEPENDENCY_SOURCES.md`. No GitHub publication is claimed.
