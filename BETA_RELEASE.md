# TurboSave Desktop 0.8.0-beta.4

Free, open-source downloads on your computer.

Choose a video, audio track or thumbnail, pick a destination, and follow your download. Build a batch with a quality per link, or preview a public YouTube playlist and apply one quality target to your selection.

## What's new

- Download screens stay in sync with the saved default folder. Explicit custom destinations are labelled and have a Use default action. Existing queued destinations are preserved.

- Engine verification before execution with cached hashes for unchanged files.
- Packaged app integrity checks and disabled unused Node/debug entry points.
- Authenticated local proxy, bounded thumbnail dimensions and safe diagnostics export.
- Desktop release authentication support. Maintainer signing keys and Windows code signing still need configuration; this beta is unsigned.

- Independent Single, Batch and Playlist screens.
- Change the save folder before starting; edit batch draft destinations.
- Thumbnail fallbacks and retry rather than an unexplained empty preview.
- Playlist selection, ordered filenames, persistent groups and pause/resume/cancel.
- Device theme, High connection profile and unlimited speed for new profiles.
- Missing-engine repair, optional daily version checks, verified engine updates and bundled rollback.
- Cleaner header, Settings at the sidebar bottom and a replayable optional tutorial.
- Faster same-volume final-file placement when supported; no universal network-speed claim.

## Install and test

Download the Windows x64 installer or portable executable and compare its SHA-256 with the published checksum file. The beta is unsigned and Windows may show a publisher/reputation warning. Do not disable system security protections. Follow your organization's software policy.

Try a public video you are permitted to download, pause/resume it, change its destination, and try a small playlist. Report app/Windows/engine versions and exact error text. Remove private URLs, local usernames and personal file paths from reports. Never share cookies, passwords or tokens.

## Known limits

Windows only in this release. Availability and actual quality depend on the source. Login/DRM/live streams are unsupported. One active transfer; bounded working queue; up to 1,000 entries per playlist import. Estimated sizes may change. Resumable parts intentionally remain for paused jobs. See the validation report for what was tested live versus with generated fixtures.

The Windows source is public at https://github.com/chanthupaa/turbosave-desktop. Tested binaries are staged in a GitHub draft release pending the matching dependency-source coverage documented in DEPENDENCY_SOURCES.md. No public binary download is advertised yet.
