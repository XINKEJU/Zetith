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
    const prefs = JSON.parse(localStorage.getItem('studyReminder') || '{"enabled":false,"time":"20:00"}')
    if (!prefs.enabled || !('Notification' in window)) return

    const checkAndNotify = () => {
      const now = new Date()
      const [h, m] = prefs.time.split(':').map(Number)
      if (now.getHours() === h && now.getMinutes() === m && now.getSeconds() < 10) {
        if (Notification.permission === 'granted') {
          new Notification('知题 · Zetith', {
            body: '📖 该学习了！打开知题刷几道题，保持学习节奏。',
            icon: '/icon-192.png',
            tag: 'study-reminder'
          })
        }
      }
    }

    setInterval(checkAndNotify, 10000)
    checkAndNotify()
  } catch {}
}

setupReminder()

// Disable text selection, drag and context menu outside editable fields
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
  document.addEventListener('selectstart', prevent, { capture: true })
  document.addEventListener('dragstart', prevent, { capture: true })
  document.addEventListener('copy', prevent, { capture: true })
  document.addEventListener('cut', prevent, { capture: true })
}

disableSelectionCopy()

// 捕获未处理异常，避免白屏后无日志
window.addEventListener('error', (e) => {
  console.error('[global error]', e.message, 'at', e.filename, e.lineno, e.colno, e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason)
})
