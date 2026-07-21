import React, { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import SearchModal from './SearchModal'
import ShortcutPanel from './ShortcutPanel'
import ReminderSetup from './ReminderSetup'

const navItems = [
  { path: '/', label: '首页', key: '1', icon: <path d="M3 8L10 2L17 8V19H13V13H7V19H3V8Z" /> },
  { path: '/daily', label: '每日一练', key: '2', icon: <><rect x="3" y="4" width="14" height="15" rx="2" /><path d="M3 9H17" /><path d="M8 2V5" /><path d="M12 2V5" /></> },
  { path: '/categories', label: '题库管理', key: '3', icon: <><rect x="3" y="3" width="14" height="15" rx="2" /><path d="M7 3V18" /><path d="M3 8H7" /><path d="M3 13H7" /></> },
  { path: '/practice', label: '答题练习', key: '4', icon: <path d="M14 18H18M15 3L18 7L8 18H3V14L15 3Z" /> },
  { path: '/cards', label: '背题模式', key: '5', icon: <><rect x="3" y="3" width="14" height="15" rx="2" /><rect x="7" y="7" width="6" height="7" rx="1" /></> },
  { path: '/exam', label: '模拟考试', key: '6', icon: <><circle cx="10" cy="10" r="8" /><path d="M10 5V10L13 13" /></> },
  { path: '/review', label: '智能复习', key: '7', icon: <><path d="M3 10C3 5 7 2 12 2C17 2 20 6 20 10C20 15 16 18 12 18" /><path d="M3 10L7 6" /><path d="M3 10L7 14" /></> },
  { path: '/wrongbook', label: '错题本', key: '8', icon: <><path d="M10 2L2 20H18L10 2Z" /><path d="M10 9V13" /><circle cx="10" cy="16" r="1" /></> },
  { path: '/favorites', label: '收藏夹', key: '9', icon: <path d="M10 2L12.5 8.5L19 9L14 13.5L15.5 20L10 16.5L4.5 20L6 13.5L1 9L7.5 8.5L10 2Z" /> },
  { path: '/stats', label: '学习统计', key: '0', icon: <><path d="M3 19H19" /><rect x="4" y="10" width="3" height="9" rx="1" /><rect x="9" y="6" width="3" height="13" rx="1" /><rect x="14" y="12" width="3" height="7" rx="1" /></> },
  { path: '/history', label: '练习历史', key: 'h', icon: <><circle cx="10" cy="10" r="8" /><path d="M10 6V10L13 13" /><path d="M6 3H8" /><path d="M12 3H14" /></> },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { dbReady, initProgress, initPhase, initMessage, wrongCount } = useApp()
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')
  const [showSearch, setShowSearch] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  // Close mobile drawer on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMobileDrawerOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // macOS 桌面端：隐藏原生窗口标题栏后，标记 body 以便 CSS 适配红绿灯区域与拖拽
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronEnv?.platform === 'darwin') {
      document.body.classList.add('mac-electron')
    }
  }, [])

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileDrawerOpen])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

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
        if (num >= 0 && num <= 9) {
          e.preventDefault()
          const item = navItems.find(item => item.key === String(num))
          if (item) navigate(item.path)
        }
        if (e.key === 't' || e.key === 'T') { e.preventDefault(); setDarkMode(d => !d) }
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setShowSearch(true) }
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); navigate('/history') }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setShowReminder(true) }
      } else if (e.key === '?') {
        e.preventDefault()
        setShowShortcuts(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dbReady, navigate])

  const isActive = useCallback((path) => {
    if (location.pathname === path) return true
    if (path === '/categories' && location.pathname.startsWith('/study/')) return true
    return false
  }, [location.pathname])

  return (
    <div className={`app-layout ${collapsed ? 'layout-collapsed' : ''}`}>
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileDrawerOpen ? 'mobile-drawer-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark" style={{ boxShadow: '0 4px 0 var(--duo-green-shadow)' }}>知</div>
          <div className="brand-text-group">
            <div className="brand-text">知题</div>
            <div className="brand-sub">Zetith</div>
          </div>
          {dbReady && !collapsed && (
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
          {/* Mobile close button inside drawer */}
          <button
            onClick={() => setMobileDrawerOpen(false)}
            style={{
              marginLeft: 'auto', border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)', borderRadius: '8px',
              padding: '5px 10px', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', fontSize: '18px',
              display: 'none', lineHeight: 1,
            }}
            className="mobile-drawer-close"
            >
            ✕
          </button>
        </div>

        <div className="sidebar-section-label"><span className="sidebar-text">导航</span></div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => { if (dbReady) { navigate(item.path); setMobileDrawerOpen(false) } }}
              disabled={!dbReady}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-dot" style={{ background: isActive(item.path) ? 'var(--accent)' : 'transparent' }} />
              {collapsed && (
                <svg className="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: isActive(item.path) ? 'var(--duo-green)' : undefined }}>
                  {item.icon}
                </svg>
              )}
              <span className="sidebar-text">{item.label}</span>
              {item.path === '/wrongbook' && wrongCount > 0 && (
                <span className={`nav-badge ${collapsed ? 'nav-badge-collapsed' : ''}`}>{wrongCount}</span>
              )}
              <span className="nav-shortcut sidebar-text">⌘{item.key}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setShowReminder(true)} style={{ width: '100%' }} title={collapsed ? '学习提醒' : undefined}>
            <span className="nav-dot" />
            {collapsed && (
              <svg className="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 13V8C14 5.79 12.21 4 10 4C7.79 4 6 5.79 6 8V13L4 15H16L14 13Z" />
                <path d="M9 17H11" />
              </svg>
            )}
            <span className="sidebar-text">学习提醒</span>
            <span className="nav-shortcut sidebar-text">⌘R</span>
          </button>
          <button className="nav-item" onClick={() => setDarkMode(d => !d)} style={{ width: '100%' }} title={collapsed ? (darkMode ? '浅色模式' : '深色模式') : undefined}>
            <span className="nav-dot" style={{ background: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)' }} />
            {collapsed && (
              <svg className="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {darkMode ? (
                  <path d="M16 14.18A6 6 0 0 1 5.82 4 8 8 0 1 0 16 14.18z" />
                ) : (
                  <><circle cx="10" cy="10" r="4" /><path d="M10 2V3" /><path d="M10 17V18" /><path d="M3.5 3.5L4.5 4.5" /><path d="M15.5 15.5L16.5 16.5" /><path d="M2 10H3" /><path d="M17 10H18" /><path d="M3.5 16.5L4.5 15.5" /><path d="M15.5 4.5L16.5 3.5" /></>
                )}
              </svg>
            )}
            <span className="sidebar-text">{darkMode ? '深色模式' : '浅色模式'}</span>
            <span className="nav-shortcut sidebar-text">⌘T</span>
          </button>
        </div>
      </aside>

      <button
        className="sidebar-toggle"
        onClick={toggleCollapsed}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Mobile hamburger menu button */}
      {dbReady && (
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="打开菜单"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 5H17" />
            <path d="M3 10H17" />
            <path d="M3 15H17" />
          </svg>
        </button>
      )}

      {/* Mobile drawer overlay */}
      {mobileDrawerOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

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
                ~125 MB · 首次下载只需一次
              </div>
            )}
          </div>
        ) : (
          <div className="page-enter">{children}</div>
        )}
      </main>

      {/* 移动端底部导航栏 */}
      {dbReady && <MobileNav location={location.pathname} navigate={navigate} wrongCount={wrongCount} onSearch={() => setShowSearch(true)} />}

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showShortcuts && <ShortcutPanel onClose={() => setShowShortcuts(false)} />}
      {showReminder && <ReminderSetup onClose={() => setShowReminder(false)} />}
    </div>
  )
}

