# Security and privacy

TurboSave Desktop downloads locally through yt-dlp and FFmpeg. It does not need downloader API keys, a VPS, a personal-account login or browser cookies. History, settings, duplicate-file hashes and file locations are stored on this PC. Source sites still receive normal network requests.

The interface uses a sandboxed Electron renderer with context isolation, no Node access, no remote content and a narrow preload bridge. Public-source validation and a DNS-pinned proxy reject private network destinations. Download commands use fixed argument arrays and do not invoke a shell. Engine updates use official release endpoints and SHA-256 verification.

Missing-engine repair downloads into TurboSave's own data directory, without modifying system tools. Archives are unpacked by selecting only bounded, uniquely matched binary entries into generated destinations, not by extracting arbitrary archive paths. Every selected engine is verified before execution, including version probes. Bundled expectations live inside app.asar. Each unchanged engine is fully hashed once per session; subsequent checks compare identity, size, modification/change times and path containment. Changed files are rehashed; redirected files/directories are rejected. yt-dlp's companion engines are checked before extraction/downloads too. Packaging fails if bundled engines differ from the trusted manifest generated from publisher-verified archives.

Normal upgrades require a click and cannot replace a running engine. Daily publisher metadata checks are enabled by default and can be disabled in Settings. An altered yt-dlp cache file is quarantined rather than executed. Updated FFmpeg/Node records are checked again at startup, and rollback uses the same execution verification gate.

Version-2 local state stores playlist selections separately from the bounded working-job history. Groups restore paused after an app restart. Thumbnail bytes stay in the transient metadata cache; preview failures are independent of format/download selection.

Production Electron fuses disable RunAsNode, NODE_OPTIONS and CLI inspection. Only app.asar loads, with its header hash pinned in the executable and content integrity enforced at runtime. Child processes use absolute executable paths, fixed argument arrays, shell=false, a reduced environment and controlled working directories. PowerShell/taskkill resolve through absolute Windows system paths. The loopback proxy requires random per-session credentials, bounds connections and does not forward proxy credentials to source sites. Preview byte/time/redirect limits are supplemented by raster pixel limits before native decoding. Local output probes allow only file/pipe protocols. Cleanup refuses redirected working folders and checks ownership before deletion.

Diagnostics export saves only versions, platform, readiness flags and job status counts. It never uploads anything or includes source links, titles, filenames, local paths or raw errors. Exporting is voluntary and uses a Save dialog.

## Release authentication and boundaries

Desktop update discovery requires Ed25519-signed metadata matching an embedded maintainer public key, repository, version, expiry and published asset identities. No key has been supplied: authenticated desktop update links fail closed until a key is pinned and matching metadata is published. Tool repair still uses publisher HTTPS/checksum verification, not this TurboSave signature system. It does not protect against a compromised engine publisher.

Saved tool hashes are in the user's writable profile. They detect corruption and changed binaries, but are not an independent trust anchor against malware able to rewrite both binaries and records. ASAR integrity and hashes do not replace Windows code signing, OS permissions or antivirus. FFmpeg, yt-dlp and Node are separate processes outside the renderer sandbox. A hostile administrator or already-compromised user account is outside this application's protection boundary.

Keep the app, bundled engines and Windows updated. Media parsers are third-party software; these safeguards do not guarantee that every source or file is safe. The beta is unsigned. A trusted Authenticode certificate/service and a privately provisioned release key remain maintainer setup tasks; see SIGNING.md. Clean-machine validation remains separate from local automated checks.

CI includes npm advisory checks, high-confidence secret scanning and CodeQL. Dependabot checks npm/GitHub Actions weekly. Native-engine advisories require separate review. Dependency alerts and GitHub private vulnerability reporting are enabled for this public repository.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/chanthupaa/turbosave-desktop/security/advisories/new), not a public issue. Include app/engine versions, operation and safe error text. Use a harmless public sample if possible. Remove personal links, names, cookies, passwords and tokens from screenshots and logs. Ordinary bugs can be filed in Issues after redacting personal data.
