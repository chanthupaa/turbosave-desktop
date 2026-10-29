// SPDX-License-Identifier: GPL-3.0-only
const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(channel,...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok){const error=new Error(result.error);if(result.code==='DUPLICATE_MEDIA'){error.code=result.code;error.duplicates=result.duplicates;}throw error;}return result.data;};
contextBridge.exposeInMainWorld('turbo',Object.freeze({
  state:()=>invoke('state:get'),inspect:(url,directory)=>invoke('media:inspect',url,directory),retryPreview:value=>invoke('media:preview',value),download:selection=>invoke('download:add',selection),cancel:id=>invoke('download:cancel',id),
  inspectPlaylist:value=>invoke('playlist:inspect',value),startPlaylist:value=>invoke('playlist:start',value),controlPlaylist:(id,action)=>invoke('playlist:control',id,action),retryPlaylistEntry:(id,key)=>invoke('playlist:retry',id,key),updateDraft:value=>invoke('bulk:update',value),
  pause:id=>invoke('download:pause',id),retry:id=>invoke('download:retry',id),move:(id,direction)=>invoke('queue:move',id,direction),settings:value=>invoke('settings:set',value),
  checkUpdates:kind=>invoke('updates:check',kind),installEngine:()=>invoke('updates:install-engine'),useBundledEngine:()=>invoke('updates:use-bundled'),openAppRelease:()=>invoke('updates:open-release'),
  installTool:kind=>invoke('updates:install-tool',kind),repairTools:()=>invoke('updates:repair'),checkAllTools:()=>invoke('updates:check-all'),rollbackTool:kind=>invoke('updates:rollback',kind),
  clearHistory:()=>invoke('history:clear'),paste:()=>invoke('clipboard:read'),chooseFolder:options=>invoke('folder:choose',options),openFolder:directory=>invoke('folder:open',directory),
  addDraft:selection=>invoke('bulk:add',selection),removeDraft:id=>invoke('bulk:remove',id),startBatch:()=>invoke('bulk:start'),finishOnboarding:()=>invoke('onboarding:complete'),
  resolveDuplicate:choice=>invoke('duplicate:resolve',choice),
  clearDuplicateMemory:()=>invoke('duplicates:clear'),
  exportDiagnostics:()=>invoke('diagnostics:export'),
  reveal:id=>invoke('file:reveal',id),project:name=>invoke('project:link',name),
  subscribe:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('state:update',listener);return()=>ipcRenderer.removeListener('state:update',listener);}
  ,onNavigate:callback=>{const listener=(_event,value)=>{if(value==='activity')callback(value);};ipcRenderer.on('app:navigate',listener);return()=>ipcRenderer.removeListener('app:navigate',listener);}
}));
