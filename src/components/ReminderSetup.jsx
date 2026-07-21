import React, { useState, useEffect, useCallback } from 'react'
import { getReminderPrefs, saveReminderPrefs } from '../db/database'
import { useToast } from './ToastProvider'

export default function ReminderSetup({ onClose }) {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('20:00')
  const { addToast } = useToast()

  useEffect(() => {
    const prefs = getReminderPrefs()
    setEnabled(prefs.enabled)
    setTime(prefs.time || '20:00')
  }, [])

  const handleSave = useCallback(() => {
    saveReminderPrefs({ enabled, time })
    
    if (enabled) {
      if ('Notification' in window) {
        Notification.requestPermission().then(() => {
          addToast('学习提醒已开启', 'success')
        })
      }
    } else {
      addToast('学习提醒已关闭', 'info')
    }
    onClose?.()
  }, [enabled, time])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <h2 style={{ marginBottom: '20px' }}>学习提醒</h2>
        
        <div className="form-group">
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            开启每日学习提醒
          </label>
        </div>

        {enabled && (
          <div className="form-group">
            <label>提醒时间</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              每日定时推送学习提醒，需要浏览器通知权限
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className="btn btn-outline" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  )
}
