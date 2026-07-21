import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import SearchModal from './SearchModal'
import ShortcutPanel from './ShortcutPanel'
import ReminderSetup from './ReminderSetup'

const navItems = [
  { path: '/', label: '首页', key: '1' },
  { path: '/categories', label: '题库管理', key: '2' },
  { path: '/practice', label: '答题练习', key: '3' },
  { path: '/cards', label: '背题模式', key: '9' },
  { path: '/exam', label: '模拟考试', key: '4' },
  { path: '/review', label: '智能复习', key: '5' },
  { path: '/wrongbook', label: '错题本', key: '6' },
  { path: '/favorites', label: '收藏夹', key: '8' },
  { path: '/stats', label: '学习统计', key: '7' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { dbReady, initProgress, initPhase, initMessage, wrongCount } = useApp()
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [showSearch, setShowSearch] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showReminder, setShowReminder] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!dbReady) return
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '?') {
          e.preventDefault()
          setShowShortcuts(true)
          return
        }
        const num = parseInt(e.key)
        if (num >= 1 && num <= 7) { e.preventDefault(); navigate(navItems[num - 1].path) }
        if (e.key === 't' || e.key === 'T') { e.preventDefault(); setDarkMode(d => !d) }
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setShowSearch(true) }
      } else if (e.key === '?') {
        e.preventDefault()
        setShowShortcuts(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dbReady, navigate])

  const isActive = (path) => {
    if (location.pathname === path) return true
    if (path === '/categories' && location.pathname.startsWith('/study/')) return true
    return false
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">知</div>
          <div>
            <div className="brand-text">知题</div>
            <div className="brand-sub">Zetith</div>
          </div>
          {dbReady && (
            <button onClick={() => setShowSearch(true)} style={{
              marginLeft: 'auto', border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.06)', borderRadius: '8px',
              padding: '5px 10px', fontSize: '11px', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', display: 'flex', gap: '4px',
              alignItems: 'center', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >
              <span style={{ fontSize: '12px' }}>⌘K</span>
            </button>
          )}
        </div>

        <div className="sidebar-section-label">导航</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => dbReady && navigate(item.path)}
              disabled={!dbReady}
            >
              <span className="nav-dot" style={{ background: isActive(item.path) ? 'var(--accent)' : 'transparent' }} />
              <span>{item.label}</span>
              {item.path === '/wrongbook' && wrongCount > 0 && (
                <span className="nav-badge">{wrongCount}</span>
              )}
              {item.path !== '/wrongbook' && (
                <span className="nav-shortcut">⌘{item.key}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setShowReminder(true)} style={{ width: '100%' }}>
            <span className="nav-dot" />
            <span>学习提醒</span>
          </button>
          <button className="nav-item" onClick={() => setDarkMode(d => !d)} style={{ width: '100%' }}>
            <span className="nav-dot" style={{ background: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)' }} />
            <span>{darkMode ? '浅色模式' : '深色模式'}</span>
            <span className="nav-shortcut">⌘T</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {!dbReady ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: 700 }}>知</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
              {initPhase === 'wasm' ? '正在启动引擎...' : '正在下载题库数据'}
            </div>
            <div style={{ fontSize: '13px', marginBottom: '24px', color: 'var(--text-secondary)' }}>{initMessage}</div>
            {initPhase === 'download' && (
              <div style={{ width: '300px' }}>
                <div style={{ width: '100%', height: '5px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: `${initProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-dark))', borderRadius: '10px', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{initProgress}%</div>
              </div>
            )}
            {initPhase === 'wasm' && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                ~125 MB · one-time initial download
              </div>
            )}
          </div>
        ) : (
          <div className="page-enter">{children}</div>
        )}
      </main>
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showShortcuts && <ShortcutPanel onClose={() => setShowShortcuts(false)} />}
      {showReminder && <ReminderSetup onClose={() => setShowReminder(false)} />}
    </div>
  )
}
