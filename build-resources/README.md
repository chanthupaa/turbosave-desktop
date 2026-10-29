# TurboSave logo

`icon.png` is the official lime-green download mark supplied by the user. SHA-256: `bcfa8c00b9f2a8ec66ec44add3e618b8339d081f009ccf26191f39c2191bc134`.

The same PNG is used in the sidebar, welcome screen and download landing screen. `icon.ico` contains sizes from 16 to 256 pixels; its 256px PNG entry is byte-identical to the official image. The ICO is used for the application window, tray, notifications, executable and installers.

From 0.8.0-beta.2 the window/tray/notification native images are decoded directly from the PNG bytes. A second identical ICO is shipped at `resources/branding/turbosave.ico` outside ASAR for Windows' taskbar/relaunch icon resource. The window explicitly sets its AppUserModelID, icon resource, relaunch display name and relaunch command. Existing installer-created Desktop/Start-menu shortcuts are updated to this resource without creating or repinning shortcuts. The persistent user-data folder is unchanged.

Windows resource editing is enabled even for unsigned builds (`signAndEditExecutable: true`, `signExecutable: false`). Turning resource editing off would leave Electron's default executable icon. The separate signed build explicitly enables signing and requires a real certificate.
