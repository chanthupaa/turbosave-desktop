// SPDX-License-Identifier: GPL-3.0-only
import path from 'node:path';
export const APP_ID='org.turbosave.desktop';
export const APP_NAME='TurboSave Desktop';
export function taskbarDetails({executable,iconPath}){
  for(const value of [executable,iconPath])if(typeof value!=='string'||!path.isAbsolute(value)||/["\r\n]/.test(value))throw Error('Invalid Windows branding path.');
  return {appId:APP_ID,appIconPath:iconPath,appIconIndex:0,relaunchCommand:`"${executable}"`,relaunchDisplayName:APP_NAME};
}
