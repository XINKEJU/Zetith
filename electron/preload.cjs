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
  reportProgress: (ratio) => ipcRenderer.invoke('app:progress', ratio),
  // WebDAV 代理：主进程代为发起请求，绕过渲染进程 CORS 限制（坚果云同步用）
  webdavRequest: (opts) => ipcRenderer.invoke('webdav:request', opts),
  // 外部链接：在系统默认浏览器打开
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  // Supabase 会话持久化：把 token 存到主进程管理的文件（见 main.js 'auth:storage'）
  authStorage: (op, key, value) => ipcRenderer.invoke('auth:storage', { op, key, value })
})