const mobileNavItems = [
  { path: '/', label: '首页', icon: 'home' },
  { path: null, label: '学习', icon: 'learn', isMenu: true },
  { path: '/review', label: '复习', icon: 'review' },
  { path: '/wrongbook', label: '错题', icon: 'wrong' },
  { path: null, label: '我的', icon: 'me', isMenu: true },
]

const learnMenuItems = [
  { path: '/practice', label: '答题练习', desc: '选题练习，即时反馈', color: '#58CC02', icon: '✏️' },
  { path: '/cards', label: '背题模式', desc: '卡片翻转，查看答案', color: '#1CB0F6', icon: '🃏' },
  { path: '/exam', label: '模拟考试', desc: '限时考试，真实模拟', color: '#FF9600', icon: '📝' },
  { path: '/daily', label: '每日一练', desc: '智能混合推荐', color: '#CE82FF', icon: '📅' },
  { path: '/categories', label: '浏览学习', desc: '按题库逐题浏览', color: '#FFC800', icon: '📖' },
]

const meMenuItems = [
  { path: '/stats', label: '学习统计', desc: '数据分析和弱项诊断', icon: '📊' },
  { path: '/favorites', label: '收藏夹', desc: '收藏的题目', icon: '⭐' },
  { path: '/history', label: '练习历史', desc: '查看所有练习记录', icon: '🕐' },
  { path: '/categories', label: '题库管理', desc: '导入导出和管理题库', icon: '📚' },
]

