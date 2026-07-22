// Cloudant 实时同步后端（真·增量双向、零花费）
// 引入 PouchDB 作为本地镜像库（IndexedDB），与 Cloudant 远端做 live 双向同步；
// 再把 PouchDB 中的用户进度桥接回现有 sql.js 主库，实现「无感实时」：
//   - 本地 sql.js 落盘 → 事件 → 防抖 upsert 进 PouchDB → 自动推到 Cloudant
//   - Cloudant 收到其他设备变更 → 流入本地 PouchDB → 合并回 sql.js 并刷新 UI
// 合并语义：最后修改时间优先（LWW），与原有 syncService 一致。

import PouchDB from 'pouchdb-browser'
import { getDatabase, saveDatabase } from '../db/database'

const LS_URL = 'zetith_cloudant_url'
const LS_KEY = 'zetith_cloudant_key'
const LS_PWD = 'zetith_cloudant_pwd'
const LOCAL_DB = 'zetith_userdata'

let localDB = null
let remoteDB = null
let syncHandler = null
let remoteChanges = null
let dbSavedHandler = null
let applyingRemote = false
let pushTimer = null
let status = 'idle'
let statusListeners = []

function emitStatus(s, detail) {
  status = s
  statusListeners.forEach(cb => cb(s, detail))
  try { window.dispatchEvent(new CustomEvent('zetith:sync-status', { detail: { status: s, detail } })) } catch {}
}

export function onStatus(cb) {
  statusListeners.push(cb)
  cb(status)
  return () => { statusListeners = statusListeners.filter(c => c !== cb) }
}
export function getStatus() { return status }

export function getConfig() {
  return {
    url: localStorage.getItem(LS_URL) || '',
    key: localStorage.getItem(LS_KEY) || '',
    password: localStorage.getItem(LS_PWD) || ''
  }
}
export function isConfigured() {
  const { url, key, password } = getConfig()
  return !!(url && key && password)
}
export function setConfig({ url, key, password }) {
  if (url != null) localStorage.setItem(LS_URL, url.trim().replace(/\/+$/, ''))
  if (key != null) localStorage.setItem(LS_KEY, key.trim())
  if (password != null) localStorage.setItem(LS_PWD, password)
}
export function clearConfig() {
  localStorage.removeItem(LS_URL)
  localStorage.removeItem(LS_KEY)
  localStorage.removeItem(LS_PWD)
}

function ensureLocal() {
  if (!localDB) localDB = new PouchDB(LOCAL_DB)
  return localDB
}

function buildRemote() {
  const { url, key, password } = getConfig()
  return new PouchDB(url, { auth: { username: key, password } })
}

// 读取单行值（sql.js 不带参数 exec 不便，用 prepare）
function queryOne(db, sql, params) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  let res = null
  if (stmt.step()) res = stmt.getAsObject()
  stmt.free()
  return res
}

function collectLocalDocs(db) {
  const docs = []
  const rs = db.exec('SELECT question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at FROM review_state')
  if (rs.length) for (const r of rs[0].values) {
    docs.push({ _id: 'rs:' + r[0], type: 'review_state', question_id: r[0], stage: r[1], ease_factor: r[2], interval_days: r[3], next_review_at: r[4], last_reviewed_at: r[5], updated_at: r[5] || '' })
  }
  const nt = db.exec('SELECT question_id, content, updated_at FROM notes')
  if (nt.length) for (const r of nt[0].values) {
    docs.push({ _id: 'nt:' + r[0], type: 'notes', question_id: r[0], content: r[1], updated_at: r[2] || '' })
  }
  const bm = db.exec('SELECT question_id, created_at FROM bookmarks')
  if (bm.length) for (const r of bm[0].values) {
    docs.push({ _id: 'bm:' + r[0], type: 'bookmarks', question_id: r[0], created_at: r[1], updated_at: r[1] || '' })
  }
  return docs
}

// 本地 sql.js → 本地 PouchDB（LWW：仅当本地更新才覆盖远端已有）
export async function pushLocalToPouch() {
  const db = getDatabase()
  if (!db || !isConfigured()) return
  const local = ensureLocal()
  const docs = collectLocalDocs(db)
  if (!docs.length) return
  const existing = await local.allDocs({ keys: docs.map(d => d._id), include_docs: true })
  const bulk = []
  docs.forEach((d, i) => {
    const ex = existing.rows[i]
    if (ex && ex.doc) {
      if (d.updated_at >= (ex.doc.updated_at || '')) { d._rev = ex.doc._rev; bulk.push(d) }
    } else {
      bulk.push(d)
    }
  })
  if (bulk.length) await local.bulkDocs(bulk)
}

