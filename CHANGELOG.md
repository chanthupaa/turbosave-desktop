# Changes

## 0.8.0-beta.2 — 2026-10-28

- Explicit Windows taskbar/relaunch branding uses the official TurboSave ICO from a real resource path outside ASAR.
- Load window/tray/notification images from the official PNG bytes and reapply the native taskbar identity when the window is shown.
- Keep the same AppUserModelID and explicit branded installer/uninstaller icons.

## 0.8.0-beta.1 — 2026-10-28

- Separate Single, Batch and Playlist workspaces with independent form state and per-download folders.
- Add public YouTube playlist previews, shared quality targets, persisted groups and group controls.
- Add bounded thumbnail fallbacks, decoding validation and preview retry.
- Repair missing engines automatically, check publisher metadata daily with an opt-out, and add verified FFmpeg/FFprobe and Node updates with bundled rollback.
- Default fresh profiles to device theme, High connection profile and unlimited speed; preserve existing preferences.
- Move Settings to the sidebar bottom, remove header theme/folder buttons and offer a replayable tutorial.
- Prefer exclusive same-volume final links with copy fallback; preserve safe ownership-based cleanup and resume.
- Migrate state to version 2 without discarding pending playlist entries. Add source/runtime acceptance tests and platform release-readiness documents.
- Installer and portable remain unsigned. Public binary redistribution, clean-machine verification and signing have distinct release gates.

## 0.7.0 — 2026-10-28

- Redesigned the download composer, navigation and media selection using the official TurboSave logo.
- Download overview filters show all, in-progress and saved counts using local history.
- Larger progress and speed figures, prominent Pause/Resume controls and compact completed rows.
- Consistent dark/light colors, keyboard focus, reduced-motion support and layouts down to 880px.
- Download engines and transfer settings are unchanged. Installer and portable builds are separate from the installed app.

## 0.6.0 — 2026-10-27

- Dedicated speed, time remaining, elapsed time and transferred-byte fields in Activity. Times include minutes/seconds and total seconds in brackets.
- Source checks and local processing have distinct statuses. Stale source-check text no longer hides transfer statistics.
- Video/audio track byte counts combine into one progress estimate; the first finished track no longer marks the entire download as processing.
- Fast, Balanced and Gentle connection profiles, with bounded parallel fragments and a larger initial buffer. User speed caps remain respected.
- Dark, Light and Follow Windows appearances, clearer text and larger controls.
- Start download opens Activity. Pause/Resume remain visible; keyboard focus survives progress updates.
- A short folder-confirmation welcome and replayable three-step guide. Existing confirmed folders remain confirmed.
- Timed-out media processes finish stopping before temporary-file cleanup proceeds.
- Separate installer, portable executable and source archive. This release was built without installing or uninstalling the existing PC copy.

Speed and ETA depend on the network and source. These changes do not promise a fixed speed or universal source support. Windows builds remain unsigned until a signing certificate is available.
# 0.8.0-beta.3 — Security hardening

- Verify bundled and updated engines before execution, caching hashes for unchanged files during the session; reject unexpected or redirected executable paths.
- Enforce Electron ASAR integrity and disable unused Node/debug entry points in packaged builds.
- Authenticate and limit the local proxy; constrain system utility paths and local media probing; reject oversized thumbnail dimensions.
- Add privacy-safe diagnostic export and accurate daily-check disclosures.
- Require pinned-key, expiring Ed25519 metadata for desktop release discovery; provide private key provisioning/signing helpers. No maintainer key or Authenticode certificate has been configured.
- Add tampering/security regression coverage, packaged attack checks, dependency/secret scanning, CodeQL and Dependabot configuration.

# 0.8.0-beta.4 — Default download folder synchronization

- Single and Batch follow the saved default when startup finishes and whenever Settings changes it. Explicit per-screen custom destinations stay independent.
- Label custom destinations and provide Use default to restore inheritance. Cancelled folder selection preserves the current choice.
- Keep the Playlist destination label in sync with its effective default. Existing queued jobs, playlist groups and batch drafts keep their recorded destinations.
- Add startup/default-change, custom override, cancellation and packaged-state regression coverage. Retain the security hardening from beta.3.

