import { supabase } from './supabaseClient'
import { getDatabase, saveDatabase } from '../db/database'

// ============ 同步游标（本地持久化，做增量同步，避免每次全量上传）============
const LS_PUSH = 'zetith_sync_push_cursor'
const LS_PULL = 'zetith_sync_pull_cursor'
const LS_PAUSE = 'zetith_auto_sync' // 仅当显式存 'false' 时暂停；默认开启 = 用户无感

const PULL_INTERVAL = 20000 // 后台定期拉取远端改动（多端实时感）
const PUSH_DEBOUNCE = 2500 // 本地落盘后防抖上传，避免连续答题时狂发请求

// ============ 状态广播（供 UI 显示同步状态）============
// status: idle | syncing | synced | error | offline
const statusListeners = new Set()
export function onStatus(cb) {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}
function emitStatus(s, detail) {
  statusListeners.forEach((cb) => {
    try { cb(s, detail) } catch {}
  })
}

// ============ 自动同步开关（默认开启，无需用户操作）============
export function setAutoSync(enabled) {
  localStorage.setItem(LS_PAUSE, enabled ? 'true' : 'false')
}
export function isAutoSync() {
  return localStorage.getItem(LS_PAUSE) !== 'false'
}

// ============ 时间标准化：本地时间串 <-> ISO UTC ============
// 数据库里存的是 datetime('now','localtime') 的本地串（如 2026-07-22 20:14:00），
// 而远端 Supabase 存的是 timestamptz。统一转成 ISO UTC 串做比较才能正确做增量。
function toISO(s) {
  if (!s) return null
  const str = String(s).trim()
  if (!str) return null
  let d = new Date(str.replace(' ', 'T'))
  if (isNaN(d.getTime())) {
    d = new Date(str)
    if (isNaN(d.getTime())) return null
  }
  return d.toISOString()
}
// a 是否严格晚于 b
function newer(a, b) {
  const ia = toISO(a)
  const ib = toISO(b)
  if (ia == null) return false
  if (ib == null) return true
  return ia > ib
}
// Date -> 本地 'YYYY-MM-DD HH:MM:SS'（与数据库存储格式一致，用于 SQL 增量过滤）
function localStr(d) {
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`
}

// ============ 上传 / 下载游标 ============
function getPushCursor() { return localStorage.getItem(LS_PUSH) || '' }
function setPushCursor(v) { if (v) localStorage.setItem(LS_PUSH, v) }
function getPullCursor() { return localStorage.getItem(LS_PULL) || '' }
function setPullCursor(v) { if (v) localStorage.setItem(LS_PULL, v) }
// 上传游标转成数据库可比较的本地串
function pushCursorLocal() {
  const c = getPushCursor()
  return c ? localStr(new Date(c)) : ''
}

// ============ 当前用户（登录态缓存，避免每次同步都走网络鉴权）============
let cachedUser = null
let enabled = false

async function requireUser() {
  if (cachedUser) return cachedUser
  if (!supabase) throw new Error('同步后端未配置')
  // getSession 读本地存储，不发起网络请求，离线可用
  const { data } = await supabase.auth.getSession()
  if (!data.session?.user) throw new Error('请先登录')
  cachedUser = data.session.user
  return cachedUser
}

// ============ 本地进度 -> 文档列表（仅取上次同步之后的增量）============
// 同步单元是「学习进度」，不含题库本身（questions/categories）。
// 进度以 question_id / sync_key 关联，各设备导入相同题库（题目 ID 一致）即可对应。
function collectLocalDocs() {
  const d = getDatabase()
  if (!d) return []
  const since = pushCursorLocal()
  const docs = []

  // 答题记录：每次作答一行，doc_key 用设备级唯一 sync_key 去重
  {
    const sql =
      `SELECT id, question_id, category_id, is_correct, answer_given, time_spent, wrong_reason, practiced_at, COALESCE(sync_key, 'sr_' || id) as sk ` +
      `FROM study_records` + (since ? ` WHERE practiced_at > ?` : '')
    const res = d.exec(sql, since ? [since] : [])
    if (res.length) {
      for (const row of res[0].values) {
        const [id, question_id, category_id, is_correct, answer_given, time_spent, wrong_reason, practiced_at, sk] = row
        docs.push({
          doc_type: 'study_record',
          doc_key: String(sk),
          data: { question_id, category_id, is_correct, answer_given, time_spent, wrong_reason: wrong_reason || '', practiced_at, sync_key: String(sk) },
          updated_at: practiced_at
        })
      }
    }
  }

  // 收藏
  {
    const sql = `SELECT question_id, created_at FROM bookmarks` + (since ? ` WHERE created_at > ?` : '')
    const res = d.exec(sql, since ? [since] : [])
    if (res.length) {
      for (const [question_id, created_at] of res[0].values) {
        docs.push({ doc_type: 'bookmark', doc_key: `${question_id}`, data: { question_id }, updated_at: created_at })
      }
    }
  }

  // 间隔复习状态（SM-2）
  {
    const sql =
      `SELECT question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at ` +
      `FROM review_state` + (since ? ` WHERE COALESCE(last_reviewed_at, next_review_at) > ?` : '')
    const res = d.exec(sql, since ? [since] : [])
    if (res.length) {
      for (const row of res[0].values) {
        const [question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at] = row
        docs.push({
          doc_type: 'review_state',
          doc_key: `${question_id}`,
          data: { question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at },
          updated_at: last_reviewed_at || next_review_at
        })
      }
    }
  }

  // 笔记
  {
    const sql = `SELECT question_id, content, updated_at FROM notes` + (since ? ` WHERE updated_at > ?` : '')
    const res = d.exec(sql, since ? [since] : [])
    if (res.length) {
      for (const [question_id, content, updated_at] of res[0].values) {
        docs.push({ doc_type: 'note', doc_key: `${question_id}`, data: { question_id, content: content || '', updated_at }, updated_at })
      }
    }
  }

  // 练习 / 考试会话（含明细）
  {
    const itemsBySession = {}
    const it = d.exec(`SELECT session_id, question_id, is_correct, answer_given, time_spent FROM session_items`)
    if (it.length) {
      for (const [session_id, question_id, is_correct, answer_given, time_spent] of it[0].values) {
        ;(itemsBySession[session_id] ||= []).push({ question_id, is_correct, answer_given, time_spent })
      }
    }
    const sql =
      `SELECT id, type, category_id, total, correct, time_spent, score, started_at, finished_at, COALESCE(sync_key, 'se_' || id) as sk ` +
      `FROM sessions` + (since ? ` WHERE COALESCE(finished_at, started_at) > ?` : '')
    const res = d.exec(sql, since ? [since] : [])
    if (res.length) {
      for (const row of res[0].values) {
        const [id, type, category_id, total, correct, time_spent, score, started_at, finished_at, sk] = row
        docs.push({
          doc_type: 'session',
          doc_key: String(sk),
          data: { id, type, category_id, total, correct, time_spent, score, started_at, finished_at, items: itemsBySession[id] || [] },
          updated_at: finished_at || started_at
        })
      }
    }
  }

  return docs
}

// ============ 远端 -> 本地合并（返回是否真的改动了本地库）============
// study_record / bookmark / session 用唯一键去重（INSERT OR IGNORE / 先查后插），
// review_state / note 用最后修改时间优先（LWW）。
function applyDoc(d, docType, docKey, data, remoteUpdated) {
  switch (docType) {
    case 'study_record': {
      const ex = d.exec('SELECT 1 FROM study_records WHERE sync_key = ?', [docKey])
      if (ex.length && ex[0].values.length) return false
      d.run(
        `INSERT OR IGNORE INTO study_records (question_id, category_id, is_correct, answer_given, time_spent, wrong_reason, practiced_at, sync_key)
         VALUES (?,?,?,?,?,?,?,?)`,
        [data.question_id, data.category_id, data.is_correct, data.answer_given, data.time_spent, data.wrong_reason || '', data.practiced_at, docKey]
      )
      return true
    }
    case 'bookmark': {
      const ex = d.exec('SELECT 1 FROM bookmarks WHERE question_id = ?', [data.question_id])
      if (ex.length && ex[0].values.length) return false
      d.run('INSERT OR IGNORE INTO bookmarks (question_id) VALUES (?)', [data.question_id])
      return true
    }
    case 'review_state': {
      const local = d.exec('SELECT last_reviewed_at FROM review_state WHERE question_id=?', [data.question_id])
      const localTime = local.length && local[0].values.length ? local[0].values[0][0] : null
      if (!localTime || newer(remoteUpdated, localTime)) {
        d.run(
          `INSERT OR REPLACE INTO review_state (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at)
           VALUES (?,?,?,?,?,?)`,
          [data.question_id, data.stage, data.ease_factor, data.interval_days, data.next_review_at, data.last_reviewed_at]
        )
        return true
      }
      return false
    }
    case 'note': {
      const local = d.exec('SELECT updated_at FROM notes WHERE question_id=?', [data.question_id])
      const localTime = local.length && local[0].values.length ? local[0].values[0][0] : null
      if (!localTime || newer(remoteUpdated, localTime)) {
        d.run('INSERT OR REPLACE INTO notes (question_id, content, updated_at) VALUES (?,?,?)', [
          data.question_id,
          data.content || '',
          data.updated_at
        ])
        return true
      }
      return false
    }
    case 'session': {
      const ex = d.exec('SELECT 1 FROM sessions WHERE sync_key = ?', [docKey])
      if (ex.length && ex[0].values.length) return false
      d.run(
        `INSERT INTO sessions (type, category_id, total, correct, time_spent, score, started_at, finished_at, sync_key)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [data.type, data.category_id, data.total, data.correct, data.time_spent, data.score, data.started_at, data.finished_at, docKey]
      )
      const newId = d.exec('SELECT last_insert_rowid()')
      const id = newId.length && newId[0].values.length ? newId[0].values[0][0] : null
      if (id != null) {
        for (const it of data.items || []) {
          d.run('INSERT INTO session_items (session_id, question_id, is_correct, answer_given, time_spent) VALUES (?,?,?,?,?)', [
            id,
            it.question_id,
            it.is_correct ? 1 : 0,
            it.answer_given,
            it.time_spent
          ])
        }
      }
      return true
    }
  }
  return false
}

