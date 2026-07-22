import { createClient } from '@supabase/supabase-js'

// Vite 仅暴露 VITE_ 前缀变量；兼容用户从 Supabase 模板复制的 NEXT_PUBLIC_ 命名
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// 是否已配置后端：env 缺失或仍为占位值时返回 false，UI 进入「未配置」降级态，不抛错
export function isSupabaseConfigured() {
  return (
    !!url &&
    !!anonKey &&
    String(url).startsWith('http') &&
    !String(url).includes('YOUR-PROJECT') &&
    !String(anonKey).includes('YOUR-ANON')
  )
}

// Electron 下把会话持久化到文件（通过主进程 IPC），避免 localStorage 因随机端口
// 导致 origin 变化而丢失登录态；浏览器 / 开发模式无该接口时回退到默认 localStorage。
const hasFileStorage =
  typeof window !== 'undefined' &&
  window.electronAPI &&
  typeof window.electronAPI.authStorage === 'function'

const fileStorage = hasFileStorage
  ? {
      getItem: async (key) => {
        try {
          return await window.electronAPI.authStorage('get', key)
        } catch {
          return null
        }
      },
      setItem: async (key, value) => {
        try {
          await window.electronAPI.authStorage('set', key, value)
        } catch {}
      },
      removeItem: async (key) => {
        try {
          await window.electronAPI.authStorage('remove', key)
        } catch {}
      }
    }
  : undefined

// 未配置时 supabase 为 null；上层服务需对 null 做降级处理
export const supabase = isSupabaseConfigured()
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        ...(fileStorage ? { storage: fileStorage, storageKey: 'zetith-auth-token' } : {})
      }
    })
  : null
