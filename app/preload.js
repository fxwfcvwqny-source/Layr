const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('werkbank', {
  setFile: f => { try { ipcRenderer.send('set-file', webUtils.getPathForFile(f)); } catch (e) {} },
  save: (name, data, saveAs) => ipcRenderer.invoke('save', name, data, !!saveAs),
  autoSave: (name, data, fresh) => ipcRenderer.invoke('autosave', name, data, !!fresh),
  newDoc: () => ipcRenderer.send('new-doc'),
  log: t => ipcRenderer.send('log', String(t).slice(0, 60000)),
  initial: () => ipcRenderer.invoke('initial-file'),
  onOpen: cb => ipcRenderer.on('open-file', (_e, name, data) => cb(name, data)),
  appInfo: () => ipcRenderer.invoke('app-info'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  openRelease: u => ipcRenderer.send('open-release', String(u || '')),
  setLang: l => ipcRenderer.send('set-lang', l === 'en' ? 'en' : 'de'),
});
