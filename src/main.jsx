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

if ('serviceWorker' in navigator) {
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
