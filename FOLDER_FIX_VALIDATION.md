# Default folder fix — 0.8.0-beta.4

Date: 29 October 2026. Windows x64.

## Problem and change

The renderer copied the first startup/default folder into each composer and kept it there. A later saved-folder load or Settings change updated Settings while New download and Batch continued displaying and submitting the old folder.

Composers now store only an explicit custom override. Otherwise they resolve their destination from the current saved default. The top Save to field, final action, open-folder action and submitted destination use that same value. Custom Single/Batch choices are labelled Save to (custom) and offer Use default. Cancelling a picker does not change inheritance or an existing custom choice. The Playlist destination label follows its effective default too.

Existing queued jobs, playlist groups and batch drafts retain their recorded destination. No state migration or default-folder reset is needed. Existing settings, history and downloaded files are preserved.

## Validation

- 101 source tests passed, including all 24 renderer workflow tests.
- Four new regression cases cover a saved folder arriving after startup; Settings changes with existing drafts; custom destinations and Use default; and cancelled selection with independent Batch state.
- The packaged beta check verifies that Single, Batch, Playlist and Settings all update through the real state/preload bridge and return to the original default. The beta suite now has 15 checks.
- All 46 packaged checks passed for beta.4: 41 functional checks and five security checks.
- The current release inventory requires fresh beta, details, IPC, experience, reliability and security reports for this exact version. See `artifacts/release-0.8.0-beta.4.json` for the final counts and asset checksums.
- Packaged security checks retain the five beta.3 controls: fuse settings, embedded ASAR header binding, Node-environment injection rejection, engine tampering rejection and ASAR tampering rejection.
- The first automated portable attempt exited without a report. A diagnostic run and the normal-launch rerun passed. The beta runner now captures output and detects early exits instead of waiting blindly for a report.

The local per-user installer exited successfully. All six profile files and the saved default folder were preserved, and the installed ASAR matches the tested package. The profile snapshot and previous native executable/ASAR pair were backed up before installation. Results are in `artifacts/folder-fix-install-result.json`.

The final installed-runtime check uses an isolated profile; it does not import or clear the normal history. Its executable, engines and IPC verification results are recorded in `artifacts/installed-security-upgrade.json`.

This remains an unsigned beta. Signing-key provisioning, GitHub security activation and separate clean-device release validation remain the gates documented in SECURITY.md, SIGNING.md and RELEASE_READINESS.md.
