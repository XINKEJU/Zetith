import React from 'react'

const shortcuts = [
  { keys: ['⌘', '1-9,0'], desc: '页面导航' },
  { keys: ['⌘', 'K'], desc: '搜索题目' },
  { keys: ['⌘', 'T'], desc: '切换深色/浅色模式' },
  { keys: ['⌘', 'H'], desc: '练习历史' },
  { keys: ['?'], desc: '显示快捷键面板' },
  { keys: ['←', '→'], desc: '上一题 / 下一题' },
  { keys: ['Space'], desc: '显示 / 隐藏答案' },
]

const pages = [
  { key: '⌘1', desc: '首页' },
  { key: '⌘2', desc: '每日一练' },
  { key: '⌘3', desc: '题库管理' },
  { key: '⌘4', desc: '答题练习' },
  { key: '⌘5', desc: '背题模式' },
  { key: '⌘6', desc: '模拟考试' },
  { key: '⌘7', desc: '智能复习' },
  { key: '⌘8', desc: '错题本' },
  { key: '⌘9', desc: '收藏夹' },
  { key: '⌘0', desc: '学习统计' },
]

export default function ShortcutPanel({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <h2 style={{ marginBottom: '20px' }}>键盘快捷键</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>页面导航</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pages.map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                <Kbd>{s.key}</Kbd>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>操作</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {shortcuts.map(s => (
              <div key={s.desc} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                <span style={{ display: 'flex', gap: '4px' }}>
                  {s.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '24px', height: '22px', padding: '0 6px',
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: '5px', fontSize: '11px', fontFamily: '"SF Mono", "Fira Code", monospace',
      color: 'var(--text-secondary)'
    }}>
      {children}
    </span>
  )
}
