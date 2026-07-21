import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron'
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '知题 · Zetith',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL)
  })

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log(`[Renderer L${level}]`, message)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// 中文本地化的 macOS 应用菜单
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const appName = app.name

  const template = [
    // 应用主菜单（仅 macOS）
    ...(isMac
      ? [{
          label: appName,
          submenu: [
            { role: 'about', label: `关于${appName}` },
            { type: 'separator' },
            { role: 'services', label: '服务' },
            { type: 'separator' },
            { role: 'hide', label: `隐藏${appName}` },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '显示全部' },
            { type: 'separator' },
            { role: 'quit', label: `退出${appName}` }
          ]
        }]
      : []),
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
        { role: 'togglefullscreen', label: '进入/退出全屏' }
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
              { role: 'front', label: '前置全部窗口' },
              { type: 'separator' },
              { role: 'window', label: appName }
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
          label: '访问项目主页',
          click: async () => {
            await shell.openExternal('https://github.com')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData')

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
