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

// 监听主进程转发来的菜单动作（导航 / 触发功能）
contextBridge.exposeInMainWorld('electronAPI', {
  onMenu: (callback) => {
    const handler = (event, payload) => callback(payload)
    ipcRenderer.on('app:menu', handler)
    return () => ipcRenderer.removeListener('app:menu', handler)
  },
  // 主题：设置主题来源（light / dark / system）并读取系统当前外观
  setThemeSource: (source) => ipcRenderer.invoke('theme:set', source),
  getInitialTheme: () => ipcRenderer.invoke('theme:initial'),
  onSystemTheme: (callback) => {
    const handler = (event, isDark) => callback(isDark)
    ipcRenderer.on('theme:system', handler)
    return () => ipcRenderer.removeListener('theme:system', handler)
  },
  // 答题进度上报（macOS Dock 进度条）：ratio 0~1 显示，-1 移除
  reportProgress: (ratio) => ipcRenderer.invoke('app:progress', ratio)
})
