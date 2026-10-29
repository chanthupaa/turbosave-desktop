// SPDX-License-Identifier: GPL-3.0-only
import path from 'node:path';
const utilities={powershell:['WindowsPowerShell','v1.0','powershell.exe'],taskkill:['taskkill.exe']};
export function windowsSystemTool(name){
  if(!Object.hasOwn(utilities,name))throw Error('Unknown Windows utility.');
  const root=process.env.SystemRoot||process.env.WINDIR||'C:\\Windows';
  if(!path.win32.isAbsolute(root)||/["\r\n]/.test(root))throw Error('Invalid Windows system directory.');
  return path.win32.join(root,'System32',...utilities[name]);
}
export function isSystemTool(file){return ['powershell','taskkill'].some(name=>windowsSystemTool(name).toLowerCase()===String(file).toLowerCase());}
