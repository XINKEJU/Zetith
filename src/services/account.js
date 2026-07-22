import { supabase, isSupabaseConfigured } from './supabaseClient'

const LS_EMAIL = 'zetith_account_email' // 仅缓存邮箱用于界面展示，绝不缓存密码

// 后端是否已配置（开发者在 .env 中填入 Supabase 凭据）
export function isConfigured() {
  return isSupabaseConfigured()
}

// 邮箱 + 密码 注册。Supabase 默认开启「邮箱确认」，未确认前 signIn 会失败；
// 开发者可在 Supabase 控制台关闭邮件确认以便即时体验。
export async function signUp(email, password) {
  if (!supabase) throw new Error('同步后端未配置')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (data.session) localStorage.setItem(LS_EMAIL, email)
  return data
}

// 邮箱 + 密码 登录
export async function signIn(email, password) {
  if (!supabase) throw new Error('同步后端未配置')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  localStorage.setItem(LS_EMAIL, email)
  return data
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  localStorage.removeItem(LS_EMAIL)
}

// 取当前会话（含 user）；未登录返回 null
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session || null
}

// 监听登录态变化（登录/登出/刷新令牌）。返回取消订阅函数
export function onAuthChange(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(session?.user || null, event)
  })
  return () => data.subscription.unsubscribe()
}

export function getCachedEmail() {
  return localStorage.getItem(LS_EMAIL) || ''
}
