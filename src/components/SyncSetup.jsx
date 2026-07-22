import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from './ToastProvider'
import * as githubSync from '../services/githubSync'
import * as webdavSync from '../services/webdavSync'
import { syncNow } from '../services/syncService'

const LS_AUTO = 'zetith_auto_sync'
const LS_LAST = 'zetith_last_sync'
const LS_BACKEND = 'zetith_sync_backend'

export default function SyncSetup({ onClose }) {
  const { addToast } = useToast()
  const [backend, setBackend] = useState(localStorage.getItem(LS_BACKEND) || 'github')

  // GitHub
  const [token, setToken] = useState('')
  const [ghLoggedIn, setGhLoggedIn] = useState(false)
  const [ghUser, setGhUser] = useState('')

  // 坚果云
  const [jyServer, setJyServer] = useState('')
  const [jyUser, setJyUser] = useState('')
  const [jyPass, setJyPass] = useState('')
  const [jyConfigured, setJyConfigured] = useState(false)
  const [jyName, setJyName] = useState('')

  // 通用
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [autoSync, setAutoSync] = useState(localStorage.getItem(LS_AUTO) === 'true')
  const [lastSync, setLastSync] = useState(localStorage.getItem(LS_LAST) || '')

  useEffect(() => {
    const t = githubSync.getToken()
    if (t) {
      setGhLoggedIn(true)
      setGhUser(githubSync.getUsername())
      githubSync.fetchUser().then(u => u && setGhUser(u)).catch(() => {})
    }
    const c = webdavSync.getConfig()
    setJyServer(c.server)
    setJyUser(c.username)
    setJyPass(c.appPassword)
    setJyConfigured(webdavSync.isConfigured())
    setJyName(c.username)
  }, [])

  const switchBackend = (b) => { setBackend(b); localStorage.setItem(LS_BACKEND, b); setMsg('') }

  const handleGhLogin = () => {
    if (!token.trim()) { addToast('请输入 GitHub Token', 'warning'); return }
    githubSync.setToken(token)
    setGhLoggedIn(true)
    githubSync.fetchUser().then(u => { if (u) setGhUser(u) }).catch(() => {})
    addToast('已保存 Token', 'success')
  }
  const handleGhLogout = () => {
    githubSync.setToken('')
    githubSync.clearSession()
    setGhLoggedIn(false); setGhUser(''); setToken(''); setMsg('')
    addToast('已退出登录', 'info')
  }

  const handleJySave = () => {
    webdavSync.setConfig({ server: jyServer, username: jyUser, appPassword: jyPass })
    const ok = webdavSync.isConfigured()
    setJyConfigured(ok)
    if (ok) { setJyName(jyUser); addToast('已保存坚果云配置', 'success') }
    else addToast('请填写账号与应用密码', 'warning')
  }
  const handleJyLogout = () => {
    webdavSync.clearConfig()
    setJyConfigured(false); setJyUser(''); setJyPass(''); setJyName(''); setMsg('')
    addToast('已退出配置', 'info')
  }

  const handleSync = useCallback(async () => {
    let pushFn, pullFn, label
    if (backend === 'github') {
      if (!githubSync.isLoggedIn()) { addToast('请先保存 GitHub Token', 'warning'); return }
      pushFn = githubSync.pushData; pullFn = githubSync.pullData; label = 'GitHub'
    } else {
      if (!webdavSync.isSupported()) { addToast('坚果云仅桌面端可用', 'warning'); return }
      if (!webdavSync.isConfigured()) { addToast('请先配置坚果云', 'warning'); return }
      pushFn = webdavSync.pushData; pullFn = webdavSync.pullData; label = '坚果云'
    }
    setBusy(true); setMsg('正在同步…')
    try {
      await syncNow(pushFn, pullFn)
      const now = new Date().toISOString()
      localStorage.setItem(LS_LAST, now)
      setLastSync(now)
      setMsg(`已通过${label}同步 ✓`)
      addToast('同步完成', 'success')
    } catch (e) {
      setMsg('同步失败：' + (e.message || e))
      addToast('同步失败', 'error')
    } finally {
      setBusy(false)
    }
  }, [backend, addToast])

  // 登录/配置后首次自动同步一次（若开启）
  const didAuto = React.useRef(false)
  useEffect(() => {
    if (autoSync && !didAuto.current && !busy) {
      const ready = (backend === 'github' && ghLoggedIn) ||
        (backend === 'webdav' && jyConfigured && webdavSync.isSupported())
      if (ready) { didAuto.current = true; handleSync() }
    }
  }, [autoSync, backend, ghLoggedIn, jyConfigured, busy, handleSync])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <h2 style={{ marginBottom: '6px' }}>数据同步</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          零服务器、零费用地同步学习进度（复习状态 / 笔记 / 收藏）。
        </p>

        {/* 后端切换 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[{ k: 'github', t: 'GitHub 私有仓库' }, { k: 'webdav', t: '坚果云 WebDAV' }].map(o => (
            <button key={o.k} className={`btn ${backend === o.k ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1 }} onClick={() => switchBackend(o.k)}>
              {o.t}
            </button>
          ))}
        </div>

        {backend === 'github' ? (
          !ghLoggedIn ? (
            <div className="form-group">
              <label>GitHub Personal Access Token</label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_xxx 或 github_pat_xxx"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                在 GitHub → Settings → Developer settings → Personal access tokens 生成一个，只需勾选 <b>gist</b> 作用域。Token 仅保存在本机，不上传第三方。
              </p>
              <button className="btn btn-primary" onClick={handleGhLogin} style={{ marginTop: '8px' }}>保存并登录</button>
            </div>
          ) : (
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--duo-green)', display: 'inline-block' }} />
                <span style={{ fontWeight: 600 }}>已登录{ghUser ? `：${ghUser}` : ''}</span>
                <button className="btn btn-outline" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '12px' }} onClick={handleGhLogout}>退出</button>
              </div>
            </div>
          )
        ) : (
          !jyConfigured ? (
            <div className="form-group">
              <label>坚果云服务器地址</label>
              <input
                value={jyServer}
                onChange={e => setJyServer(e.target.value)}
                placeholder="https://dav.jianguoyun.com/dav"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <label style={{ marginTop: '10px' }}>坚果云账号（邮箱）</label>
              <input
                value={jyUser}
                onChange={e => setJyUser(e.target.value)}
                placeholder="you@example.com"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <label style={{ marginTop: '10px' }}>应用密码</label>
              <input
                type="password"
                value={jyPass}
                onChange={e => setJyPass(e.target.value)}
                placeholder="坚果云安全设置中生成"
                className="allow-select"
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                应用密码 ≠ 登录密码。在坚果云网页端「设置 → 安全选项 → 添加应用」生成（勾选「读写」权限）。
              </p>
              <button className="btn btn-primary" onClick={handleJySave} style={{ marginTop: '8px' }}>保存配置</button>
              {!webdavSync.isSupported() && (
                <p style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '8px' }}>
                  ⚠️ 坚果云 WebDAV 仅支持桌面端（Mac 版），当前环境（手机网页）不可用。
                </p>
              )}
            </div>
          ) : (
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--duo-green)', display: 'inline-block' }} />
                <span style={{ fontWeight: 600 }}>已配置：{jyName}</span>
                <button className="btn btn-outline" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '12px' }} onClick={handleJyLogout}>退出</button>
              </div>
            </div>
          )
        )}

        {/* 公共同步区 */}
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0 10px' }}>
          <input type="checkbox" checked={autoSync} onChange={e => { setAutoSync(e.target.checked); localStorage.setItem(LS_AUTO, String(e.target.checked)) }} />
          打开应用时自动同步
        </label>
        <button className="btn btn-primary" onClick={handleSync} disabled={busy} style={{ width: '100%' }}>
          {busy ? '同步中…' : '立即同步'}
        </button>
        {msg && <p style={{ fontSize: '12px', color: busy ? 'var(--text-muted)' : 'var(--duo-green)', marginTop: '8px' }}>{msg}</p>}
        {lastSync && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>上次同步：{new Date(lastSync).toLocaleString()}</p>}

        <div style={{ background: 'var(--border-light)', borderRadius: '10px', padding: '12px', marginTop: '14px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
            <b>使用提示</b><br />
            · 同步的是<b>学习进度</b>（复习状态 / 笔记 / 收藏），不含题库本身。<br />
            · 请在各设备导入<b>相同的题库文件</b>，题目 ID 一致才能正确对应。<br />
            · 冲突以「最后修改时间」为准；多端同时改动时，较新的一边生效。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className="btn btn-outline" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
