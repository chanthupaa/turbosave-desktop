// SPDX-License-Identifier: GPL-3.0-only
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// A fragment changes the UI's position, not the local document allowed to use IPC.
export function isTrustedUiUrl(value,expected){
  try{
    const actual=new URL(value),allowed=new URL(expected);
    if(actual.protocol!=='file:'||allowed.protocol!=='file:'||actual.hostname||allowed.hostname||actual.search||allowed.search)return false;
    // Node escapes the tilde in Windows short paths; Chromium leaves it literal.
    // Decode file URLs strictly instead of comparing their different serializations.
    return path.normalize(fileURLToPath(actual))===path.normalize(fileURLToPath(allowed));
  }catch{return false;}
}
export function assertTrustedSender(event,window,uiUrl){
  try{
    if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed()&&event?.sender===window.webContents&&
      event.senderFrame&&event.senderFrame===window.webContents.mainFrame&&isTrustedUiUrl(event.senderFrame.url,uiUrl))return;
  }catch{}
  throw new Error('Untrusted application frame.');
}
