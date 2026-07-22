// Electron 渲染进程 polyfill：部分依赖库会读取 process / global
if (typeof window !== 'undefined') {
  if (typeof window.process === 'undefined') window.process = { browser: true, env: {} }
  if (typeof window.global === 'undefined') window.global = window
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/app.css'
import { supabase } from './services/supabaseClient'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)

if ('serviceWorker' in navigator && !window.electronDB) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// Study reminder scheduler
function setupReminder() {
  try {
    let lastEmailDay = '' // 按天去重，避免同一分钟内多次触发重复发信
    const checkAndNotify = async () => {
      let prefs
      try {
        prefs = JSON.parse(localStorage.getItem('studyReminder') || '{}')
      } catch { prefs = {} }
      if (!prefs.enabled) return
      const now = new Date()
      const [h, m] = (prefs.time || '20:00').split(':').map(Number)
      if (!(now.getHours() === h && now.getMinutes() === m && now.getSeconds() < 10)) return

      // 浏览器通知
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('知题 · Zetith', {
          body: '📖 该学习了！打开知题刷几道题，保持学习节奏。',
          icon: '/icon-192.png',
          tag: 'study-reminder'
        })
      }

      // 邮件通知：需登录账号，调用 Supabase Edge Function（未配置时静默降级）
      if (prefs.email && supabase) {
        const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
        if (day !== lastEmailDay) {
          lastEmailDay = day
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email) {
              await supabase.functions.invoke('send-reminder', {
                body: { to: user.email, name: user.user_metadata?.nickname || '' }
              })
            }
          } catch {
            /* 邮件发送失败不影响浏览器通知 */
          }
        }
      }
    }

    setInterval(checkAndNotify, 10000)
    checkAndNotify()
  } catch {}
}

setupReminder()

// 仅禁用右键菜单与拖拽（防止内容被拖出），允许正常选中/复制文本，兼顾可访问性
function disableSelectionCopy() {
  const allowlisted = (target) => {
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable || target.closest?.('.allow-select')
  }

  const prevent = (e) => {
    if (allowlisted(e.target)) return
    e.preventDefault()
  }

  document.addEventListener('contextmenu', prevent, { capture: true })
  document.addEventListener('dragstart', prevent, { capture: true })
}

disableSelectionCopy()

// 捕获未处理异常，避免白屏后无日志
window.addEventListener('error', (e) => {
  console.error('[global error]', e.message, 'at', e.filename, e.lineno, e.colno, e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason)
})