// ============ 上传：本地增量 -> Supabase ============
async function pushToSupabase() {
  const user = await requireUser()
  const docs = collectLocalDocs()
  if (!docs.length) return { pushed: 0 }
  const rows = docs.map((d) => ({
    user_id: user.id,
    doc_type: d.doc_type,
    doc_key: d.doc_key,
    data: d.data,
    updated_at: toISO(d.updated_at) || new Date().toISOString()
  }))
  const BATCH = 500
  let pushed = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('sync_docs').upsert(slice, {
      onConflict: 'user_id,doc_type,doc_key'
    })
    if (error) throw error
    pushed += slice.length
  }
  // 成功才推进游标：所有 <= now 的本地改动都已上传
  setPushCursor(new Date().toISOString())
  return { pushed }
}

// ============ 下载：远端增量 -> 本地合并（LWW）============
async function pullFromSupabase() {
  const user = await requireUser()
  let query = supabase
    .from('sync_docs')
    .select('doc_type, doc_key, data, updated_at')
    .eq('user_id', user.id)
  const cursor = getPullCursor()
  if (cursor) query = query.gt('updated_at', cursor)
  const { data, error } = await query
  if (error) throw error
  if (!data || !data.length) return { merged: 0 }
  const d = getDatabase()
  if (!d) return { merged: 0 }
  let changed = 0
  let maxRemote = cursor
  d.run('BEGIN')
  try {
    for (const row of data) {
      if (applyDoc(d, row.doc_type, row.doc_key, row.data, row.updated_at)) changed++
      const iso = toISO(row.updated_at)
      if (iso && (maxRemote === '' || iso > maxRemote)) maxRemote = iso
    }
    d.run('COMMIT')
  } catch (e) {
    d.run('ROLLBACK')
    throw e
  }
  // 仅当有实际改动才落盘（避免无谓写盘 + 触发再次同步的死循环）
  if (changed > 0) await saveDatabase()
  if (maxRemote) setPullCursor(maxRemote)
  return { merged: changed }
}

