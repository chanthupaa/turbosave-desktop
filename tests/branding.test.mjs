import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {readFile} from 'node:fs/promises';import {APP_ID,APP_NAME,taskbarDetails} from '../src/branding.mjs';
test('Windows taskbar identity uses the original logo resource and a quoted relaunch command',()=>{
 const executable=path.resolve('release/win-unpacked/TurboSave Desktop.exe'),iconPath=path.resolve('release/win-unpacked/resources/branding/turbosave.ico'),details=taskbarDetails({executable,iconPath});assert.equal(details.appId,APP_ID);assert.equal(details.appIconPath,iconPath);assert.equal(details.appIconIndex,0);assert.equal(details.relaunchCommand,`"${executable}"`);assert.equal(details.relaunchDisplayName,APP_NAME);
 for(const value of ['relative.exe','C:\\bad"app.exe',undefined])assert.throws(()=>taskbarDetails({executable:value,iconPath}));
});
test('taskbar ICO is packaged on disk separately from ASAR and window icons use decoded PNG bytes',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')),main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8');assert.ok(pkg.build.extraResources.some(r=>r.from==='build-resources/icon.ico'&&r.to==='branding/turbosave.ico'));assert.match(main,/window\.setAppDetails\(windowsBranding\)/);assert.match(main,/nativeImage\.createFromBuffer\(readFileSync/);assert.match(main,/icon:brandIcon/);assert.match(main,/new Tray\(brandIcon\)/);
});
