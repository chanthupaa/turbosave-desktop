# Contributing

Use the pinned Node/npm dependencies and run `npm test` before sending changes. Verify changes in the packaged executable when touching Electron startup, preload, engine lookup or packaging.

Keep source URLs, selectors and subprocesses in the main process. Do not add renderer Node access, raw IPC, shell commands, remote scripts or credentials. Use harmless public samples in tests. Preserve truthful format labels: separate streams require merging, and a container label does not prove audio is present.

Changes to original TurboSave code are contributed under GPL-3.0-only. Preserve upstream notices and document new dependencies and their licenses. A public release needs matching corresponding source for bundled GPL components, plus a review of binary notices.
