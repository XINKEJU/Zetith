import { app, BrowserWindow, shell, ipcMain, Menu, screen, nativeTheme, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 应用名（影响 macOS 首个菜单标题、"关于/隐藏/退出 知题"）
app.name = '知题'

let mainWindow = null
let server = null
let serverPort = 0
let userData = ''

function getDistDir() {
  const basePath = app.getAppPath()
  const distDir = path.join(basePath, 'dist')
  if (fs.existsSync(distDir)) return distDir
  return path.join(__dirname, '..', 'dist')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.db': 'application/octet-stream',
  '.sqlite': 'application/octet-stream',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
}

// 内置本地 HTTP 服务：localhost 是安全上下文，绝对路径 /tiku.db、/sql-wasm.wasm
// 均能正确解析，且无需依赖 OPFS（持久化改走 Node fs + IPC）。
function startServer() {
  const distDir = getDistDir()
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
        if (urlPath === '/') urlPath = '/index.html'

        const resolved = path.normalize(path.join(distDir, urlPath))
        // 防止路径穿越
        if (!resolved.startsWith(distDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        let filePath = resolved
        let stat = null
        try { stat = fs.statSync(filePath) } catch { stat = null }

        if (!stat || stat.isDirectory()) {
          // SPA 路由回退 / 文件不存在 -> 统一返回 index.html
          filePath = path.join(distDir, 'index.html')
        }

        const ext = path.extname(filePath).toLowerCase()
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const stream = fs.createReadStream(filePath)
        stream.on('error', () => {
          res.statusCode = 404
          res.end('Not found')
        })
        stream.pipe(res)
      } catch {
        res.statusCode = 500
        res.end('Server error')
      }
    })

    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      serverPort = srv.address().port
      resolve(srv)
    })
  })
}

// 读取上次保存的窗口位置（首次或无记录返回 null）
function getSavedBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(userData, 'window-state.json'), 'utf8'))
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.width) && Number.isFinite(s.height)) {
      return s
    }
  } catch {}
  return null
}

