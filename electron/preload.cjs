const { contextBridge, ipcRenderer } = require('electron')

// 渲染进程通过 window.electronDB 读写数据库文件（主进程负责落盘到 userData）
contextBridge.exposeInMainWorld('electronDB', {
  readFile: (name) => ipcRenderer.invoke('db:read', name),
  writeFile: (name, data) => ipcRenderer.invoke('db:write', name, data)
})

contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform
})
