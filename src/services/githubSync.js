// GitHub 同步后端（零服务器方案）
// 复用用户已有的 GitHub 账号：账号 = GitHub 登录，存储 = 一个私有 Gist。
// 只需一个具备 `gist` 作用域的 Personal Access Token，不花钱、无需自建服务器。

const API = 'https://api.github.com'
const GIST_FILENAME = 'zetith-userdata.json'

const LS_TOKEN = 'zetith_github_token'
const LS_GIST = 'zetith_gist_id'
const LS_USER = 'zetith_github_user'

let token = localStorage.getItem(LS_TOKEN) || ''
let gistId = localStorage.getItem(LS_GIST) || ''
let username = localStorage.getItem(LS_USER) || ''

export function getToken() { return token }
export function getUsername() { return username }
export function isLoggedIn() { return !!token }

export function setToken(t) {
  token = (t || '').trim()
  if (token) localStorage.setItem(LS_TOKEN, token)
  else {
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_GIST)
    localStorage.removeItem(LS_USER)
    gistId = ''
    username = ''
  }
}

export function clearSession() {
  gistId = ''
  username = ''
  localStorage.removeItem(LS_GIST)
  localStorage.removeItem(LS_USER)
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 200) } catch { /* ignore */ }
    if (res.status === 401) throw new Error('Token 无效或权限不足（需 gist 作用域）')
    throw new Error(`GitHub ${res.status}: ${detail}`)
  }
  return res.json()
}

// 尽力获取用户名（仅 gist 作用域时可能失败，失败不影响同步）
export async function fetchUser() {
  try {
    const u = await api('/user')
    username = u.login || ''
    if (username) localStorage.setItem(LS_USER, username)
  } catch { /* 忽略 */ }
  return username
}

export async function pushData(data) {
  const content = JSON.stringify(data)
  if (!gistId) {
    const r = await api('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Zetith 学习数据同步',
        public: false,
        files: { [GIST_FILENAME]: { content } }
      })
    })
    gistId = r.id
    localStorage.setItem(LS_GIST, gistId)
    return r
  }
  return api('/gists/' + gistId, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } })
  })
}

export async function pullData() {
  if (!gistId) return null
  const r = await api('/gists/' + gistId)
  const file = r.files && r.files[GIST_FILENAME]
  if (!file || !file.content) return null
  try { return JSON.parse(file.content) } catch { return null }
}
