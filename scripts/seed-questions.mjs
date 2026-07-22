// ============================================================
// 一次性题库上云脚本（开发者运行）
// 读取本地 public/tiku.db（含全部分类与题目），批量 upsert 到 Supabase 的
// categories / questions 表。题目 id 沿用本地整数 id，保证多端进度关联一致。
//
// 前置：
//   1. 在 Supabase SQL Editor 执行 supabase/schema.sql（建表 + RLS + RPC）。
//   2. 准备 service_role key（Project Settings → API → service_role，绕过 RLS）。
//
// 运行（在本项目根目录 tiku-app/ 下）：
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-questions.mjs
// 说明：service_role key 仅通过环境变量传入，不会写入任何文件。
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ---- 读取 .env 中的项目 URL（不含密钥）----
function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  const out = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(.+)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  console.error('✗ 未找到 VITE_SUPABASE_URL（请确认 .env 已配置）')
  process.exit(1)
}
if (!serviceKey) {
  console.error('✗ 缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量。\n  运行方式：SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-questions.mjs')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// ---- 加载本地 tiku.db ----
const dbPath = path.join(ROOT, 'public', 'tiku.db')
if (!fs.existsSync(dbPath)) {
  console.error('✗ 未找到 public/tiku.db，无法读取题库。')
  process.exit(1)
}

const SQL = await initSqlJs({
  locateFile: (f) => path.join(ROOT, 'node_modules', 'sql.js', 'dist', f)
})
const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))

function toISO(s) {
  if (!s) return null
  const str = String(s).trim().replace(' ', 'T')
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

async function upsertInBatches(table, rows, batchSize = 1000) {
  let done = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'id' })
    if (error) throw new Error(`upsert ${table} 失败: ${error.message}`)
    done += slice.length
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`)
  }
  process.stdout.write('\n')
}

console.log('→ 读取本地题库…')
const catRes = db.exec('SELECT id,name,description,created_at,updated_at FROM categories')
const qRes = db.exec('SELECT id,category_id,question_type,stem,option_a,option_b,option_c,option_d,answer,explanation,difficulty,tags,created_at FROM questions')

if (!qRes.length) {
  console.error('✗ tiku.db 中没有题目数据。')
  process.exit(1)
}

const categories = catRes.length
  ? catRes[0].values.map(r => ({
      id: r[0], name: r[1], description: r[2] || '', created_at: toISO(r[3]), updated_at: toISO(r[4])
    }))
  : []

const colNames = qRes[0].columns
let qIndex = {}
colNames.forEach((c, i) => { qIndex[c] = i })
const questions = qRes[0].values.map(r => ({
  id: r[qIndex.id],
  category_id: r[qIndex.category_id],
  question_type: r[qIndex.question_type] || '单选题',
  stem: r[qIndex.stem],
  option_a: r[qIndex.option_a] || '',
  option_b: r[qIndex.option_b] || '',
  option_c: r[qIndex.option_c] || '',
  option_d: r[qIndex.option_d] || '',
  answer: r[qIndex.answer],
  explanation: r[qIndex.explanation] || '',
  difficulty: r[qIndex.difficulty] || '适中',
  tags: r[qIndex.tags] || '',
  created_at: toISO(r[qIndex.created_at])
}))

console.log(`→ 分类 ${categories.length} 个，题目 ${questions.length} 道。开始上传…`)

try {
  if (categories.length) {
    console.log('→ 上传分类…')
    await upsertInBatches('categories', categories)
  }
  console.log('→ 上传题目（分批）…')
  await upsertInBatches('questions', questions, 1000)
  console.log('✓ 题库已成功上传到 Supabase。')
} catch (e) {
  console.error('✗ 上传失败：', e.message)
  process.exit(1)
}