function MobileNav({ location, navigate, wrongCount, onSearch }) {
  const [activeSheet, setActiveSheet] = useState(null) // 'learn' | 'me' | null
  const sheetRef = useRef(null)

  // Close sheet on route change
  useEffect(() => { setActiveSheet(null) }, [location])

  // Close sheet on overlay click
  const closeSheet = () => setActiveSheet(null)

  const handleTabClick = (item) => {
    if (item.isMenu) {
      setActiveSheet(prev => prev === item.icon ? null : item.icon)
    } else {
      navigate(item.path)
    }
  }

  const handleSheetItem = (path) => {
    setActiveSheet(null)
    navigate(path)
  }

  const isTabActive = (item) => {
    if (item.path === '/') return location === '/'
    if (item.icon === 'learn') {
      return ['/practice', '/cards', '/exam', '/daily'].includes(location) ||
             location.startsWith('/study/')
    }
    if (item.icon === 'me') {
      return ['/stats', '/favorites', '/history', '/categories'].includes(location)
    }
    return location === item.path
  }

  const sheetItems = activeSheet === 'learn' ? learnMenuItems : activeSheet === 'me' ? meMenuItems : []

  return (
    <>
      {/* Bottom Sheet */}
      {activeSheet && (
        <>
          <div className="mobile-sheet-overlay" onClick={closeSheet} />
          <div className="mobile-sheet" ref={sheetRef}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <h3>{activeSheet === 'learn' ? '学习模式' : '我的'}</h3>
              <button className="mobile-sheet-close" onClick={closeSheet}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 5L15 15M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="mobile-sheet-body">
              {sheetItems.map((item, idx) => (
                <button
                  key={item.path}
                  className="mobile-sheet-item"
                  onClick={() => handleSheetItem(item.path)}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <span className="mobile-sheet-item-icon" style={{ background: item.color || 'var(--duo-green)' }}>
                    {item.icon}
                  </span>
                  <div className="mobile-sheet-item-text">
                    <span className="mobile-sheet-item-label">{item.label}</span>
                    {item.desc && <span className="mobile-sheet-item-desc">{item.desc}</span>}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 3L11 8L6 13" />
                  </svg>
                </button>
              ))}
              {activeSheet === 'learn' && (
                <button className="mobile-sheet-item" onClick={() => { setActiveSheet(null); onSearch() }}>
                  <span className="mobile-sheet-item-icon" style={{ background: '#777' }}>🔍</span>
                  <div className="mobile-sheet-item-text">
                    <span className="mobile-sheet-item-label">搜索题目</span>
                    <span className="mobile-sheet-item-desc">全局搜索题库</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 3L11 8L6 13" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Bottom Tab Bar */}
      <nav className="mobile-nav">
        {mobileNavItems.map((item, idx) => {
          const active = isTabActive(item)
          // Render center FAB for practice quick action
          if (idx === 2) {
            return (
              <React.Fragment key="center-group">
                <button
                  key={item.path || item.icon}
                  className={`mobile-nav-item ${active ? 'active' : ''}`}
                  onClick={() => handleTabClick(item)}
                >
                  <MobileNavIcon name={item.icon} active={active} />
                  <span className="mobile-nav-label">{item.label}</span>
                  {item.path === '/wrongbook' && wrongCount > 0 && (
                    <span className="mobile-nav-badge">{wrongCount}</span>
                  )}
                </button>

                {/* Center FAB */}
                <button
                  className="mobile-fab"
                  onClick={() => navigate('/practice')}
                  aria-label="开始练习"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 18H18M15 3L18 7L8 18H3V14L15 3Z" />
                  </svg>
                </button>

                <button
                  key={item.path || `${item.icon}-2`}
                  className={`mobile-nav-item ${active ? 'active' : ''}`}
                  onClick={() => handleTabClick(mobileNavItems[3])}
                >
                  <MobileNavIcon name={mobileNavItems[3].icon} active={isTabActive(mobileNavItems[3])} />
                  <span className="mobile-nav-label">{mobileNavItems[3].label}</span>
                  {wrongCount > 0 && (
                    <span className="mobile-nav-badge">{wrongCount}</span>
                  )}
                </button>
              </React.Fragment>
            )
          }
          // Skip items that were rendered in the center group
          if (idx === 3) return null
          return (
            <button
              key={item.path || item.icon}
              className={`mobile-nav-item ${active ? 'active' : ''}`}
              onClick={() => handleTabClick(item)}
            >
              <MobileNavIcon name={item.icon} active={active} />
              <span className="mobile-nav-label">{item.label}</span>
              {item.path === '/wrongbook' && wrongCount > 0 && (
                <span className="mobile-nav-badge">{wrongCount}</span>
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}

const MobileNavIcon = memo(function MobileNavIcon({ name, active }) {
  const color = active ? 'var(--duo-green)' : 'var(--text-muted)'
  const props = { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }

  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
          {active && <path d="M9 21V12h6v9" fill={color} stroke="none" />}
        </svg>
      )
    case 'learn':
      return (
        <svg {...props}>
          <rect x="3" y="2" width="18" height="20" rx="2" />
          <path d="M12 7v4" /><circle cx="12" cy="14" r="0.5" fill={color} stroke="none" />
          <path d="M3 4h18" opacity="0.3" />
        </svg>
      )
    case 'review':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 019-9 9 9 0 110 18" />
          <path d="M3 12l3-3M3 12l3 3" />
          <path d="M12 8v4l3 3" />
        </svg>
      )
    case 'wrong':
      return (
        <svg {...props}>
          <path d="M12 3L3 21h18L12 3z" />
          <path d="M12 11v4" /><circle cx="12" cy="17" r="0.5" fill={color} stroke="none" />
        </svg>
      )
    case 'me':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      )
    default:
      return null
  }
})
