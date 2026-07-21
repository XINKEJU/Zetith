import initSqlJs from 'sql.js';

let db = null;
let SQL = null;

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
    
    await writeOPFS(buffer);
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

  const existing = await readOPFS();
  if (existing) {
    db = new SQL.Database(existing);
  } else {
    // Try loading pre-built database
    db = await loadPrebuiltDB(SQL, onProgress);
    if (!db) {
      db = new SQL.Database();
    }
  }

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS questions (
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

  db.run(`CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    answer_given TEXT DEFAULT '',
    time_spent INTEGER DEFAULT 0,
    practiced_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS review_state (
    question_id INTEGER PRIMARY KEY,
    stage INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT,
    last_reviewed_at TEXT,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL UNIQUE,
    content TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_records_question ON study_records(question_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_records_category ON study_records(category_id)`);

  await saveDatabase();
  return db;
}

export async function saveDatabase() {
  if (!db) return;
  const data = db.export();
  await writeOPFS(data.buffer);
}

export function getDatabase() {
  return db;
}

// Category operations
export function getAllCategories() {
  const result = db.exec(`SELECT c.*, 
    (SELECT COUNT(*) FROM questions WHERE category_id = c.id) as question_count
    FROM categories c ORDER BY c.updated_at DESC`);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    id: row[0], name: row[1], description: row[2],
    created_at: row[3], updated_at: row[4], question_count: row[5]
  }));
}