// ============ 单次同步（先推后拉，避免把刚拉下来的远端数据又推回去）============
let ticking = false
let dirty = false
let timer = null
let debounceTimer = null
let autoHandler = null
let onlineHandler = null

async function runTick() {
  if (ticking || !enabled) return
  if (!supabase || !cachedUser) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitStatus('offline')
    return
  }
  ticking = true
  emitStatus('syncing')
  try {
    // 同步期间若又产生本地改动，循环再跑一轮补齐增量（以循环替代递归，避免调用栈增长）
    do {
      dirty = false
      const pushed = await pushToSupabase()
      const pulled = await pullFromSupabase()
      if (pushed.pushed === 0 && pulled.merged === 0) emitStatus('idle')
      else emitStatus('synced', `已同步（上传 ${pushed.pushed} · 下载 ${pulled.merged}）`)
    } while (dirty)
  } catch (e) {
    // 网络/离线等异常只更新状态，不向上抛出，避免打断用户
    emitStatus('error', e?.message || String(e))
  } finally {
    ticking = false
  }
}

// 立即同步（手动按钮 / 登录后首次）
export const syncNow = runTick

function markDirty() {
  if (!enabled) return
  dirty = true
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runTick, PUSH_DEBOUNCE)
}

function stopTimers() {
  if (timer) { clearInterval(timer); timer = null }
  if (autoHandler) { window.removeEventListener('zetith:db-saved', autoHandler); autoHandler = null }
  if (onlineHandler) { window.removeEventListener('online', onlineHandler); onlineHandler = null }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

// ============ 自动同步：登录后启动，后台静默进行，用户无感 ============
export function startAutoSync(user) {
  if (!supabase) return
  enabled = true
  if (user) cachedUser = user
  if (!cachedUser) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) cachedUser = data.session.user
    })
  }
  stopTimers()
  // 登录后先做一次增量同步，把其它设备的进度拉下来
  if (isAutoSync()) runTick()
  // 后台定期拉取远端改动，多端实时感
  timer = setInterval(() => {
    if (isAutoSync() && (typeof navigator === 'undefined' || navigator.onLine !== false)) runTick()
  }, PULL_INTERVAL)
  // 本地落盘后防抖上传增量
  autoHandler = () => { if (isAutoSync()) markDirty() }
  window.addEventListener('zetith:db-saved', autoHandler)
  // 断网恢复后立即补同步
  onlineHandler = () => {
    if (isAutoSync() && (typeof navigator === 'undefined' || navigator.onLine !== false)) runTick()
  }
  window.addEventListener('online', onlineHandler)
}

export function stopAutoSync() {
  enabled = false
  cachedUser = null
  stopTimers()
  emitStatus('idle')
}
