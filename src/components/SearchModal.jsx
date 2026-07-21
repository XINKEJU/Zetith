import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchQuestions } from '../db/database'

export default function SearchModal({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      try {
        const r = searchQuestions(query)
        setResults(r)
      } catch { setResults([]) }
      setSearching(false)
    }, 200)
    return () => { clearTimeout(timer); setSearching(false) }
  }, [query])

  const handleSelect = (q) => {
    onClose()
    navigate(`/study/${q.category_id}`)
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索题目关键词..."
            aria-label="搜索题目"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: '16px', background: 'transparent',
              color: 'var(--text)', padding: '4px 0'
            }}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={onClose} aria-label="关闭搜索">
            Esc
          </button>
        </div>

        {query.trim() && (
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-light)', fontSize: '14px' }}>
                没有找到相关题目
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: '8px' }}>
                  找到 {results.length} 条结果
                </div>
                {results.map(q => (
                  <div
                    key={q.id}
                    onClick={() => handleSelect(q)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                      marginBottom: '4px', transition: 'background 0.15s',
                      fontSize: '13px', lineHeight: 1.5
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px' }}>
                      [{q.question_type}] {q.stem}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-light)' }}>
                      <span className="question-badge badge-type">{q.question_type}</span>
                      <span>{q.category_name}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