// 把远端 doc 以 LWW 合并回 sql.js（仅当远端更新才覆盖）
function mergeDocToSql(doc) {
  const db = getDatabase()
  if (!db || !doc || doc._deleted) return
  if (doc.type === 'review_state') {
    const ex = queryOne(db, 'SELECT last_reviewed_at FROM review_state WHERE question_id=?', [doc.question_id])
    if (!ex || (doc.updated_at && doc.updated_at > (ex.last_reviewed_at || ''))) {
      db.run('INSERT OR REPLACE INTO review_state (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at) VALUES (?,?,?,?,?,?)',
        [doc.question_id, doc.stage, doc.ease_factor, doc.interval_days, doc.next_review_at, doc.last_reviewed_at])
    }
  } else if (doc.type === 'notes') {
    const ex = queryOne(db, 'SELECT updated_at FROM notes WHERE question_id=?', [doc.question_id])
    if (!ex || (doc.updated_at && doc.updated_at > (ex.updated_at || ''))) {
      db.run('INSERT OR REPLACE INTO notes (question_id, content, updated_at) VALUES (?,?,?)',
        [doc.question_id, doc.content, doc.updated_at])
    }
  } else if (doc.type === 'bookmarks') {
    const ex = queryOne(db, 'SELECT 1 FROM bookmarks WHERE question_id=?', [doc.question_id])
    if (!ex) db.run('INSERT INTO bookmarks (question_id, created_at) VALUES (?,?)', [doc.question_id, doc.created_at])
  }
}

async function applyRemoteToSql(doc) {
  if (!doc || doc._deleted) return
  applyingRemote = true
  try {
    mergeDocToSql(doc)
    await saveDatabase()
    try { window.dispatchEvent(new CustomEvent('zetith:remote-synced', { detail: { id: doc.question_id, type: doc.type } })) } catch {}
  } finally {
    applyingRemote = false
  }
}

function debouncedPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushLocalToPouch().catch(() => {})
  }, 1500)
}

// 启动实时双向同步（配置保存后或 App 启动时调用）
export function start() {
  if (!isConfigured()) { emitStatus('error', '未配置 Cloudant'); return }
  ensureLocal()
  try {
    remoteDB = buildRemote()
  } catch (e) {
    emitStatus('error', String((e && e.message) || e)); return
  }
  if (!dbSavedHandler) {
    dbSavedHandler = () => { if (!applyingRemote) debouncedPush() }
    window.addEventListener('zetith:db-saved', dbSavedHandler)
  }
  emitStatus('connecting')
  syncHandler = localDB.sync(remoteDB, { live: true, retry: true })
    .on('change', () => emitStatus('synced'))
    .on('paused', (err) => { if (err) emitStatus('error', String((err && err.message) || err)); else emitStatus('synced') })
    .on('active', () => emitStatus('connecting'))
    .on('error', (err) => emitStatus('error', String((err && err.message) || err)))
  remoteChanges = remoteDB.changes({ since: 'now', live: true, include_docs: true })
    .on('change', (ch) => { if (ch.doc) applyRemoteToSql(ch.doc) })
    .on('error', (err) => emitStatus('error', String((err && err.message) || err)))
  pushLocalToPouch().then(() => emitStatus('synced')).catch(e => emitStatus('error', String((e && e.message) || e)))
}

export function stop() {
  if (syncHandler) { try { syncHandler.cancel() } catch {} syncHandler = null }
  if (remoteChanges) { try { remoteChanges.cancel() } catch {} remoteChanges = null }
  if (dbSavedHandler) { window.removeEventListener('zetith:db-saved', dbSavedHandler); dbSavedHandler = null }
  remoteDB = null
  emitStatus('idle')
}

// 手动立即同步一次（双向）
export async function syncNow() {
  if (!isConfigured()) throw new Error('请先配置 Cloudant')
  ensureLocal()
  await pushLocalToPouch()
  if (!remoteDB) remoteDB = buildRemote()
  await localDB.sync(remoteDB)
  emitStatus('synced')
}
