import { supabase, isSupabaseConfigured } from './supabaseClient'

const LS_EMAIL = 'zetith_account_email' // 仅缓存邮箱用于界面展示，绝不缓存密码

// 登录态缓存（同步可读，供写入操作即时判断是否已登录，无需每次走网络）
let cachedUser = null

// 供 Layout / 登录成功后更新缓存；requireAuth 依据它即时判断
export function setCachedUser(user) {
  cachedUser = user || null
}

// 强制登录闸门（同步）：已登录返回 true；未登录则派发全局事件弹出登录弹窗并返回 false。
// 所有「写操作」在落库前调用它，实现「未登录只能浏览，任何操作强制登录」。
export function requireAuth(reason = '此操作') {
  if (cachedUser) return true
  try {
    window.dispatchEvent(new CustomEvent('zetith:require-login', { detail: { reason } }))
  } catch {}
  return false
}


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
  if (data.session) {
    localStorage.setItem(LS_EMAIL, email)
    // 立即刷新登录态缓存（不依赖异步 auth 事件），让强制登录闸门确定生效
    setCachedUser(data.user)
  }
  return data
}

// 邮箱 + 密码 登录
export async function signIn(email, password) {
  if (!supabase) throw new Error('同步后端未配置')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  localStorage.setItem(LS_EMAIL, email)
  // 立即刷新登录态缓存（不依赖异步 auth 事件）
  if (data.session?.user) setCachedUser(data.session.user)
  return data
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  localStorage.removeItem(LS_EMAIL)
  setCachedUser(null)
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
