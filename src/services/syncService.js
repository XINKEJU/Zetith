// 本地用户数据导出 / 合并
// 只同步"用户进度"（复习状态 / 笔记 / 收藏），不同步题库本身（题库体积大且各端本地导入）。
// 进度均以 question_id 为键 —— 前提是各设备导入了相同的题库文件，question_id 才会一致。

import { getDatabase, saveDatabase } from '../db/database'

function rows(sql) {
  const db = getDatabase()
  if (!db) return []
  const r = db.exec(sql)
  return r.length ? r[0].values : []
}

function mapById(values, keyIdx, tsIdx) {
  const m = {}
  for (const row of values) m[row[keyIdx]] = row[tsIdx]
  return m
}

export function exportUserData() {
  return {
    app: 'zetith',
    schema: 1,
    exportedAt: new Date().toISOString(),
    review_state: rows('SELECT question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at FROM review_state')
      .map(r => ({ question_id: r[0], stage: r[1], ease_factor: r[2], interval_days: r[3], next_review_at: r[4], last_reviewed_at: r[5] })),
    notes: rows('SELECT question_id, content, updated_at FROM notes')
      .map(r => ({ question_id: r[0], content: r[1], updated_at: r[2] })),
    bookmarks: rows('SELECT question_id, created_at FROM bookmarks')
      .map(r => ({ question_id: r[0], created_at: r[1] }))
  }
}

// 以"最后写入优先"(LWW) 合并远端数据到本地：远端更新则覆盖，本地更新则保留；从不删除本地独有记录。
export async function importUserData(data) {
  const db = getDatabase()
  if (!db || !data) return { imported: 0 }

  const localReview = mapById(rows('SELECT question_id, last_reviewed_at FROM review_state'), 0, 1)
  const localNotes = mapById(rows('SELECT question_id, updated_at FROM notes'), 0, 1)
  const localBookmarks = mapById(rows('SELECT question_id, created_at FROM bookmarks'), 0, 1)

  let imported = 0

  for (const r of data.review_state || []) {
    const ex = localReview[r.question_id]
    if (ex === undefined) {
      db.run('INSERT INTO review_state (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at) VALUES (?,?,?,?,?,?)',
        [r.question_id, r.stage, r.ease_factor, r.interval_days, r.next_review_at, r.last_reviewed_at])
      imported++
    } else if (r.last_reviewed_at && r.last_reviewed_at > ex) {
      db.run('UPDATE review_state SET stage=?, ease_factor=?, interval_days=?, next_review_at=?, last_reviewed_at=? WHERE question_id=?',
        [r.stage, r.ease_factor, r.interval_days, r.next_review_at, r.last_reviewed_at, r.question_id])
      imported++
    }
  }

  for (const n of data.notes || []) {
    const ex = localNotes[n.question_id]
    if (ex === undefined) {
      db.run('INSERT OR REPLACE INTO notes (question_id, content, updated_at) VALUES (?,?,?)',
        [n.question_id, n.content, n.updated_at])
      imported++
    } else if (n.updated_at && n.updated_at > ex) {
      db.run('UPDATE notes SET content=?, updated_at=? WHERE question_id=?',
        [n.content, n.updated_at, n.question_id])
      imported++
    }
  }

  // 收藏是"标记"语义：仅补齐本地缺失的，不删除本地已有的
  for (const b of data.bookmarks || []) {
    if (localBookmarks[b.question_id] === undefined) {
      db.run('INSERT INTO bookmarks (question_id, created_at) VALUES (?,?)', [b.question_id, b.created_at])
      imported++
    }
  }

  await saveDatabase()
  return { imported }
}

// 双向同步：拉取远端并合并进本地，再把合并后的结果推回，实现两端无损合并。
export async function syncNow(pushFn, pullFn) {
  const local = exportUserData()
  const remote = await pullFn()
  if (remote) {
    await importUserData(remote)
  }
  await pushFn(exportUserData())
  return { hadRemote: !!remote }
}
