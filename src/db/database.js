import initSqlJs from 'sql.js';
import { requireAuth } from '../services/account'

let db = null;
let SQL = null;

const isDev = import.meta.env.DEV;

// Electron 环境（由 preload 注入 window.electronDB）走 Node fs 持久化；
// 其它环境（浏览器/PWA）走 OPFS。两者对外接口一致：read/write 一个 Uint8Array。
const hasElectronDB = typeof window !== 'undefined' && !!window.electronDB;

async function readStoredDB() {
  if (hasElectronDB) {
    try {
      const data = await window.electronDB.readFile('tiku.db');
      return data ? new Uint8Array(data) : null;
    } catch {
      return null;
    }
  }
  return readOPFS();
}

async function writeStoredDB(data) {
  if (hasElectronDB) {
    await window.electronDB.writeFile('tiku.db', data);
    return;
  }
  await writeOPFS(data.buffer);
}

// Safe exec helper
function safeExec(sql, params = []) {
  if (!db) return [];
  try { return db.exec(sql, params) } catch (e) { if (isDev) console.error('DB error:', e.message); return [] }
}
function safeRun(sql, params = []) {
  if (!db) return;
  try { db.run(sql, params) } catch (e) { if (isDev) console.error('DB run error:', e.message) }
}
function safeGet(result, defaultValue) {
  if (!result || !result.length || !result[0]?.values?.length) return defaultValue
  return result[0].values
}
// 设备级唯一 ID：用于给学习记录 / 会话生成跨设备不冲突的 sync_key，
// 让多端同步去重正确（本地自增 id 在不同设备会重复）。
let _deviceId = null
export function getDeviceId() {
  if (_deviceId) return _deviceId
  try {
    let id = localStorage.getItem('zetith_device_id')
    if (!id) {
      id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      localStorage.setItem('zetith_device_id', id)
    }
    _deviceId = id
  } catch {
    _deviceId = 'd_fallback'
  }
  return _deviceId
}

async function getOPFSFile() {
  const root = await navigator.storage.getDirectory();
  try {
    return await root.getFileHandle('tiku.db', { create: false });
  } catch {
    return await root.getFileHandle('tiku.db', { create: true });
  }
}

