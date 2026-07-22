import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import { useApp } from '../context/AppContext'
import * as account from '../services/account'
import * as supabaseSync from '../services/supabaseSync'
import { getDatabase } from '../db/database'

const LS_LAST = 'zetith_last_sync'

function formatLastSync(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function getInitial(email) {
  const e = (email || '?').trim()
  return e ? e.charAt(0).toUpperCase() : '?'
}

const quickLinks = [
  { path: '/stats', label: '学习统计', icon: '📊' },
  { path: '/favorites', label: '收藏夹', icon: '⭐' },
  { path: '/history', label: '练习历史', icon: '🕐' },
  { path: '/wrongbook', label: '错题本', icon: '📕' },
  { path: '/categories', label: '题库管理', icon: '📚' },
  { path: '/review', label: '智能复习', icon: '🔄' },
]

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export default function ProfilePage() {
  const { addToast } = useToast()
  const { stats } = useApp()
  const navigate = useNavigate()
  const configured = account.isConfigured()

  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState(account.getCachedEmail())
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [status, setStatus] = useState('idle') // idle | syncing | synced | error
  const [statusDetail, setStatusDetail] = useState('')
  const [autoSync, setAutoSync] = useState(supabaseSync.isAutoSync())
  const [lastSync, setLastSync] = useState(localStorage.getItem(LS_LAST) || '')
  const [showGuide, setShowGuide] = useState(false)
  const [themeSource, setThemeSource] = useState(() => localStorage.getItem('themeSource') || 'system')
  const [overview, setOverview] = useState({ favorites: 0, today: 0, streak: 0 })

  // 初始化会话
  useEffect(() => {
    if (!configured) return
    account.getSession().then((s) => setUser(s?.user || null))
  }, [configured])

  // 同步状态订阅
  useEffect(() => {
    const off = supabaseSync.onStatus((s, detail) => {
      setStatus(s)
      setStatusDetail(detail || '')
    })
    return off
  }, [])

  // 学习概览：收藏数 / 今日练习 / 连续天数
  const computeOverview = useCallback(() => {
    try {
      const d = getDatabase()
      if (!d) return
      const fav = d.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values?.[0]?.[0] || 0
      const today = d.exec("SELECT COUNT(*) FROM study_records WHERE date(practiced_at)=date('now','localtime')")[0]?.values?.[0]?.[0] || 0
      const rows = d.exec('SELECT DISTINCT date(practiced_at) FROM study_records ORDER BY 1 DESC')
      const dates = new Set((rows[0]?.values || []).map((r) => r[0]))
      const fmt = (dt) => {
        const y = dt.getFullYear()
        const m = String(dt.getMonth() + 1).padStart(2, '0')
        const dd = String(dt.getDate()).padStart(2, '0')
        return `${y}-${m}-${dd}`
      }
      let streak = 0
      const cur = new Date()
      // 今天还没练也允许从昨天起算连续天数；最多回溯 400 天
      for (let i = 0; i < 400; i++) {
        const key = fmt(cur)
        if (dates.has(key)) {
          streak++
          cur.setDate(cur.getDate() - 1)
        } else if (i === 0) {
          cur.setDate(cur.getDate() - 1)
        } else {
          break
        }
      }
      setOverview({ favorites: fav, today, streak })
    } catch {
      /* 数据库未就绪时忽略 */
    }
  }, [])

  useEffect(() => {
    computeOverview()
  }, [stats, computeOverview])

  // 跟随 Layout 的主题变化
  useEffect(() => {
    const onTheme = (e) => setThemeSource(e.detail || 'system')
    window.addEventListener('app:theme-system', onTheme)
    return () => window.removeEventListener('app:theme-system', onTheme)
  }, [])

  const mapAuthError = (e) => {
    const code = e?.code || e?.name
    const msgText = e?.message || String(e)
    switch (code) {
      case 'weak_password':
        return '密码至少需要 6 位字符'
      case 'invalid_credentials':
        return '邮箱或密码错误'
      case 'email_not_confirmed':
        return '邮箱尚未验证，请查收验证邮件后重试'
      case 'user_already_registered':
        return '该邮箱已注册，请直接登录'
      case 'over_email_send_rate_limit':
      case 'rate_limit_exceeded':
        return '操作太频繁，请稍后再试'
      case 'email_address_invalid':
        return '邮箱格式无效或域名被限制，请更换邮箱'
      case 'validation_failed':
        return msgText.includes('password') ? '密码格式不符合要求' : '输入信息有误，请检查'
      default:
        return msgText || '操作失败，请检查网络后重试'
    }
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setFormError('请输入邮箱和密码')
      return
    }
    if (mode === 'register' && password.length < 6) {
      setFormError('密码至少需要 6 位字符')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      if (mode === 'register') {
        const { data } = await account.signUp(email.trim(), password)
        if (!data.session) {
          const isExisting = !!data.user?.confirmation_sent_at
          setFormError(isExisting
            ? '该邮箱已注册但尚未验证，验证邮件已重新发送，请查收后登录'
            : '注册成功，请查收验证邮件后登录')
          addToast(isExisting ? '验证邮件已重新发送' : '注册成功', 'success')
          setMode('login')
          setPassword('')
          return
        }
      } else {
        await account.signIn(email.trim(), password)
      }
      const s = await account.getSession()
      setUser(s?.user || null)
      addToast('登录成功', 'success')
      setPassword('')
      await doSync()
    } catch (e) {
      const detail = mapAuthError(e)
      setFormError(detail)
      addToast('操作失败：' + detail, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    await account.signOut()
    supabaseSync.stopAutoSync()
    setUser(null)
    setEmail('')
    setPassword('')
    addToast('已退出登录', 'info')
  }

  const doSync = useCallback(async () => {
    setBusy(true)
    try {
      await supabaseSync.syncNow()
      const now = new Date().toISOString()
      localStorage.setItem(LS_LAST, now)
      setLastSync(now)
      addToast('同步完成', 'success')
    } catch (e) {
      addToast('同步失败', 'error')
    } finally {
      setBusy(false)
    }
  }, [addToast])

  const toggleAuto = (e) => {
    const v = e.target.checked
    setAutoSync(v)
    supabaseSync.setAutoSync(v)
    if (v && user) {
      supabaseSync.startAutoSync()
      addToast('已开启自动同步', 'success')
    } else if (!v) {
      addToast('已关闭自动同步', 'info')
    }
  }

  const setTheme = (src) => {
    localStorage.setItem('themeSource', src)
    setThemeSource(src)
    window.dispatchEvent(new CustomEvent('app:theme-system', { detail: src }))
  }

  const openSupabase = () => {
    const url = 'https://supabase.com'
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyEnvTemplate = () => {
    const text = `VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`
    navigator.clipboard.writeText(text).then(() => addToast('已复制到剪贴板', 'success')).catch(() => {})
  }

  return (
    <div>
      <div className="page-header">
        <h1>个人中心</h1>
        <p>管理你的账号、学习进度同步与偏好设置</p>
      </div>

      {/* 账号信息头部 */}
      <div className="pc-header card">
        <div className="pc-avatar">{getInitial(user?.email || email)}</div>
        <div className="pc-header-info">
          {user ? (
            <>
              <div className="pc-name">{user.email}</div>
              <div className="pc-sub">
                <span className="pc-badge pc-badge-on">已登录</span>
                {status === 'offline' && <span className="pc-badge pc-badge-err">离线</span>}
                {status === 'syncing' && <span className="pc-badge pc-badge-sync">同步中…</span>}
                {status === 'error' && <span className="pc-badge pc-badge-err">同步异常</span>}
                {status === 'synced' && <span className="pc-badge pc-badge-ok">已同步</span>}
              </div>
            </>
          ) : configured ? (
            <>
              <div className="pc-name">未登录</div>
              <div className="pc-sub">登录后即可多设备同步学习进度</div>
            </>
          ) : (
            <>
              <div className="pc-name">同步尚未开启</div>
              <div className="pc-sub">开发者尚未配置同步后端</div>
            </>
          )}
        </div>
        {user && (
          <button className="btn btn-outline pc-logout" onClick={handleLogout}>退出登录</button>
        )}
      </div>

      {/* 未配置后端：开发者指引 */}
      {!configured && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>如何开启同步（开发者配置）</p>
          <button
            className="btn btn-outline"
            onClick={() => setShowGuide(!showGuide)}
            style={{ width: '100%', fontSize: '13px', marginBottom: '10px' }}
          >
            {showGuide ? '收起配置说明' : '查看配置步骤'}
          </button>
          {showGuide && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              <ol style={{ margin: 0, paddingLeft: '18px' }}>
                <li>访问 <button onClick={openSupabase} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>supabase.com</button> 注册/登录并新建项目。</li>
                <li>Project Settings → API，复制 <b>URL</b> 和 <b>anon public</b>。</li>
                <li>把 <code>.env.example</code> 复制为 <code>.env</code>，填入上述两个值。</li>
                <li>在 SQL Editor 执行 <code>supabase/schema.sql</code>（建表 + 权限，仅需一次）。</li>
                <li>重新打包 <code>npm run electron:build:dmg</code> 即可启用。</li>
              </ol>
              <button className="btn btn-outline" onClick={copyEnvTemplate} style={{ marginTop: '12px', width: '100%', fontSize: '12px' }}>
                复制 .env 模板
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pc-grid">
        {/* 账号 / 登录 */}
        <div className="card">
          <h3 className="pc-section-title">账号</h3>
          {configured && !user ? (
            <div>
              <label>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFormError('') }}
                placeholder="you@example.com"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <label style={{ marginTop: '10px' }}>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFormError('') }}
                placeholder="至少 6 位"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <button className="btn btn-primary" onClick={handleLogin} disabled={busy} style={{ marginTop: '14px', width: '100%' }}>
                {busy ? '处理中…' : mode === 'register' ? '注册并登录' : '登录'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFormError('') }}
                style={{ marginTop: '8px', width: '100%', fontSize: '12px' }}
              >
                {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
              </button>
              {formError && (
                <div className="pc-error">{formError}</div>
              )}
            </div>
          ) : user ? (
            <div className="pc-account-row">
              <div>
                <div className="pc-row-label">当前账号</div>
                <div className="pc-row-value">{user.email}</div>
              </div>
              <span className="pc-badge pc-badge-on">已登录</span>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>后端未配置，账号功能不可用。</p>
          )}
        </div>

        {/* 数据同步 */}
        <div className="card">
          <h3 className="pc-section-title">数据同步</h3>
          {!configured ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>请在开发者配置后端后使用同步。</p>
          ) : (
            <div>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px' }}>
                <input type="checkbox" checked={autoSync} onChange={toggleAuto} />
                自动同步（后台静默进行，无需手动操作）
              </label>
              <button className="btn btn-primary" onClick={doSync} disabled={busy} style={{ width: '100%' }}>
                {busy ? '同步中…' : '立即同步'}
              </button>
              {status === 'error' && statusDetail && (
                <p style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '8px' }}>错误：{statusDetail}</p>
              )}
              {lastSync && (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>上次同步：{formatLastSync(lastSync)}</p>
              )}
              <div className="pc-tips">
                · 同步的是<b>学习进度</b>（复习状态 / 笔记 / 收藏），不含题库本身。<br />
                · 请在各设备导入<b>相同题库文件</b>，题目 ID 一致才能对应。<br />
                · 多端同时改动时，以<b>最后修改时间</b>为准。<br />
                · 登录后自动同步<b>默认开启</b>，进度在后台静默上传 / 拉取，无需手动操作。
              </div>
            </div>
          )}
        </div>

        {/* 外观设置 */}
        <div className="card">
          <h3 className="pc-section-title">外观</h3>
          <div className="pc-theme-group">
            {themeOptions.map((t) => (
              <button
                key={t.value}
                className={`pc-theme-btn ${themeSource === t.value ? 'active' : ''}`}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="card">
          <h3 className="pc-section-title">快捷入口</h3>
          <div className="pc-quick-grid">
            {quickLinks.map((q) => (
              <button key={q.path} className="pc-quick-item" onClick={() => navigate(q.path)}>
                <span className="pc-quick-icon">{q.icon}</span>
                <span>{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 学习概览 */}
      <h3 className="pc-section-title" style={{ marginTop: '4px' }}>学习概览</h3>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total.toLocaleString()}</div>
          <div className="stat-label">总答题数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: stats.rate >= 60 ? 'var(--primary)' : 'var(--danger)' }}>
            {stats.rate}%
          </div>
          <div className="stat-label">总正确率</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.favorites}</div>
          <div className="stat-label">收藏题目</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.today}</div>
          <div className="stat-label">今日练习</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.streak}</div>
          <div className="stat-label">连续天数</div>
        </div>
      </div>
    </div>
  )
}
