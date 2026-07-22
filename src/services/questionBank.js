import { supabase, isSupabaseConfigured } from './supabaseClient'
import {
  getDatabase,
  saveDatabase,
  getAllCategories,
  searchQuestions as localSearchQuestions
} from '../db/database'

// ============================================================
// 云端题库服务
// 设计：云端（Supabase）是题库的「源」，本地 SQLite 仅作缓存层。
// - 已配置后端且在线：从云端拉取分类/题目，缓存进本地，UI 读本地（快、可离线）。
// - 未配置或离线：静默回退到本地 tiku.db 兜底，浏览/学习均不受影响。
// - 题目要求「未登录也能浏览」：分类与题目表对匿名开放只读（见 schema.sql）。
// ============================================================

const hydratedCats = new Set() // '__all' 表示分类已同步；具体 id 表示该题已缓存
const inflight = new Map()

export function isCloudSource() {
  return isSupabaseConfigured() && !!supabase
}

// 把云端一行题目规范成与本地 mapQuestionRow 一致的扁平对象
function mapCloudQuestion(q) {
  return {
    id: q.id, category_id: q.category_id, question_type: q.question_type, stem: q.stem,
    option_a: q.option_a || '', option_b: q.option_b || '', option_c: q.option_c || '', option_d: q.option_d || '',
    answer: q.answer, explanation: q.explanation || '', difficulty: q.difficulty || '适中', tags: q.tags || '',
    created_at: q.created_at
  }
}

// 批量把云端题目写入本地缓存（按 id 去重，避免重复）。调用方负责事务外层与 saveDatabase。
function insertCloudQuestions(db, rows) {
  db.run('BEGIN')
  try {
    for (const q of rows) {
      db.run(
        `INSERT OR IGNORE INTO questions
          (id, category_id, question_type, stem, option_a, option_b, option_c, option_d, answer, explanation, difficulty, tags, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [q.id, q.category_id, q.question_type || '单选题', q.stem, q.option_a || '', q.option_b || '',
         q.option_c || '', q.option_d || '', q.answer, q.explanation || '', q.difficulty || '适中', q.tags || '', q.created_at]
      )
    }
    db.run('COMMIT')
  } catch (e) {
    try { db.run('ROLLBACK') } catch {}
    throw e
  }
}

// 把云端分类 + 题量同步到本地缓存（INSERT OR REPLACE 保留 id）
export async function hydrateCategories() {
  if (!isCloudSource()) return
  if (hydratedCats.has('__all')) return
  const d = getDatabase()
  if (!d) return
  try {
    const { data: cats, error } = await supabase
      .from('categories')
      .select('id,name,description,created_at,updated_at')
    if (error) throw error

    const { data: counts, error: ce } = await supabase.rpc('category_question_counts')
    if (ce) throw ce

    const countMap = new Map()
    for (const c of counts || []) countMap.set(c.category_id, Number(c.cnt))

    d.run('BEGIN')
    for (const c of cats || []) {
      d.run(
        `INSERT INTO categories (id, name, description, created_at, updated_at, question_count)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           description=excluded.description,
           updated_at=excluded.updated_at,
           question_count=excluded.question_count`,
        [c.id, c.name, c.description || '', c.created_at, c.updated_at, countMap.get(c.id) || 0]
      )
    }
    d.run('COMMIT')
    await saveDatabase()
    hydratedCats.add('__all')
  } catch (e) {
    // 云端不可用时静默回退到本地兜底题库
    try { d.run('ROLLBACK') } catch {}
    if (import.meta.env.DEV) console.warn('hydrateCategories 失败（已回退本地）：', e?.message)
  }
}

// 把某分类的题目从云端同步到本地缓存（按 id 去重，避免重复）
export async function ensureCategoryQuestions(categoryId) {
  if (!isCloudSource()) return
  const key = String(categoryId)
  if (hydratedCats.has(key)) return
  if (inflight.has(key)) return inflight.get(key)

  const p = (async () => {
    const d = getDatabase()
    if (!d) return
    const PAGE = 2000
    let offset = 0
    try {
      while (true) {
        const { data, error } = await supabase
          .from('questions')
          .select('id,category_id,question_type,stem,option_a,option_b,option_c,option_d,answer,explanation,difficulty,tags,created_at')
          .eq('category_id', categoryId)
          .order('id')
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        if (!data || !data.length) break

        insertCloudQuestions(d, data)
        await saveDatabase()

        if (data.length < PAGE) break
        offset += PAGE
      }
      hydratedCats.add(key)
    } catch (e) {
      if (import.meta.env.DEV) console.warn('ensureCategoryQuestions 失败（已回退本地）：', e?.message)
    }
  })()

  inflight.set(key, p)
  await p
  inflight.delete(key)
}

export async function getCategories() {
  await hydrateCategories()
  return getAllCategories()
}

// 搜索：云端优先（可命中未本地缓存的分类），命中结果回写本地缓存；离线回退本地
export async function searchQuestions(keyword, categoryId = null) {
  const term = (keyword || '').trim()
  if (!term) return []

  // 清洗搜索词：移除会破坏 PostgREST .or() 语法与 LIKE 通配符的字符，避免查询报错
  const safe = term.replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!safe) return []

  if (isCloudSource()) {
    try {
      let query = supabase
        .from('questions')
        .select('id,category_id,question_type,stem,option_a,option_b,option_c,option_d,answer,explanation,difficulty,tags,created_at')
        .or(`stem.ilike.%${safe}%,tags.ilike.%${safe}%,explanation.ilike.%${safe}%`)
      if (categoryId) query = query.eq('category_id', categoryId)
      const { data, error } = await query.limit(50)
      if (!error && data?.length) {
        const d = getDatabase()
        if (d) {
          insertCloudQuestions(d, data)
          await saveDatabase()
        }
        const catName = {}
        for (const c of getAllCategories()) catName[c.id] = c.name
        return data.map(q => {
          const m = mapCloudQuestion(q)
          m.category_name = catName[q.category_id] || ''
          return m
        })
      }
    } catch (e) {
      // 云端搜索失败 → 回退本地
      if (import.meta.env.DEV) console.warn('云端搜索失败，回退本地：', e?.message)
    }
  }
  return localSearchQuestions(term, categoryId)
}