async function readOPFS() {
  try {
    const fileHandle = await getOPFSFile();
    const file = await fileHandle.getFile();
    if (file.size === 0) return null;
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeOPFS(data) {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('tiku.db', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function loadPrebuiltDB(SQL, onProgress) {
  try {
    const response = await fetch('/tiku.db');
    if (!response.ok) return null;
    
    const contentLength = parseInt(response.headers.get('Content-Length') || '0');
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress && contentLength > 0) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    await writeStoredDB(buffer);
    return new SQL.Database(buffer);
  } catch {
    return null;
  }
}

export async function initDatabase(onProgress) {
  if (db) return db;

  SQL = await initSqlJs({
    locateFile: (file) => `/sql-wasm.wasm`
  });

  const existing = await readStoredDB();
  if (existing) {
    db = new SQL.Database(existing);
  } else {
    // Try loading pre-built database
    db = await loadPrebuiltDB(SQL, onProgress);
    if (!db) {
      db = new SQL.Database();
    }
  }

  safeRun(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    question_count INTEGER DEFAULT 0
  )`);

  // 迁移：为旧数据库添加 question_count 列（云同步题量缓存用）
  try {
    const cols = safeExec('PRAGMA table_info(categories)')
    if (cols.length && !cols[0].values.map(r => r[1]).includes('question_count')) {
      safeRun('ALTER TABLE categories ADD COLUMN question_count INTEGER DEFAULT 0')
    }
  } catch (e) { /* 忽略迁移错误 */ }

  safeRun(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    question_type TEXT DEFAULT '单选题',
    stem TEXT NOT NULL,
    option_a TEXT DEFAULT '',
    option_b TEXT DEFAULT '',
    option_c TEXT DEFAULT '',
    option_d TEXT DEFAULT '',
    answer TEXT NOT NULL,
    explanation TEXT DEFAULT '',
    difficulty TEXT DEFAULT '适中',
    tags TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);

  safeRun(`CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    answer_given TEXT DEFAULT '',
    time_spent INTEGER DEFAULT 0,
    wrong_reason TEXT DEFAULT '',
    practiced_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);

  // 迁移：为旧数据库添加 wrong_reason 列
  try {
    const columns = safeExec('PRAGMA table_info(study_records)');
    if (columns.length) {
      const colNames = columns[0].values.map(row => row[1]);
      if (!colNames.includes('wrong_reason')) {
        safeRun('ALTER TABLE study_records ADD COLUMN wrong_reason TEXT DEFAULT \'\'');
      }
    }
  } catch (e) { /* 忽略迁移错误 */ }

  // 迁移：同步去重。study_records / sessions 增加设备级唯一 sync_key，
  // 避免多端拉取时按本地自增 id 错位导致重复插入 / 覆盖。
  try {
    const srCols = safeExec('PRAGMA table_info(study_records)')
    if (srCols.length && !srCols[0].values.map(r => r[1]).includes('sync_key')) {
      safeRun('ALTER TABLE study_records ADD COLUMN sync_key TEXT')
      const did = getDeviceId()
      safeRun('UPDATE study_records SET sync_key = ? || id WHERE sync_key IS NULL', [did + ':'])
      safeRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_sync_key ON study_records(sync_key)')
    }
  } catch (e) { /* 忽略迁移错误 */ }

  try {
    const seCols = safeExec('PRAGMA table_info(sessions)')
    if (seCols.length && !seCols[0].values.map(r => r[1]).includes('sync_key')) {
      safeRun('ALTER TABLE sessions ADD COLUMN sync_key TEXT')
      const did = getDeviceId()
      safeRun('UPDATE sessions SET sync_key = ? || id WHERE sync_key IS NULL', [did + ':'])
      safeRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_sync_key ON sessions(sync_key)')
    }
  } catch (e) { /* 忽略迁移错误 */ }

  safeRun(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  // 收藏去重：question_id 唯一，避免多端拉取重复插入（表建好后建索引）
  try {
    safeRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_question ON bookmarks(question_id)')
  } catch (e) { /* 旧库若存在重复则忽略，不影响使用 */ }

  safeRun(`CREATE TABLE IF NOT EXISTS review_state (
    question_id INTEGER PRIMARY KEY,
    stage INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT,
    last_reviewed_at TEXT,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  safeRun(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL UNIQUE,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  safeRun(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'practice',
    category_id INTEGER,
    total INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    score REAL DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now','localtime')),
    finished_at TEXT
  )`);

  safeRun(`CREATE TABLE IF NOT EXISTS session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    is_correct INTEGER DEFAULT 0,
    answer_given TEXT DEFAULT '',
    time_spent INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
  )`);

  safeRun(`CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id)`);
  safeRun(`CREATE INDEX IF NOT EXISTS idx_records_question ON study_records(question_id)`);
  safeRun(`CREATE INDEX IF NOT EXISTS idx_records_category ON study_records(category_id)`);

  await saveDatabase();
  return db;
}

export async function saveDatabase() {
  if (!db) return;
  const data = db.export();
  await writeStoredDB(data);
  // 通知同步层（Cloudant 等）：本地数据已落盘，可触发上传
  try { window.dispatchEvent(new Event('zetith:db-saved')); } catch {}
}

export function getDatabase() {
  return db;
}

// Category operations
export function getAllCategories() {
  const result = safeExec(`SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
    COALESCE((SELECT COUNT(*) FROM questions WHERE category_id = c.id), c.question_count) as question_count
    FROM categories c ORDER BY c.updated_at DESC`);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    id: row[0], name: row[1], description: row[2],
    created_at: row[3], updated_at: row[4], question_count: row[5]
  }));
}

