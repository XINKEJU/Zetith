import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from './ToastProvider'
import * as githubSync from '../services/githubSync'
import { exportUserData, importUserData } from '../services/syncService'

const LS_AUTO = 'zetith_auto_sync'
const LS_LAST = 'zetith_last_sync'

export default function SyncSetup({ onClose }) {
  const { addToast } = useToast()
  const [token, setToken] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [autoSync, setAutoSync] = useState(localStorage.getItem(LS_AUTO) === 'true')
  const [lastSync, setLastSync] = useState(localStorage.getItem(LS_LAST) || '')

  useEffect(() => {
    const t = githubSync.getToken()
    if (t) {
      setLoggedIn(true)
      setUsername(githubSync.getUsername())
      githubSync.fetchUser().then(u => u && setUsername(u)).catch(() => {})
    }
  }, [])

  const handleLogin = useCallback(() => {
    if (!token.trim()) { addToast('请输入 GitHub Token', 'warning'); return }
    githubSync.setToken(token)
    setLoggedIn(true)
    githubSync.fetchUser().then(u => { if (u) setUsername(u) }).catch(() => {})
    addToast('已保存 Token', 'success')
  }, [token, addToast])

  const handleLogout = useCallback(() => {
    githubSync.setToken('')
    githubSync.clearSession()
    setLoggedIn(false)
    setUsername('')
    setToken('')
    setMsg('')
    addToast('已退出登录', 'info')
  }, [addToast])

  const handleSync = useCallback(async () => {
    if (!githubSync.isLoggedIn()) { addToast('请先填入 GitHub Token', 'warning'); return }
    setBusy(true); setMsg('正在同步…')
    try {
      const local = exportUserData()
      const remote = await githubSync.pullData()
      let merged = 0
      if (remote) {
        const r = await importUserData(remote)
        merged = r.imported
      }
      await githubSync.pushData(exportUserData())
      const now = new Date().toISOString()
      localStorage.setItem(LS_LAST, now)
      setLastSync(now)
      setMsg(remote ? `已合并远端 ${merged} 条记录并上传 ✓` : '已上传本地数据 ✓')
      addToast('同步完成', 'success')
    } catch (e) {
      setMsg('同步失败：' + (e.message || e))
      addToast('同步失败', 'error')
    } finally {
      setBusy(false)
    }
  }, [addToast])

  // 登录后首次打开自动同步一次（若开启）
  const didAuto = React.useRef(false)
  useEffect(() => {
    if (autoSync && loggedIn && !didAuto.current && !busy) {
      didAuto.current = true
      handleSync()
    }
  }, [autoSync, loggedIn, busy, handleSync])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <h2 style={{ marginBottom: '6px' }}>数据同步</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
          通过你的 GitHub 私有 Gist 同步学习进度，零服务器、零费用。
        </p>

        {!loggedIn ? (
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
              在 GitHub → Settings → Developer settings → Personal access tokens 生成一个，只需勾选 <b>gist</b> 作用域。
              Token 仅保存在本机，不上传第三方。
            </p>
            <button className="btn btn-primary" onClick={handleLogin} style={{ marginTop: '8px' }}>保存并登录</button>
          </div>
        ) : (
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--duo-green)', display: 'inline-block' }} />
              <span style={{ fontWeight: 600 }}>已登录{username ? `：${username}` : ''}</span>
              <button className="btn btn-outline" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '12px' }} onClick={handleLogout}>退出</button>
            </div>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <input type="checkbox" checked={autoSync} onChange={e => { setAutoSync(e.target.checked); localStorage.setItem(LS_AUTO, String(e.target.checked)) }} />
              打开应用时自动同步
            </label>
            <button className="btn btn-primary" onClick={handleSync} disabled={busy} style={{ width: '100%' }}>
              {busy ? '同步中…' : '立即同步'}
            </button>
            {msg && <p style={{ fontSize: '12px', color: busy ? 'var(--text-muted)' : 'var(--duo-green)', marginTop: '8px' }}>{msg}</p>}
            {lastSync && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>上次同步：{new Date(lastSync).toLocaleString()}</p>}
          </div>
        )}

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
