/**
 * 预导入脚本：读取 tiku/ 目录下所有 Excel 文件，生成预构建 SQLite 数据库
 * 运行方式: node scripts/prebuild-db.mjs
 */
import initSqlJs from 'sql.js';
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const TIKU_DIR = join(import.meta.dirname, '../../tiku');
const OUTPUT_DIR = join(import.meta.dirname, '../public');

const DEFAULT_FIELD_MAP = {
  '题型': 'question_type',
  '题干': 'stem',
  '题目': 'stem',
  '选项A': 'option_a',
  '选项B': 'option_b',
  '选项C': 'option_c',
  '选项D': 'option_d',
  '答案': 'answer',
  '解析': 'explanation',
  '难度': 'difficulty',
  '标签': 'tags',
  'tag': 'tags'
};

function normalizeHeader(h) {
  if (!h) return '';
  return String(h).trim()
    .replace(/[\s\n\r]+/g, '')
    .replace(/（/g, '(').replace(/）/g, ')');
}

function detectFieldMap(headers) {
  const map = {};
  for (const h of headers) {
    const normalized = normalizeHeader(h);
    if (DEFAULT_FIELD_MAP[normalized]) map[h] = DEFAULT_FIELD_MAP[normalized];
    else if (DEFAULT_FIELD_MAP[h]) map[h] = DEFAULT_FIELD_MAP[h];
  }
  return map;
}

function normalizeAnswer(answer) {
  if (!answer) return '';
  let a = String(answer).trim().toUpperCase().replace(/\s+/g, '');
  if (a === '正确' || a === '对' || a === 'TRUE') return '正确';
  if (a === '错误' || a === '错' || a === 'FALSE') return '错误';
  return a;
}

function normalizeDifficulty(d) {
  if (!d) return '适中';
  const s = String(d).trim();
  const map = {
    '易': '易', '容易': '易', '简单': '易',
    '偏易': '偏易', '较易': '偏易',
    '适中': '适中', '中等': '适中', '一般': '适中',
    '偏难': '偏难', '较难': '偏难',
    '难': '难', '困难': '难'
  };
  return map[s] || '适中';
}

function normalizeQuestionType(t) {
  if (!t) return '单选题';
  const s = String(t).trim();
  if (s.includes('单选')) return '单选题';
  if (s.includes('多选')) return '多选题';
  if (s.includes('判断')) return '判断题';
  return '单选题';
}

function getRelativePath(filePath) {
  return filePath.replace(TIKU_DIR + '/', '');
}

function getAllExcelFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (entry.startsWith('.') || entry.startsWith('~')) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllExcelFiles(fullPath));
    } else if (entry.match(/\.(xlsx|xls)$/i)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  console.log('🔍 扫描题库目录...');
  const excelFiles = getAllExcelFiles(TIKU_DIR);
  console.log(`📁 找到 ${excelFiles.length} 个 Excel 文件\n`);

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create tables
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_records_question ON study_records(question_id)`);

  const insertStmt = db.prepare(`INSERT INTO questions 
    (category_id, question_type, stem, option_a, option_b, option_c, option_d, answer, explanation, difficulty, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let totalQuestions = 0;
  let totalSkipped = 0;
  let totalFiles = 0;

  for (const filePath of excelFiles) {
    try {
      const buffer = readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const relPath = getRelativePath(filePath);
      const dirName = basename(relPath.replace(/\.(xlsx|xls)$/i, ''));

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (jsonData.length === 0) continue;

        const headers = Object.keys(jsonData[0]);
        const fieldMap = detectFieldMap(headers);

        const stemKey = Object.entries(fieldMap).find(([, v]) => v === 'stem');
        if (!stemKey) continue;

        const categoryName = workbook.SheetNames.length > 1
          ? `${relPath.replace(/\.(xlsx|xls)$/i, '')} - ${sheetName}`
          : relPath.replace(/\.(xlsx|xls)$/i, '');

        db.run('INSERT INTO categories (name, description) VALUES (?, ?)', [categoryName, `从 ${relPath} 导入`]);
        const categoryId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

        let fileQuestions = 0;
        let fileSkipped = 0;

        for (const row of jsonData) {
          const mapped = {};
          for (const [key, value] of Object.entries(row)) {
            if (fieldMap[key]) mapped[fieldMap[key]] = value;
          }

          const stem = mapped.stem ? String(mapped.stem).trim() : '';
          if (!stem) {
            fileSkipped++;
            continue;
          }

          insertStmt.run([
            categoryId,
            normalizeQuestionType(mapped.question_type),
            stem,
            String(mapped.option_a || '').trim(),
            String(mapped.option_b || '').trim(),
            String(mapped.option_c || '').trim(),
            String(mapped.option_d || '').trim(),
            normalizeAnswer(mapped.answer || ''),
            String(mapped.explanation || '').trim(),
            normalizeDifficulty(mapped.difficulty),
            String(mapped.tags || '').trim()
          ]);
          fileQuestions++;
        }

        if (fileQuestions > 0) {
          console.log(`✅ ${categoryName}: ${fileQuestions} 题`);
          totalQuestions += fileQuestions;
          totalFiles++;
        }
        totalSkipped += fileSkipped;
      }
    } catch (err) {
      console.error(`❌ ${getRelativePath(filePath)}: ${err.message}`);
    }
  }

  insertStmt.free();

  // Save database
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const data = db.export();
  writeFileSync(join(OUTPUT_DIR, 'tiku.db'), Buffer.from(data));
  db.close();

  console.log(`\n📊 导入完成:`);
  console.log(`   总题目数: ${totalQuestions}`);
  console.log(`   总题库数: ${totalFiles}`);
  console.log(`   跳过行数: ${totalSkipped}`);
  console.log(`   数据库文件: public/tiku.db (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch(console.error);