export function createCategory(name, description = '') {
  safeRun('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
  return safeExec('SELECT last_insert_rowid()')[0].values[0][0];
}

export function deleteCategory(id) {
  safeRun('DELETE FROM categories WHERE id = ?', [id]);
}

export function getCategoryById(id) {
  const result = safeExec('SELECT * FROM categories WHERE id = ?', [id]);
  if (!result.length || !result[0].values.length) return null;
  const row = result[0].values[0];
  return { id: row[0], name: row[1], description: row[2], created_at: row[3], updated_at: row[4] };
}

// Question operations
export function insertQuestions(questions) {
  const stmt = db.prepare(`INSERT INTO questions 
    (category_id, question_type, stem, option_a, option_b, option_c, option_d, answer, explanation, difficulty, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  let count = 0;
  for (const q of questions) {
    stmt.run([
      q.category_id, q.question_type || '单选题', q.stem,
      q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '',
      q.answer, q.explanation || '', q.difficulty || '适中', q.tags || ''
    ]);
    count++;
  }
  stmt.free();
  return count;
}

export function getQuestionsByCategory(categoryId, limit = null, offset = 0) {
  let sql = 'SELECT * FROM questions WHERE category_id = ? ORDER BY id';
  const params = [categoryId];
  if (limit !== null) { sql += ' LIMIT ? OFFSET ?'; params.push(limit, offset); }
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getQuestionById(id) {
  const result = safeExec('SELECT * FROM questions WHERE id = ?', [id]);
  if (!result.length || !result[0].values.length) return null;
  return mapQuestionRow(result[0].values[0]);
}

export function getRandomQuestions(categoryId, count) {
  const result = safeExec(
    'SELECT * FROM questions WHERE category_id = ? ORDER BY RANDOM() LIMIT ?',
    [categoryId, count]
  );
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getQuestionCount(categoryId) {
  const result = safeExec('SELECT COUNT(*) FROM questions WHERE category_id = ?', [categoryId]);
  return result[0].values[0][0];
}

function mapQuestionRow(row) {
  return {
    id: row[0], category_id: row[1], question_type: row[2], stem: row[3],
    option_a: row[4], option_b: row[5], option_c: row[6], option_d: row[7],
    answer: row[8], explanation: row[9], difficulty: row[10], tags: row[11],
    created_at: row[12]
  };
}

// Study records
export function saveStudyRecord(questionId, categoryId, isCorrect, answerGiven, timeSpent) {
  if (!requireAuth('提交答题')) return
  safeRun(
    'INSERT INTO study_records (question_id, category_id, is_correct, answer_given, time_spent) VALUES (?, ?, ?, ?, ?)',
    [questionId, categoryId, isCorrect ? 1 : 0, answerGiven, timeSpent]
  );
  try {
    const rid = safeExec('SELECT last_insert_rowid()');
    if (rid.length && rid[0].values.length) {
      const id = rid[0].values[0][0];
      safeRun('UPDATE study_records SET sync_key = ? WHERE id = ?', [getDeviceId() + ':' + id, id]);
    }
  } catch {}
}

export function getStudyStats(categoryId = null) {
  let totalSql = 'SELECT COUNT(*) FROM study_records';
  let correctSql = 'SELECT COUNT(*) FROM study_records WHERE is_correct = 1';
  const params = [];

  if (categoryId) {
    totalSql += ' WHERE category_id = ?';
    correctSql += ' AND category_id = ?';
    params.push(categoryId);
  }

  const total = safeExec(totalSql, params)[0]?.values?.[0]?.[0] || 0;
  const correct = safeExec(correctSql, params)[0]?.values?.[0]?.[0] || 0;
  return { total, correct, rate: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

// Wrong answers
export function getWrongQuestions(categoryId = null) {
  let sql = `
    SELECT q.*, 
      COUNT(sr.id) as wrong_count,
      MAX(sr.practiced_at) as last_wrong_time
    FROM questions q
    INNER JOIN study_records sr ON q.id = sr.question_id
    WHERE sr.is_correct = 0
  `;
  const params = [];
  
  if (categoryId) {
    sql += ' AND q.category_id = ?';
    params.push(categoryId);
  }
  
  sql += ' GROUP BY q.id ORDER BY wrong_count DESC, last_wrong_time DESC';
  
  const result = safeExec(sql, params);
  if (!result.length) return [];
  
  return result[0].values.map(row => ({
    ...mapQuestionRow(row.slice(0, 13)),
    wrong_count: row[13],
    last_wrong_time: row[14]
  }));
}

export function getWrongQuestionIds(categoryId = null) {
  let sql = 'SELECT DISTINCT question_id FROM study_records WHERE is_correct = 0';
  if (categoryId) sql += ' AND category_id = ?';
  const result = safeExec(sql, categoryId ? [categoryId] : []);
  if (!result.length) return new Set();
  return new Set(result[0].values.map(r => r[0]));
}

// Bookmarks
export function toggleBookmark(questionId) {
  if (!requireAuth('收藏题目')) return false
  const existing = safeExec('SELECT id FROM bookmarks WHERE question_id = ?', [questionId]);
  if (existing.length && existing[0].values.length) {
    safeRun('DELETE FROM bookmarks WHERE question_id = ?', [questionId]);
    return false;
  } else {
    safeRun('INSERT INTO bookmarks (question_id) VALUES (?)', [questionId]);
    return true;
  }
}

export function isBookmarked(questionId) {
  const result = safeExec('SELECT id FROM bookmarks WHERE question_id = ?', [questionId]);
  return result.length > 0 && result[0].values.length > 0;
}

export function getBookmarkIds() {
  const result = safeExec('SELECT question_id FROM bookmarks');
  if (!result.length) return new Set();
  return new Set(result[0].values.map(r => r[0]));
}

// Stats
export function getDailyStats(days = 7) {
  const result = safeExec(`
    SELECT date(practiced_at) as day,
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM study_records
    WHERE practiced_at >= datetime('now', ? || ' days', 'localtime')
    GROUP BY date(practiced_at)
    ORDER BY day ASC
  `, [`-${days}`]);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    day: row[0], total: row[1], correct: row[2],
    rate: row[1] > 0 ? Math.round((row[2] / row[1]) * 100) : 0
  }));
}

// ======= SM-2 间隔重复算法 =======
export function sm2Update(quality, stage, easeFactor, interval) {
  // quality: 0-5 (0=完全忘记, 5=完美回忆)
  if (quality >= 3) {
    if (stage === 0) interval = 1;
    else if (stage === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    stage += 1;
  } else {
    stage = 0;
    interval = 1;
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (5 - quality) * 0.08);
  return { stage, easeFactor, interval };
}

export function setReviewState(questionId, quality) {
  const existing = safeExec('SELECT stage, ease_factor, interval_days FROM review_state WHERE question_id = ?', [questionId]);
  let stage = 0, easeFactor = 2.5, interval = 0;

  if (existing.length && existing[0].values.length) {
    stage = existing[0].values[0][0];
    easeFactor = existing[0].values[0][1];
    interval = existing[0].values[0][2];
  }

  if (!requireAuth('设置复习计划')) return { stage, easeFactor, interval }

  const updated = sm2Update(quality, stage, easeFactor, interval);
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + updated.interval);

  safeRun(`INSERT OR REPLACE INTO review_state 
    (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at)
    VALUES (?, ?, ?, ?, datetime(?, 'localtime'), datetime('now','localtime'))`,
    [questionId, updated.stage, updated.easeFactor, updated.interval,
     nextReview.toISOString().slice(0, 19)]
  );
  return updated;
}

export function getDueReviewQuestions(categoryId = null) {
  let sql = `
    SELECT q.*, rs.stage, rs.ease_factor, rs.interval_days, rs.next_review_at
    FROM review_state rs
    JOIN questions q ON rs.question_id = q.id
    WHERE rs.next_review_at <= datetime('now', 'localtime')
    ORDER BY rs.next_review_at ASC, rs.interval_days ASC
    LIMIT 50
  `;
  
  if (categoryId) {
    sql = sql.replace('WHERE rs.next_review_at', 'WHERE q.category_id = ? AND rs.next_review_at');
    const result = safeExec(sql, [categoryId]);
    if (!result.length) return [];
    return result[0].values.map(mapReviewRow);
  }
  
  const result = safeExec(sql);
  if (!result.length) return [];
  return result[0].values.map(mapReviewRow);
}

export function getReviewDueCount() {
  const result = safeExec(
    "SELECT COUNT(*) FROM review_state WHERE next_review_at <= datetime('now', 'localtime')"
  );
  return result[0].values[0][0];
}

export function addToReviewQueue(questionId, stage = 0, easeFactor = 2.5, interval = 0) {
  if (!requireAuth('加入复习队列')) return
  const now = new Date();
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  
  // 仅当题目尚未在复习队列中时插入，保留已有的复习进度，避免被重置
  safeRun(`INSERT OR IGNORE INTO review_state
    (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at)
    VALUES (?, ?, ?, ?, datetime(?, 'localtime'), datetime('now','localtime'))`,
    [questionId, stage, easeFactor, interval, nextReview.toISOString().slice(0, 19)]
  );
}

export function getReviewStats() {
  const total = safeExec("SELECT COUNT(*) FROM review_state");
  const due = safeExec("SELECT COUNT(*) FROM review_state WHERE next_review_at <= datetime('now', 'localtime')");
  const mastered = safeExec("SELECT COUNT(*) FROM review_state WHERE stage >= 5");
  
  return {
    total: total[0]?.values?.[0]?.[0] || 0,
    due: due[0]?.values?.[0]?.[0] || 0,
    mastered: mastered[0]?.values?.[0]?.[0] || 0
  };
}

function mapReviewRow(row) {
  return {
    ...mapQuestionRow(row.slice(0, 13)),
    stage: row[13],
    ease_factor: row[14],
    interval_days: row[15],
    next_review_at: row[16]
  };
}

// ======= Notes =======
export function getNote(questionId) {
  const result = safeExec('SELECT content FROM notes WHERE question_id = ?', [questionId]);
  if (!result.length || !result[0].values.length) return '';
  return result[0].values[0][0] || '';
}

export function saveNote(questionId, content) {
  if (!requireAuth('记笔记')) return
  safeRun(`INSERT OR REPLACE INTO notes (question_id, content, updated_at) VALUES (?, ?, datetime('now','localtime'))`,
    [questionId, content]
  );
}

// ======= Search =======
export function searchQuestions(keyword, categoryId = null) {
  if (!keyword || keyword.trim().length < 1) return [];
  const term = `%${keyword.trim()}%`;
  let sql = `SELECT q.*, c.name as category_name FROM questions q 
    JOIN categories c ON q.category_id = c.id
    WHERE (q.stem LIKE ? OR q.tags LIKE ? OR q.explanation LIKE ?)`;
  const params = [term, term, term];
  
  if (categoryId) {
    sql += ' AND q.category_id = ?';
    params.push(categoryId);
  }
  
  sql += ' ORDER BY q.id LIMIT 50';
  
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    id: row[0], category_id: row[1], question_type: row[2], stem: row[3],
    option_a: row[4], option_b: row[5], option_c: row[6], option_d: row[7],
    answer: row[8], explanation: row[9], difficulty: row[10], tags: row[11],
    created_at: row[12], category_name: row[13]
  }));
}

// ======= Category Progress =======
export function getCategoryProgress(categoryId) {
  const total = safeExec('SELECT COUNT(*) FROM questions WHERE category_id = ?', [categoryId])[0]?.values?.[0]?.[0] || 0;
  const attempted = safeExec(
    'SELECT COUNT(DISTINCT question_id) FROM study_records WHERE category_id = ?', [categoryId]
  )[0]?.values?.[0]?.[0] || 0;
  const correct = safeExec(
    `SELECT COUNT(DISTINCT question_id) FROM study_records 
     WHERE category_id = ? AND is_correct = 1 AND question_id NOT IN (
       SELECT question_id FROM study_records WHERE category_id = ? AND is_correct = 0
     )`, [categoryId, categoryId]
  )[0]?.values?.[0]?.[0] || 0;
  
  return { total, attempted, correct };
}

// ======= 弱项诊断 =======
export function getTagAnalysis() {
  const result = safeExec(`
    SELECT q.tags,
      COUNT(sr.id) as total,
      SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM study_records sr
    JOIN questions q ON sr.question_id = q.id
    WHERE q.tags != '' AND sr.is_correct = 0
    GROUP BY q.tags
    ORDER BY total DESC
    LIMIT 20
  `);
  if (!result.length) return [];
  return result[0].values.map(row => {
    const tags = row[0].split(',').filter(Boolean).map(t => t.trim());
    return { tags, total: row[1], correct: row[2] };
  });
}

export function getIndividualTagStats() {
  // 单查询拉取「题目标签 + 是否正确」，在 JS 层按逗号拆标签聚合，
  // 正确统计每个标签的 total 与 correct（含多标签题目的拆分），
  // 修正旧实现只统计 is_correct=0 导致正确率恒为 0% 的问题。
  const r = safeExec(`
    SELECT q.tags, sr.is_correct
    FROM study_records sr
    JOIN questions q ON sr.question_id = q.id
    WHERE q.tags IS NOT NULL AND q.tags != ''
  `);
  if (!r.length || !r[0]?.values?.length) return [];

  const tagMap = {};
  for (const row of r[0].values) {
    const tags = String(row[0]).split(',').filter(Boolean).map(t => t.trim());
    for (const tag of tags) {
      if (!tagMap[tag]) tagMap[tag] = { total: 0, correct: 0 };
      tagMap[tag].total += 1;
      if (row[1] === 1 || row[1] === '1') tagMap[tag].correct += 1;
    }
  }

  return Object.entries(tagMap)
    .filter(([_, v]) => v.total >= 3)
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      correct: v.correct,
      rate: Math.round((v.correct / v.total) * 100)
    }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 50);
}

// ======= 错题移除 =======
export function markQuestionMastered(questionId) {
  if (!requireAuth('移除错题')) return
  safeRun('DELETE FROM study_records WHERE question_id = ?', [questionId]);
}

// ======= 导出 =======
export function exportCategoryToJSON(categoryId) {
  const cat = safeExec('SELECT * FROM categories WHERE id = ?', [categoryId]);
  if (!cat.length || !cat[0].values.length) return null;
  const qs = safeExec('SELECT * FROM questions WHERE category_id = ?', [categoryId]);
  if (!qs.length) return { category: cat[0].values[0], questions: [] };
  
  const headers = ['id', 'category_id', 'question_type', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'explanation', 'difficulty', 'tags', 'created_at'];
  const questions = qs[0].values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  
  return {
    category: { id: cat[0].values[0][0], name: cat[0].values[0][1] },
    questions
  };
}

export function exportAllToJSON() {
  const cats = safeExec('SELECT * FROM categories ORDER BY id');
  if (!cats.length) return { categories: [], questions: [] };
  const categories = [];
  const questions = [];
  for (const row of cats[0].values) {
    const id = row[0];
    const catQuestions = safeExec('SELECT * FROM questions WHERE category_id = ?', [id]);
    const qs = catQuestions.length ? catQuestions[0].values.map(mapQuestionRow) : [];
    categories.push({ id, name: row[1], description: row[2], questionCount: qs.length });
    questions.push(...qs);
  }
  return { categories, questions };
}

// ======= 题型统计 =======
export function getQuestionTypeStats() {
  const result = safeExec(`
    SELECT question_type, COUNT(*) as cnt FROM questions GROUP BY question_type
  `);
  if (!result.length) return [];
  return result[0].values.map(row => ({ type: row[0], count: row[1] }));
}

// ======= 连续学习天数 =======
export function getStreak() {
  const result = safeExec(`
    SELECT DISTINCT date(practiced_at) as day
    FROM study_records
    ORDER BY day DESC
  `);
  if (!result.length) return { streak: 0, todayDone: false };

  const dates = result[0].values.map(r => r[0]); // 'YYYY-MM-DD' 降序
  // 用本地日期（与数据库 localtime 存储保持一致），避免 UTC 偏差
  const localDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const todayStr = localDateStr(today);
  const yesterdayStr = localDateStr(new Date(today.getTime() - 86400000));

  // 最近学习日既不是今天也不是昨天 → 连续已中断
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return { streak: 0, todayDone: false };
  }

  const dateSet = new Set(dates);
  let streak = 0;
  // 从今天或昨天开始向前递推连续天数
  let cursor = dates[0] === todayStr ? today : new Date(today.getTime() - 86400000);
  while (dateSet.has(localDateStr(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return { streak, todayDone: dates[0] === todayStr };
}

// ======= 今日答题数 =======
export function getTodayCount() {
  const result = safeExec(
    "SELECT COUNT(*) FROM study_records WHERE date(practiced_at) = date('now', 'localtime')"
  );
  return result[0].values[0][0];
}

// ======= 书签题目 =======
export function getBookmarkedQuestions(categoryId = null) {
  let sql = `
    SELECT q.*, c.name as category_name, b.created_at as bookmarked_at
    FROM bookmarks b
    JOIN questions q ON b.question_id = q.id
    JOIN categories c ON q.category_id = c.id
  `;
  const params = [];
  if (categoryId) {
    sql += ' WHERE q.category_id = ?';
    params.push(categoryId);
  }
  sql += ' ORDER BY b.created_at DESC';
  
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    ...mapQuestionRow(row.slice(0, 13)),
    category_name: row[13],
    bookmarked_at: row[14]
  }));
}

// ======= 标签和难度相关 =======
export function getTagsByCategory(categoryId) {
  const result = safeExec('SELECT DISTINCT tags FROM questions WHERE category_id = ? AND tags != ""', [categoryId]);
  if (!result.length) return [];
  const tags = new Set();
  result[0].values.forEach(row => {
    row[0].split(',').filter(Boolean).forEach(t => tags.add(t.trim()));
  });
  return [...tags].sort();
}

export function getAllTags() {
  const result = safeExec('SELECT DISTINCT tags FROM questions WHERE tags != ""');
  if (!result.length) return [];
  const tags = new Set();
  result[0].values.forEach(row => {
    row[0].split(',').filter(Boolean).forEach(t => tags.add(t.trim()));
  });
  return [...tags].sort();
}

export function getFilteredQuestions(categoryId, { tag, difficulty } = {}) {
  let sql = 'SELECT * FROM questions WHERE category_id = ?';
  const params = [categoryId];
  
  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%${tag}%`);
  }
  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  sql += ' ORDER BY id';
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getFilteredRandomQuestions(categoryId, count, { tag, difficulty } = {}) {
  let sql = 'SELECT * FROM questions WHERE category_id = ?';
  const params = [categoryId];
  
  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%${tag}%`);
  }
  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }
  
  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(count);
  
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

// ======= 试题去重 =======
export function detectDuplicates(categoryId) {
  const result = safeExec(`
    SELECT stem, answer, COUNT(*) as cnt
    FROM questions WHERE category_id = ?
    GROUP BY stem, answer
    HAVING cnt > 1
  `, [categoryId]);
  if (!result.length) return 0;
  return result[0].values.length;
}

export function removeDuplicatesInCategory(categoryId) {
  if (!requireAuth('去重清理')) return 0
  const dupes = safeExec(`
    SELECT stem, answer FROM questions WHERE category_id = ?
    GROUP BY stem, answer HAVING COUNT(*) > 1
  `, [categoryId]);
  if (!dupes.length) return 0;
  
  let removed = 0;
  for (const [stem, answer] of dupes[0].values) {
    const ids = safeExec(
      'SELECT id FROM questions WHERE category_id = ? AND stem = ? AND answer = ? ORDER BY id',
      [categoryId, stem, answer]
    );
    if (ids.length && ids[0].values.length > 1) {
      const keepId = ids[0].values[0][0];
      const toRemove = ids[0].values.slice(1).map(r => r[0]);
      for (const id of toRemove) {
        safeRun('DELETE FROM questions WHERE id = ?', [id]);
        removed++;
      }
    }
  }
  return removed;
}

// ======= 学习提醒 =======
export function getReminderPrefs() {
  try {
    return JSON.parse(localStorage.getItem('studyReminder') || '{"enabled":false,"time":"20:00"}');
  } catch { return { enabled: false, time: '20:00' }; }
}

export function saveReminderPrefs(prefs) {
  localStorage.setItem('studyReminder', JSON.stringify(prefs));
}

// ======= 积分系统 =======
const LEVELS = [
  { name: '新手', min: 0, color: '#b0b0b6' },
  { name: '学徒', min: 100, color: '#78b892' },
  { name: '进阶', min: 300, color: '#6b9b7f' },
  { name: '高手', min: 600, color: '#4a90d9' },
  { name: '达人', min: 1000, color: '#d4a857' },
  { name: '大师', min: 2000, color: '#d46a52' },
  { name: '宗师', min: 4000, color: '#f2866e' },
  { name: '传奇', min: 8000, color: '#c060d0' },
]

export function getXp() {
  try { return parseInt(localStorage.getItem('totalXp') || '0') } catch { return 0 }
}

export function addXp(correct) {
  const xp = getXp() + (correct ? 15 : 5)
  localStorage.setItem('totalXp', String(xp))
  return getLevelInfo(xp)
}

export function getLevelInfo(xp) {
  if (!xp) xp = getXp()
  let level = LEVELS[0], nextXp = LEVELS[1]?.min || 100
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].min) { level = LEVELS[i]; nextXp = LEVELS[i + 1]?.min || (LEVELS[i].min * 2); break }
  }
  const pct = Math.min(100, Math.round(((xp - level.min) / (nextXp - level.min)) * 100))
  return { level: level.name, color: level.color, xp, nextXp, pct }
}

// ======= 错因标签 =======
export function markWrongReason(questionId, reason) {
  if (!requireAuth('标记错因')) return
  safeRun('UPDATE study_records SET wrong_reason = ? WHERE question_id = ? AND is_correct = 0',
    [reason, questionId]
  );
}

export function getWrongQuestionsWithReason(categoryId = null) {
  let sql = `
    SELECT q.*, 
      COUNT(sr.id) as wrong_count,
      MAX(sr.practiced_at) as last_wrong_time,
      GROUP_CONCAT(DISTINCT CASE WHEN sr.wrong_reason IS NOT NULL AND sr.wrong_reason != '' THEN sr.wrong_reason END) as reasons
    FROM questions q
    INNER JOIN study_records sr ON q.id = sr.question_id
    WHERE sr.is_correct = 0
  `;
  const params = [];
  if (categoryId) {
    sql += ' AND q.category_id = ?';
    params.push(categoryId);
  }
  sql += ' GROUP BY q.id ORDER BY wrong_count DESC, last_wrong_time DESC';
  
  const result = safeExec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    ...mapQuestionRow(row.slice(0, 13)),
    wrong_count: row[13],
    last_wrong_time: row[14],
    reasons: row[15] ? row[15].split(',').filter(Boolean) : []
  }));
}

// Reset all data
export async function clearAllData() {
  if (!requireAuth('清空所有数据')) return
  safeRun('DELETE FROM study_records');
  safeRun('DELETE FROM bookmarks');
  safeRun('DELETE FROM questions');
  safeRun('DELETE FROM categories');
  safeRun('DELETE FROM sessions');
  safeRun('DELETE FROM session_items');
  await saveDatabase();
}

// ======= 练习/考试会话 =======
export function saveSession({ type, categoryId, total, correct, timeSpent, score, items }) {
  if (!requireAuth('保存练习记录')) return null
  safeRun(
    'INSERT INTO sessions (type, category_id, total, correct, time_spent, score, finished_at) VALUES (?,?,?,?,?,?, datetime(\'now\',\'localtime\'))',
    [type, categoryId || null, total, correct, timeSpent, score]
  );
  const sessionId = safeExec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0];
  if (sessionId) {
    safeRun('UPDATE sessions SET sync_key = ? WHERE id = ?', [getDeviceId() + ':' + sessionId, sessionId]);
    if (items) {
      for (const item of items) {
        safeRun('INSERT INTO session_items (session_id, question_id, is_correct, answer_given, time_spent) VALUES (?,?,?,?,?)',
          [sessionId, item.questionId, item.isCorrect ? 1 : 0, item.answer || '', item.timeSpent || 0]);
      }
    }
  }
  saveDatabase().catch(() => {});
  return sessionId;
}

export function getSessions(limit = 50) {
  const result = safeExec(
    'SELECT s.*, c.name as category_name FROM sessions s LEFT JOIN categories c ON s.category_id = c.id ORDER BY s.finished_at DESC LIMIT ?',
    [limit]
  );
  if (!result.length) return [];
  return result[0].values.map(row => ({
    id: row[0], type: row[1], category_id: row[2], total: row[3],
    correct: row[4], time_spent: row[5], score: row[6],
    started_at: row[7], finished_at: row[8], category_name: row[9]
  }));
}

export function getSessionDetail(sessionId) {
  const session = safeExec('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session.length || !session[0].values.length) return null;
  const s = session[0].values[0];
  const items = safeExec(
    'SELECT si.*, q.stem, q.answer FROM session_items si LEFT JOIN questions q ON si.question_id = q.id WHERE si.session_id = ?',
    [sessionId]
  );
  return {
    id: s[0], type: s[1], category_id: s[2], total: s[3],
    correct: s[4], time_spent: s[5], score: s[6],
    started_at: s[7], finished_at: s[8],
    items: items.length ? items[0].values.map(row => ({
      id: row[0], question_id: row[2], is_correct: row[3] === 1,
      answer_given: row[4], time_spent: row[5],
      question_text: row[6], answer: row[7]
    })) : []
  };
}

// ======= 数据备份恢复 =======
export async function backupDatabase() {
  await saveDatabase();
  const data = await readStoredDB();
  if (!data) throw new Error('无法读取数据库');
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zetith-backup-${new Date().toISOString().slice(0, 10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreDatabase(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  // Validate SQLite header
  if (data.length < 100 || String.fromCharCode(...data.slice(0, 16)) !== 'SQLite format 3\u0000') {
    throw new Error('无效的数据库文件');
  }
  await writeStoredDB(data);
  // Force reload to re-init
  window.location.reload();
}

// ======= 题目编辑 =======
export function updateQuestion(id, updates) {
  if (!requireAuth('编辑题目')) return
  const fields = [];
  const params = [];
  const map = {
    stem: 'stem', option_a: 'option_a', option_b: 'option_b',
    option_c: 'option_c', option_d: 'option_d', answer: 'answer',
    explanation: 'explanation', difficulty: 'difficulty', tags: 'tags', category_id: 'category_id'
  };
  for (const [key, col] of Object.entries(map)) {
    if (updates[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(updates[key]);
    }
  }
  if (!fields.length) return;
  params.push(id);
  safeRun(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase().catch(() => {});
}

export function addQuestion(data) {
  if (!requireAuth('新增题目')) return
  safeRun(
    'INSERT INTO questions (category_id, stem, option_a, option_b, option_c, option_d, answer, explanation, difficulty, tags) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [data.category_id, data.stem, data.option_a || '', data.option_b || '',
     data.option_c || '', data.option_d || '', data.answer, data.explanation || '',
     data.difficulty || '适中', data.tags || '']
  );
  saveDatabase().catch(() => {});
}

export function deleteQuestion(id) {
  if (!requireAuth('删除题目')) return
  safeRun('DELETE FROM questions WHERE id = ?', [id]);
  saveDatabase().catch(() => {});
}

export function getQuestionsByDifficulty(categoryId, difficulty) {
  const sql = 'SELECT * FROM questions WHERE category_id = ? AND difficulty = ?';
  const result = safeExec(sql, [categoryId, difficulty]);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getDailyHeatmap(days = 365) {
  const result = safeExec(
    `SELECT date(practiced_at) as day, COUNT(*) as count FROM study_records WHERE practiced_at >= datetime('now', ? || ' days', 'localtime') GROUP BY day ORDER BY day`,
    [`-${days}`]
  );
  if (!result.length) return [];
  return result[0].values.map(row => ({ day: row[0], count: row[1] }));
}

// Dedicated COUNT query for learning days (much faster than fetching all rows)
export function getLearningDaysCount(days = 365) {
  const result = safeExec(
    `SELECT COUNT(DISTINCT date(practiced_at)) FROM study_records WHERE practiced_at >= datetime('now', ? || ' days', 'localtime')`,
    [`-${days}`]
  );
  return result[0]?.values?.[0]?.[0] || 0;
}