export function createCategory(name, description = '') {
  db.run('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0];
}

export function deleteCategory(id) {
  db.run('DELETE FROM categories WHERE id = ?', [id]);
}

export function getCategoryById(id) {
  const result = db.exec('SELECT * FROM categories WHERE id = ?', [id]);
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
  if (limit !== null) sql += ` LIMIT ${limit} OFFSET ${offset}`;
  const result = db.exec(sql, [categoryId]);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getQuestionById(id) {
  const result = db.exec('SELECT * FROM questions WHERE id = ?', [id]);
  if (!result.length || !result[0].values.length) return null;
  return mapQuestionRow(result[0].values[0]);
}

export function getRandomQuestions(categoryId, count) {
  const result = db.exec(
    'SELECT * FROM questions WHERE category_id = ? ORDER BY RANDOM() LIMIT ?',
    [categoryId, count]
  );
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

export function getQuestionCount(categoryId) {
  const result = db.exec('SELECT COUNT(*) FROM questions WHERE category_id = ?', [categoryId]);
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
  db.run(
    'INSERT INTO study_records (question_id, category_id, is_correct, answer_given, time_spent) VALUES (?, ?, ?, ?, ?)',
    [questionId, categoryId, isCorrect ? 1 : 0, answerGiven, timeSpent]
  );
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

  const total = db.exec(totalSql, params)[0].values[0][0];
  const correct = db.exec(correctSql, params)[0].values[0][0];
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
  
  const result = db.exec(sql, params);
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
  const result = db.exec(sql, categoryId ? [categoryId] : []);
  if (!result.length) return new Set();
  return new Set(result[0].values.map(r => r[0]));
}

// Bookmarks
export function toggleBookmark(questionId) {
  const existing = db.exec('SELECT id FROM bookmarks WHERE question_id = ?', [questionId]);
  if (existing.length && existing[0].values.length) {
    db.run('DELETE FROM bookmarks WHERE question_id = ?', [questionId]);
    return false;
  } else {
    db.run('INSERT INTO bookmarks (question_id) VALUES (?)', [questionId]);
    return true;
  }
}

export function isBookmarked(questionId) {
  const result = db.exec('SELECT id FROM bookmarks WHERE question_id = ?', [questionId]);
  return result.length > 0 && result[0].values.length > 0;
}

export function getBookmarkIds() {
  const result = db.exec('SELECT question_id FROM bookmarks');
  if (!result.length) return new Set();
  return new Set(result[0].values.map(r => r[0]));
}

// Stats
export function getDailyStats(days = 7) {
  const result = db.exec(`
    SELECT date(practiced_at) as day,
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM study_records
    WHERE practiced_at >= datetime('now', '-${days} days', 'localtime')
    GROUP BY date(practiced_at)
    ORDER BY day ASC
  `);
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
  const existing = db.exec('SELECT stage, ease_factor, interval_days FROM review_state WHERE question_id = ?', [questionId]);
  let stage = 0, easeFactor = 2.5, interval = 0;

  if (existing.length && existing[0].values.length) {
    stage = existing[0].values[0][0];
    easeFactor = existing[0].values[0][1];
    interval = existing[0].values[0][2];
  }

  const updated = sm2Update(quality, stage, easeFactor, interval);
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + updated.interval);

  db.run(`INSERT OR REPLACE INTO review_state 
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
    const result = db.exec(sql, [categoryId]);
    if (!result.length) return [];
    return result[0].values.map(mapReviewRow);
  }
  
  const result = db.exec(sql);
  if (!result.length) return [];
  return result[0].values.map(mapReviewRow);
}

export function getReviewDueCount() {
  const result = db.exec(
    "SELECT COUNT(*) FROM review_state WHERE next_review_at <= datetime('now', 'localtime')"
  );
  return result[0].values[0][0];
}

export function addToReviewQueue(questionId, stage = 0, easeFactor = 2.5, interval = 0) {
  const now = new Date();
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  
  db.run(`INSERT OR REPLACE INTO review_state
    (question_id, stage, ease_factor, interval_days, next_review_at, last_reviewed_at)
    VALUES (?, ?, ?, ?, datetime(?, 'localtime'), datetime('now','localtime'))`,
    [questionId, stage, easeFactor, interval, nextReview.toISOString().slice(0, 19)]
  );
}

export function getReviewStats() {
  const total = db.exec("SELECT COUNT(*) FROM review_state");
  const due = db.exec("SELECT COUNT(*) FROM review_state WHERE next_review_at <= datetime('now', 'localtime')");
  const mastered = db.exec("SELECT COUNT(*) FROM review_state WHERE stage >= 5");
  
  return {
    total: total[0].values[0][0],
    due: due[0].values[0][0],
    mastered: mastered[0].values[0][0]
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
  const result = db.exec('SELECT content FROM notes WHERE question_id = ?', [questionId]);
  if (!result.length || !result[0].values.length) return '';
  return result[0].values[0][0] || '';
}

export function saveNote(questionId, content) {
  db.run(`INSERT OR REPLACE INTO notes (question_id, content, updated_at) VALUES (?, ?, datetime('now','localtime'))`,
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
  
  const result = db.exec(sql, params);
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
  const total = db.exec('SELECT COUNT(*) FROM questions WHERE category_id = ?', [categoryId])[0].values[0][0];
  const attempted = db.exec(
    'SELECT COUNT(DISTINCT question_id) FROM study_records WHERE category_id = ?', [categoryId]
  )[0].values[0][0];
  const correct = db.exec(
    `SELECT COUNT(DISTINCT question_id) FROM study_records 
     WHERE category_id = ? AND is_correct = 1 AND question_id NOT IN (
       SELECT question_id FROM study_records WHERE category_id = ? AND is_correct = 0
     )`, [categoryId, categoryId]
  )[0].values[0][0];
  
  return { total, attempted, correct };
}

// ======= 弱项诊断 =======
export function getTagAnalysis() {
  const result = db.exec(`
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
  const tags = new Set();
  const allResult = db.exec("SELECT DISTINCT tags FROM questions WHERE tags != ''");
  if (allResult.length) {
    allResult[0].values.forEach(row => {
      row[0].split(',').filter(Boolean).forEach(t => tags.add(t.trim()));
    });
  }
  
  const stats = [];
  for (const tag of tags) {
    const r = db.exec(`
      SELECT COUNT(sr.id),
        SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END)
      FROM study_records sr
      JOIN questions q ON sr.question_id = q.id
      WHERE q.tags LIKE ?
    `, [`%${tag}%`]);
    if (r.length && r[0].values.length) {
      const total = r[0].values[0][0] || 0;
      const correct = r[0].values[0][1] || 0;
      if (total > 0) {
        stats.push({
          tag,
          total,
          correct,
          rate: Math.round((correct / total) * 100)
        });
      }
    }
  }
  return stats.sort((a, b) => a.rate - b.rate);
}

// ======= 错题移除 =======
export function markQuestionMastered(questionId) {
  db.run('DELETE FROM study_records WHERE question_id = ?', [questionId]);
}

// ======= 导出 =======
export function exportCategoryToJSON(categoryId) {
  const cat = db.exec('SELECT * FROM categories WHERE id = ?', [categoryId]);
  if (!cat.length || !cat[0].values.length) return null;
  const qs = db.exec('SELECT * FROM questions WHERE category_id = ?', [categoryId]);
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
  const cats = db.exec('SELECT * FROM categories');
  if (!cats.length) return [];
  return cats[0].values.map(row => ({
    id: row[0], name: row[1],
    questionCount: db.exec('SELECT COUNT(*) FROM questions WHERE category_id = ?', [row[0]])[0].values[0][0]
  }));
}

// ======= 题型统计 =======
export function getQuestionTypeStats() {
  const result = db.exec(`
    SELECT question_type, COUNT(*) as cnt FROM questions GROUP BY question_type
  `);
  if (!result.length) return [];
  return result[0].values.map(row => ({ type: row[0], count: row[1] }));
}

// ======= 连续学习天数 =======
export function getStreak() {
  const result = db.exec(`
    SELECT DISTINCT date(practiced_at) as day
    FROM study_records
    ORDER BY day DESC
  `);
  if (!result.length) return { streak: 0, todayDone: false };
  
  const dates = result[0].values.map(r => r[0]);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  let streak = 0;
  if (dates[0] === today) streak = 1;
  else if (dates[0] !== yesterday) return { streak: 0, todayDone: false };
  
  for (let i = streak; i < dates.length; i++) {
    const expected = new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10);
    if (dates[i] === expected) streak++;
    else break;
  }
  
  return { streak, todayDone: dates[0] === today };
}

// ======= 今日答题数 =======
export function getTodayCount() {
  const result = db.exec(
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
  
  const result = db.exec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(row => ({
    ...mapQuestionRow(row.slice(0, 13)),
    category_name: row[13],
    bookmarked_at: row[14]
  }));
}

// ======= 标签和难度相关 =======
export function getTagsByCategory(categoryId) {
  const result = db.exec('SELECT DISTINCT tags FROM questions WHERE category_id = ? AND tags != ""', [categoryId]);
  if (!result.length) return [];
  const tags = new Set();
  result[0].values.forEach(row => {
    row[0].split(',').filter(Boolean).forEach(t => tags.add(t.trim()));
  });
  return [...tags].sort();
}

export function getAllTags() {
  const result = db.exec('SELECT DISTINCT tags FROM questions WHERE tags != ""');
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
  const result = db.exec(sql, params);
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
  
  const result = db.exec(sql, params);
  if (!result.length) return [];
  return result[0].values.map(mapQuestionRow);
}

// ======= 试题去重 =======
export function detectDuplicates(categoryId) {
  const result = db.exec(`
    SELECT stem, answer, COUNT(*) as cnt
    FROM questions WHERE category_id = ?
    GROUP BY stem, answer
    HAVING cnt > 1
  `, [categoryId]);
  if (!result.length) return 0;
  return result[0].values.length;
}

export function removeDuplicatesInCategory(categoryId) {
  const dupes = db.exec(`
    SELECT stem, answer FROM questions WHERE category_id = ?
    GROUP BY stem, answer HAVING COUNT(*) > 1
  `, [categoryId]);
  if (!dupes.length) return 0;
  
  let removed = 0;
  for (const [stem, answer] of dupes[0].values) {
    const ids = db.exec(
      'SELECT id FROM questions WHERE category_id = ? AND stem = ? AND answer = ? ORDER BY id',
      [categoryId, stem, answer]
    );
    if (ids.length && ids[0].values.length > 1) {
      const keepId = ids[0].values[0][0];
      const toRemove = ids[0].values.slice(1).map(r => r[0]);
      for (const id of toRemove) {
        db.run('DELETE FROM questions WHERE id = ?', [id]);
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

// Reset all data
export async function clearAllData() {
  db.run('DELETE FROM study_records');
  db.run('DELETE FROM bookmarks');
  db.run('DELETE FROM questions');
  db.run('DELETE FROM categories');
  await saveDatabase();
}
