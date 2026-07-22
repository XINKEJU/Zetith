import React, { useState, useEffect } from 'react'
import * as account from '../services/account'
import { mapAuthError } from '../services/authErrors'
import { useToast } from './ToastProvider'

// 全局「强制登录」弹窗：任意写操作在未登录时触发 window 事件后弹出，
// 覆盖在当前页面之上，登录/注册成功即关闭，不打断浏览上下文。
export default function AuthModal() {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { addToast } = useToast()

  useEffect(() => {
    const handler = (e) => {
      setReason(e.detail?.reason || '此操作')
      setMode('login')
      setError('')
      setOpen(true)
    }
    window.addEventListener('zetith:require-login', handler)
    return () => window.removeEventListener('zetith:require-login', handler)
  }, [])

  const close = () => {
    setOpen(false)
    setPassword('')
  }

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码')
      return
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少需要 6 位字符')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') {
        const { data } = await account.signUp(email.trim(), password)
        if (!data.session) {
          setError('注册成功，请查收验证邮件后登录')
          setMode('login')
          setPassword('')
          setBusy(false)
          return
        }
      } else {
        await account.signIn(email.trim(), password)
      }
      addToast('登录成功', 'success')
      close()
    } catch (e) {
      const d = mapAuthError(e)
      setError(d)
      addToast('操作失败：' + d, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const inputStyle = {
    width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div className="modal-overlay" onClick={close} style={{ alignItems: 'center', paddingTop: 0, zIndex: 2000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '17px' }}>需要登录</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          「{reason}」需要登录后才能进行。登录后即可在多端同步学习进度。
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: 14 }}>
          <button
            className={'btn ' + (mode === 'login' ? 'btn-primary' : 'btn-outline')}
            style={{ flex: 1 }}
            onClick={() => { setMode('login'); setError('') }}
          >登录</button>
          <button
            className={'btn ' + (mode === 'register' ? 'btn-primary' : 'btn-outline')}
            style={{ flex: 1 }}
            onClick={() => { setMode('register'); setError('') }}
          >注册</button>
        </div>

        <input
          type="email" placeholder="邮箱" value={email}
          onChange={e => setEmail(e.target.value)} style={inputStyle} autoFocus
        />
        <input
          type="password" placeholder="密码（至少 6 位）" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          style={{ ...inputStyle, marginTop: 10 }}
        />

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <button
          className="btn btn-primary" disabled={busy}
          style={{ width: '100%', marginTop: 16, padding: '10px', fontSize: 14 }}
          onClick={submit}
        >
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        <button
          className="btn btn-outline" style={{ width: '100%', marginTop: 8, padding: '8px', fontSize: 13 }}
          onClick={close}
        >取消</button>
      </div>
    </div>
  )
}
