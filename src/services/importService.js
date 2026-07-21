import * as XLSX from 'xlsx';
import { createCategory, insertQuestions, saveDatabase } from '../db/database';

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
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

function detectFieldMap(headers) {
  const map = {};
  for (const h of headers) {
    const normalized = normalizeHeader(h);
    if (DEFAULT_FIELD_MAP[normalized]) {
      map[h] = DEFAULT_FIELD_MAP[normalized];
    } else if (DEFAULT_FIELD_MAP[h]) {
      map[h] = DEFAULT_FIELD_MAP[h];
    }
  }
  return map;
}

function normalizeAnswer(answer) {
  if (!answer) return '';
  let a = String(answer).trim().toUpperCase();
  a = a.replace(/\s+/g, '');
  if (a === '正确' || a === '对' || a === 'TRUE' || a === 'T') return '正确';
  if (a === '错误' || a === '错' || a === 'FALSE' || a === 'F') return '错误';
  return a;
}

function normalizeDifficulty(d) {
  if (!d) return '适中';
  const s = String(d).trim();
  const map = {
    '易': '易', '容易': '易', '简单': '易', '1': '易', 'easy': '易',
    '偏易': '偏易', '较易': '偏易', '2': '偏易',
    '适中': '适中', '中等': '适中', '一般': '适中', '3': '适中',
    '偏难': '偏难', '较难': '偏难', '4': '偏难',
    '难': '难', '困难': '难', '5': '难', 'hard': '难'
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

export function parseExcelFile(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const results = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (jsonData.length === 0) continue;

    const headers = Object.keys(jsonData[0]);
    const fieldMap = detectFieldMap(headers);

    if (!fieldMap['stem'] && !fieldMap['题干'] && !fieldMap['题目']) {
      continue;
    }

    const questions = [];
    let skipCount = 0;

    for (const row of jsonData) {
      let stem = '';
      const mapped = {};

      for (const [key, value] of Object.entries(row)) {
        if (fieldMap[key]) {
          mapped[fieldMap[key]] = value;
        }
      }

      stem = mapped.stem || '';
      if (!stem || String(stem).trim().length === 0) {
        skipCount++;
        continue;
      }

      questions.push({
        question_type: normalizeQuestionType(mapped.question_type),
        stem: String(stem).trim(),
        option_a: String(mapped.option_a || '').trim(),
        option_b: String(mapped.option_b || '').trim(),
        option_c: String(mapped.option_c || '').trim(),
        option_d: String(mapped.option_d || '').trim(),
        answer: normalizeAnswer(mapped.answer || ''),
        explanation: String(mapped.explanation || '').trim(),
        difficulty: normalizeDifficulty(mapped.difficulty),
        tags: String(mapped.tags || '').trim()
      });
    }

    results.push({
      sheetName,
      questions,
      skipCount,
      headers,
      fieldMap
    });
  }

  return results;
}

export async function importFromFiles(files) {
  const totalResults = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const categoryName = file.name.replace(/\.(xlsx|xls)$/i, '');
      
      const parseResults = parseExcelFile(arrayBuffer, file.name);

      for (const sheetResult of parseResults) {
        if (sheetResult.questions.length === 0) {
          totalSkipped += sheetResult.skipCount;
          continue;
        }

        const sheetSuffix = parseResults.length > 1 ? ` - ${sheetResult.sheetName}` : '';
        const fullCategoryName = categoryName + sheetSuffix;

        const categoryId = createCategory(fullCategoryName, `从文件 ${file.name} 导入`);
        
        const questionsWithCategory = sheetResult.questions.map(q => ({
          ...q,
          category_id: categoryId
        }));

        const inserted = insertQuestions(questionsWithCategory);
        totalImported += inserted;
        totalSkipped += sheetResult.skipCount;
        
        totalResults.push({
          fileName: file.name,
          sheetName: sheetResult.sheetName,
          categoryName: fullCategoryName,
          imported: inserted,
          skipped: sheetResult.skipCount
        });
      }
    } catch (err) {
      totalErrors++;
      totalResults.push({
        fileName: file.name,
        error: err.message
      });
    }
  }

  await saveDatabase();

  return {
    results: totalResults,
    totalImported,
    totalSkipped,
    totalErrors
  };
}

export async function batchImportFromDirectory(filePaths, readFileFn) {
  const files = [];
  
  for (const path of filePaths) {
    try {
      const data = await readFileFn(path);
      const fileName = path.split('/').pop();
      files.push(new File([data], fileName));
    } catch (err) {
      console.error(`Failed to read ${path}:`, err);
    }
  }

  return importFromFiles(files);
}