// 校验窗口是否仍在某个显示器的可视工作区内（避免外接屏拔除后跑到屏幕外）
function isOnAnyScreen(b) {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea
    return !(b.x + b.width < a.x || b.x > a.x + a.width ||
             b.y + b.height < a.y || b.y > a.y + a.height)
  })
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const saved = getSavedBounds()
  const winOpts = {
    width: saved?.width || 1280,
    height: saved?.height || 800,
    minWidth: 800,
    minHeight: 600,
    title: '知题 · Zetith',
    show: false,
    // macOS：隐藏窗口原生标题栏，让红绿灯控件浮于应用之上（屏幕顶部菜单栏不受影响）
    ...(isMac ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 16 } } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  }
  // 有有效记录则还原位置，否则屏幕居中
  if (saved && isOnAnyScreen(saved)) {
    winOpts.x = saved.x
    winOpts.y = saved.y
  } else {
    winOpts.center = true
  }

  mainWindow = new BrowserWindow(winOpts)

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL)
  })

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const lineInfo = sourceId ? ` ${sourceId}:${line || 0}` : ''
    if (level >= 2) console.log(`[Renderer L${level}]`, message, lineInfo)
    // 把渲染进程错误持久化，便于排查白屏等问题
    if (level >= 3) {
      try {
        const logPath = path.join(userData, 'renderer-error.log')
        const lineText = `[${new Date().toISOString()}] ${message}${lineInfo}\n`
        fs.appendFileSync(logPath, lineText)
      } catch {}
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 关闭时保存窗口位置与尺寸，下次启动还原
  mainWindow.on('close', () => {
    if (mainWindow) {
      try {
        fs.writeFileSync(path.join(userData, 'window-state.json'), JSON.stringify(mainWindow.getBounds()))
      } catch {}
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// 知题软件专属的 macOS 应用菜单（替换 Electron 默认模板）
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const appName = app.name || '知题'

  const template = [
    // 应用主菜单（仅 macOS）
    ...(isMac
      ? [{
          label: appName,
          submenu: [
            { role: 'about', label: `关于${appName}` },
            { type: 'separator' },
            { role: 'hide', label: `隐藏${appName}` },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '显示全部' },
            { type: 'separator' },
            { role: 'quit', label: `退出${appName}` }
          ]
        }]
      : []),
    // 学习
    {
      label: '学习',
      submenu: [
        { label: '开始练习', click: () => sendMenu({ type: 'navigate', path: '/practice' }) },
        { label: '模拟考试', click: () => sendMenu({ type: 'navigate', path: '/exam' }) },
        { label: '背题模式', click: () => sendMenu({ type: 'navigate', path: '/cards' }) },
        { label: '每日一练', click: () => sendMenu({ type: 'navigate', path: '/daily' }) },
        { type: 'separator' },
        { label: '错题本', click: () => sendMenu({ type: 'navigate', path: '/wrongbook' }) },
        { label: '收藏夹', click: () => sendMenu({ type: 'navigate', path: '/favorites' }) },
        { label: '学习统计', click: () => sendMenu({ type: 'navigate', path: '/stats' }) }
      ]
    },
    // 题库
    {
      label: '题库',
      submenu: [
        { label: '导入题库', click: () => sendMenu({ type: 'action', name: 'import' }) },
        { label: '导出题库', click: () => sendMenu({ type: 'action', name: 'export' }) },
        { type: 'separator' },
        { label: '题库管理', click: () => sendMenu({ type: 'navigate', path: '/categories' }) }
      ]
    },
    // 编辑
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
              { role: 'delete', label: '删除' },
              { role: 'selectAll', label: '全选' }
            ]
          : [
              { role: 'delete', label: '删除' },
              { type: 'separator' },
              { role: 'selectAll', label: '全选' }
            ])
      ]
    },
    // 视图
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入/退出全屏' },
        { type: 'separator' },
        { label: '跟随系统外观', click: () => sendMenu({ type: 'theme', source: 'system' }) }
      ]
    },
    // 窗口
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '前置全部窗口' }
            ]
          : [{ role: 'close', label: '关闭' }])
      ]
    },
    // 帮助
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: '检查更新',
          click: async () => {
            if (!app.isPackaged) {
              dialog.showMessageBox(mainWindow, { message: '开发模式下不检查更新' })
              return
            }
            try {
              const { autoUpdater } = await import('electron-updater')
              autoUpdater.autoDownload = true
              const res = await autoUpdater.checkForUpdatesAndNotify()
              if (!res || !res.updateInfo) {
                dialog.showMessageBox(mainWindow, { message: '当前已是最新版本' })
              }
            } catch (e) {
              dialog.showMessageBox(mainWindow, {
                message: '暂未启用自动更新通道（需安装 electron-updater 并发布 Release）。\n' + (e?.message || e)
              })
            }
          }
        },
        {
          label: '访问项目主页',
          click: async () => {
            await shell.openExternal('https://github.com/XINKEJU/Zetith')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// 把菜单动作转发给渲染进程（前端根据动作导航或触发功能）
function sendMenu(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:menu', payload)
  }
}

app.whenReady().then(async () => {
  userData = app.getPath('userData')

  // 数据库持久化：Electron 下把 tiku.db 存到 userData（Node fs），不依赖 OPFS
  ipcMain.handle('db:read', async (event, name) => {
    const fp = path.join(userData, name)
    try {
      const buf = await fs.promises.readFile(fp)
      return buf // Buffer 经结构化克隆传给渲染进程（等价于 Uint8Array）
    } catch {
      return null
    }
  })

  ipcMain.handle('db:write', async (event, name, data) => {
    const fp = path.join(userData, name)
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
    await fs.promises.writeFile(fp, u8)
    return true
  })

  // 主题：跟随 macOS 系统外观。themeSource 默认 'system'，渲染端可手动 override
  ipcMain.handle('theme:set', (event, source) => {
    if (source === 'light' || source === 'dark' || source === 'system') {
      nativeTheme.themeSource = source
    }
  })
  ipcMain.handle('theme:initial', () => nativeTheme.shouldUseDarkColors)

  // 外部链接：在系统默认浏览器打开
  ipcMain.handle('shell:openExternal', async (event, url) => {
    if (typeof url === 'string' && url.startsWith('http')) {
      await shell.openExternal(url)
      return true
    }
    return false
  })

  // Supabase 会话持久化：渲染进程把会话 token 存到 userData 下的文件，
  // 而非 localStorage（Electron 用随机端口本地 HTTP，origin 每次都变，
  // localStorage 按 origin 隔离会导致重启后登录态丢失）。
  ipcMain.handle('auth:storage', async (event, { op, key, value }) => {
    const fp = path.join(userData, 'auth-storage.json')
    let map = {}
    try {
      map = JSON.parse(await fs.promises.readFile(fp, 'utf8'))
    } catch { map = {} }
    if (op === 'get') return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
    if (op === 'set') {
      map[key] = value
      await fs.promises.writeFile(fp, JSON.stringify(map))
      return true
    }
    if (op === 'remove') {
      delete map[key]
      await fs.promises.writeFile(fp, JSON.stringify(map))
      return true
    }
    return null
  })

  // 答题进度上报：macOS 在 Dock 栏显示进度（ratio 0~1 显示，-1 移除）
  ipcMain.handle('app:progress', (event, ratio) => {
    if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(ratio)
    }
  })

  // WebDAV 代理：坚果云等同步后端在渲染进程会被浏览器 CORS 拦截，
  // 改由主进程（Node）发起请求，主进程 fetch 不受跨域限制。
  // 仅转发 method/url/headers/body，返回原始响应文本与状态码。
  ipcMain.handle('webdav:request', async (event, { method, url, headers, body }) => {
    try {
      const init = { method: method || 'GET', headers: headers || {} }
      if (body !== undefined && body !== null) init.body = body
      const res = await fetch(url, init)
      const text = await res.text()
      return { ok: res.ok, status: res.status, statusText: res.statusText, body: text }
    } catch (e) {
      return { ok: false, status: 0, statusText: String((e && e.message) || e), body: '' }
    }
  })

  // 系统外观变化广播给渲染端（渲染端在「跟随系统」模式下自动切换深浅色）
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:system', nativeTheme.shouldUseDarkColors)
    }
  })

  buildMenu()
  server = await startServer()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (server) server.close()
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
