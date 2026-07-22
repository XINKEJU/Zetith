// 坚果云 WebDAV 同步后端（国内、零费用）
// 复用用户已有的坚果云账号：账号 = 坚果云登录邮箱，存储 = 坚果云里的同步目录。
// 坚果云 WebDAV 不返回 CORS 头，因此手机网页（PWA）直连会被浏览器拦截；
// 桌面端 Electron 通过主进程（window.electronAPI.webdavRequest）代为发请求，绕过 CORS，国内访问稳定快速。

const LS_SRV = 'zetith_webdav_server'
const LS_USER = 'zetith_webdav_user'
const LS_PASS = 'zetith_webdav_pass'

const SYNC_FILE = 'zetith-sync.json'
const DIR = '/知题' // 坚果云中的同步目录

// 仅桌面端 Electron 支持（需主进程代理）
export function isSupported() {
  return !!(window.electronAPI && window.electronAPI.webdavRequest)
}

export function getConfig() {
  return {
    server: localStorage.getItem(LS_SRV) || 'https://dav.jianguoyun.com/dav',
    username: localStorage.getItem(LS_USER) || '',
    appPassword: localStorage.getItem(LS_PASS) || ''
  }
}

export function setConfig({ server, username, appPassword }) {
  if (server != null) localStorage.setItem(LS_SRV, server.trim().replace(/\/+$/, ''))
  if (username != null) localStorage.setItem(LS_USER, username.trim())
  if (appPassword != null) localStorage.setItem(LS_PASS, appPassword)
}

export function clearConfig() {
  localStorage.removeItem(LS_SRV)
  localStorage.removeItem(LS_USER)
  localStorage.removeItem(LS_PASS)
}

export function isConfigured() {
  const { username, appPassword } = getConfig()
  return !!(username && appPassword)
}

function authHeader() {
  const { username, appPassword } = getConfig()
  // 支持中文账号：先 URI 编码再 btoa
  const raw = `${username}:${appPassword}`
  const b64 = btoa(unescape(encodeURIComponent(raw)))
  return 'Basic ' + b64
}

async function request(method, path, { body, extraHeaders } = {}) {
  if (!isSupported()) throw new Error('坚果云 WebDAV 仅支持桌面端（Mac 版），手机网页版不可用')
  const { server } = getConfig()
  const url = server + path
  const headers = { Authorization: authHeader(), ...(extraHeaders || {}) }
  if (body != null) headers['Content-Type'] = 'application/json'
  const res = await window.electronAPI.webdavRequest({ method, url, headers, body })
  return res
}

// WebDAV 无用户 API，返回账号名作为身份标识
export async function fetchUser() {
  const { username } = getConfig()
  return username || null
}

// 确保同步目录存在：PROPFIND 探测，404 则 MKCOL 创建
async function ensureDir() {
  const res = await request('PROPFIND', DIR, { extraHeaders: { Depth: '0' } })
  if (res.status === 404) {
    const mk = await request('MKCOL', DIR)
    if (!mk.ok && mk.status !== 405) {
      throw new Error(`创建同步目录失败 (${mk.status})`)
    }
  } else if (!res.ok && res.status !== 207) {
    throw new Error(`访问同步目录失败 (${res.status})`)
  }
}

export async function pushData(data) {
  if (!isConfigured()) throw new Error('请先填写坚果云账号与应用密码')
  await ensureDir()
  const content = JSON.stringify(data)
  const res = await request('PUT', `${DIR}/${SYNC_FILE}`, { body: content })
  if (!res.ok) throw new Error(`上传失败 (${res.status})`)
  return res
}

export async function pullData() {
  if (!isConfigured()) return null
  const res = await request('GET', `${DIR}/${SYNC_FILE}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败 (${res.status})`)
  try { return JSON.parse(res.body) } catch { return null }
}
