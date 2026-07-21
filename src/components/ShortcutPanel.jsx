import React from 'react'

const shortcuts = [
  { keys: ['⌘', '1-7'], desc: 'Navigate pages' },
  { keys: ['⌘', 'K'], desc: 'Search questions' },
  { keys: ['⌘', 'T'], desc: 'Toggle dark mode' },
  { keys: ['?'], desc: 'Show shortcuts' },
  { keys: ['←', '→'], desc: 'Previous / Next question' },
  { keys: ['Space'], desc: 'Show / Hide answer' },
]

const pages = [
  { key: '⌘1', desc: 'Home' },
  { key: '⌘2', desc: 'Question Banks' },
  { key: '⌘3', desc: 'Practice' },
  { key: '⌘4', desc: 'Mock Exam' },
  { key: '⌘5', desc: 'Smart Review' },
  { key: '⌘6', desc: 'Wrong Book' },
  { key: '⌘7', desc: 'Statistics' },
]

export default function ShortcutPanel({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <h2 style={{ marginBottom: '20px' }}>Keyboard Shortcuts</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Navigation</div>
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
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Actions</div>
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
