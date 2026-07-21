import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const timersRef = useRef([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const addToast = useCallback((message, type = 'info', duration = 2500) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
        timersRef.current = timersRef.current.filter(t => t !== timer)
      }, duration)
      timersRef.current.push(timer)
    }
  }, [])

  const confirm = useCallback((message, title = '确认操作') => {
    return new Promise((resolve) => {
      setConfirmState({ message, title, resolve })
    })
  }, [])

  const dismissConfirm = useCallback((result) => {
    if (confirmState) {
      confirmState.resolve(result)
      setConfirmState(null)
    }
  }, [confirmState])

  return (
    <ToastContext.Provider value={{ addToast, confirm }}>
      {children}
      
      {/* Toast container */}
      <div style={{
        position: 'fixed', top: '20px', right: '20px',
        zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none'
      }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            padding: '12px 20px', borderRadius: '10px',
            fontSize: '14px', fontWeight: 500,
            pointerEvents: 'auto',
            background: toast.type === 'success' ? 'var(--success)' :
                       toast.type === 'error' ? 'var(--danger)' :
                       toast.type === 'warning' ? 'var(--warning)' : 'var(--text)',
            color: '#fff',
            boxShadow: 'var(--shadow-md)',
            animation: 'toastIn 0.3s ease',
            maxWidth: '360px'
          }}>
            {toast.type === 'success' && '✅ '}
            {toast.type === 'error' && '❌ '}
            {toast.type === 'warning' && '⚠️ '}
            {toast.type === 'info' && '💡 '}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="modal-overlay" onClick={() => dismissConfirm(false)}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>{confirmState.title}</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => dismissConfirm(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => dismissConfirm(true)}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
