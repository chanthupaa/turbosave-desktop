# Third-party software

The original TurboSave Desktop code is GPL-3.0-only. Third-party projects retain their own copyrights and licenses. Bundling does not relicense them.

| Component | Role | Upstream and license |
| --- | --- | --- |
| Electron 45.0.0 | Desktop runtime | https://github.com/electron/electron — MIT plus Chromium/Node and other notices included by Electron |
| yt-dlp | Media extraction and download | https://github.com/yt-dlp/yt-dlp — source Unlicense; standalone Windows bundle includes GPLv3+ components. Its LICENSE and THIRD_PARTY_LICENSES are copied into resources/tools/licenses. |
| FFmpeg / FFprobe | Local merging, conversion and verification | https://ffmpeg.org — the selected Gyan essentials build is GPL-enabled. Build information is at https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2; exact flags can be obtained with ffmpeg -buildconf. |
| Node.js 24 LTS | JavaScript runtime for yt-dlp | https://github.com/nodejs/node — MIT and included third-party notices; LICENSE copied into resources/tools/licenses. |
| electron-builder / NSIS | Build and installer tools | https://github.com/electron-userland/electron-builder — MIT; https://nsis.sourceforge.io/License |

`engines.lock.json` records the exact downloader/runtime versions, checksums and publisher URLs. No external fonts, stock images or borrowed application artwork are used; the interface icon is original geometric artwork.

## Binary redistribution checklist

Distribute TurboSave's complete matching source, build scripts and license. Preserve Electron's runtime notices and the files under resources/tools/licenses. For GPL-covered bundled components, make their complete corresponding sources, dependency sources, patches and build instructions available using a license-compliant method. A link to an upstream home page alone is not a substitute for corresponding source. Verify the selected FFmpeg build and its optional libraries rather than assuming every FFmpeg binary has the same license.

The initial local installer is for development/testing. Public redistribution and code-signing are separate release gates. Do not publish user-data files, downloaded media, private keys or unrelated website/server configurations.
