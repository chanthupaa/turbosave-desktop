# Dependency source and redistribution review

The exact original-code source archive, lockfile and build scripts accompany this candidate. This does **not** by itself establish complete corresponding-source coverage for all bundled software.

| Component | Pinned build / evidence | Source and follow-up |
| --- | --- | --- |
| TurboSave | 0.8.0-beta.4, GPL-3.0-only | Public Windows repository, matching source archive and build instructions prepared |
| yt-dlp | `engines.lock.json`; official executable; SHA-256 | https://github.com/yt-dlp/yt-dlp ; its Windows bundle contains third-party components: review `vendor/licenses/yt-dlp-THIRD_PARTY_LICENSES.txt` and obtain matching dependency sources/build inputs |
| FFmpeg / FFprobe | Gyan essentials release in `engines.lock.json`; binary `-buildconf` | https://github.com/GyanD/codexffmpeg ; https://ffmpeg.org/download.html ; obtain exact FFmpeg and enabled GPL-library sources, patches/configuration and build instructions matching this binary |
| Node | Pinned official Windows runtime | https://nodejs.org/download/release/ ; matching `node-<version>.tar.xz` and included third-party licenses |
| Electron | 45.0.0 in npm lockfile and packaged notices | https://github.com/electron/electron ; retain Electron/Chromium/Node notices and audit dependency-specific requirements |

The candidate retains bundled engine license files and Electron notices. Before public binary redistribution, supply the required corresponding sources through a suitable verified distribution method; upstream home-page links alone are not that source bundle. Record exact release tags/hashes and the method used in the final release checklist.

Unresolved gate: an authoritative matching-source/build-provenance bundle for all GPL-covered binary dependencies has not been assembled merely by preparing this beta. Do not describe this candidate as license-complete until that review is resolved. Signing and fresh-device testing are separate gates.

## Publication review — 29 October 2026

The public repository is `chanthupaa/turbosave-desktop`. Only Windows application source is published. Bundled installers are staged in a GitHub draft release while this gate remains open.

The exact Gyan 9.0.2 release identifies FFmpeg commit `946fcce07b`; its release assets provide binaries and its repository root provides a README, not a complete matching build/dependency source kit. The bundled build enables GPL/version3 and libraries including x264, x265, xvid and rubberband. The FFmpeg commit alone does not establish complete source/build coverage for these bundled libraries. The yt-dlp third-party notice also lists GPL/LGPL-covered bundled components and an upstream source-request contact. Do not make an unsupported promise that TurboSave already possesses every corresponding source needed to satisfy such requests.

Next step: obtain and verify the exact dependency source revisions, relevant patches and build scripts from the binary publishers, assemble/host the required corresponding sources, and update this record before promoting the binary release. No external source-request email has been sent on the maintainer's behalf.
