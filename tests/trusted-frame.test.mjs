import test from 'node:test';import assert from 'node:assert/strict';
import {isTrustedUiUrl,assertTrustedSender} from '../src/trusted-frame.mjs';
const ui='file:///C:/Users/HP%20OFFICIAL/Desktop/app/resources/app.asar/ui/index.html';
test('the exact local UI remains trusted after its fragment changes',()=>{
  for(const fragment of ['','#','#download','#settings','#https://evil.example'])assert.equal(isTrustedUiUrl(ui+fragment,ui),true);
  for(const other of ['https://evil.example/','about:blank',ui+'?redirect=true',ui.replace('index.html','other.html'),ui.replace('/ui/','/ui-copy/'),ui.replace('file:///C:','file://evil/C:'),'not a URL',undefined])assert.equal(isTrustedUiUrl(other,ui),false,String(other));
});
test('Windows short-path tildes and percent-encoded spaces refer to the same UI document',()=>{
  const short='file:///C:/Users/HPOFFI%7E1/AppData/Local/Temp/app/resources/app.asar/ui/index.html';
  assert.equal(isTrustedUiUrl(short.replace('%7E','~')+'#download',short),true);
  assert.equal(isTrustedUiUrl(ui.replace('%20',' '),ui),true);
  assert.equal(isTrustedUiUrl(short.replace('%7E','%257E'),short),false,'Double-encoded paths are different files');
  assert.equal(isTrustedUiUrl(short.replace('/ui/','/ui%2F'),short),false,'Encoded path separators must be rejected');
  assert.equal(isTrustedUiUrl(short.replace('/index.html','/other.html'),short),false);
});
test('IPC still rejects subframes, other windows, missing frames and destroyed windows',()=>{
  const frame={url:ui+'#download'},contents={mainFrame:frame,isDestroyed:()=>false},window={webContents:contents,isDestroyed:()=>false};
  assert.doesNotThrow(()=>assertTrustedSender({sender:contents,senderFrame:frame},window,ui));
  for(const event of [{sender:{},senderFrame:frame},{sender:contents,senderFrame:{url:ui}},{sender:contents,senderFrame:null},null])assert.throws(()=>assertTrustedSender(event,window,ui),/Untrusted application frame/);
  frame.url='https://evil.example/';assert.throws(()=>assertTrustedSender({sender:contents,senderFrame:frame},window,ui));frame.url=ui;
  assert.throws(()=>assertTrustedSender({sender:contents,senderFrame:frame},{...window,isDestroyed:()=>true},ui));
  assert.throws(()=>assertTrustedSender({sender:contents,senderFrame:frame},{webContents:{...contents,isDestroyed:()=>true},isDestroyed:()=>false},ui));
});
