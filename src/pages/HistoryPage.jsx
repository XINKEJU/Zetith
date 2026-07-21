import React, { useState, useMemo } from 'react'
import { getSessions, getSessionDetail } from '../db/database'

export default function HistoryPage() {
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)

  const sessions = useMemo(() => {
    try { return getSessions(100) } catch { return [] }
  }, [])

  const handleView = (id) => {
    try {
      const d = getSessionDetail(id)
      setDetail(d)
      setSelectedId(id)
    } catch { setDetail(null) }
  }

  if (detail && selectedId) {
    return (
      <div>
        <div className="page-header">
          <button className="btn btn-outline" onClick={() => { setSelectedId(null); setDetail(null) }} style={{ marginBottom: '10px' }}>
            ← 返回列表
          </button>
          <h1>{detail.type === 'exam' ? '考试结果' : '练习记录'}</h1>
          <p>{detail.started_at?.slice(0, 16)} · {detail.time_spent ? `${Math.floor(detail.time_spent / 60)}分${detail.time_spent % 60}秒` : ''}</p>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>总题数</span><br/><strong>{detail.total}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>正确</span><br/><strong style={{ color: 'var(--success)' }}>{detail.correct}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>错误</span><br/><strong style={{ color: 'var(--danger)' }}>{detail.total - detail.correct}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>得分</span><br/><strong>{detail.score}%</strong></div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {detail.items.map((item, i) => (
            <div key={i} style={{
              padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-card)',
              border: `1px solid ${item.is_correct ? 'var(--green)' : 'var(--red)'}`,
              borderLeftWidth: '3px'
            }}>
              <div style={{ fontSize: '13px', marginBottom: '6px', color: 'var(--text)' }}>
                {i + 1}. {item.question_text || '(题目已删除)'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {item.answer_given ? `你的答案: ${item.answer_given}` : '未作答'} 
                {!item.is_correct && item.answer && ` · 正确答案: ${item.answer}`}
                <span style={{ marginLeft: '8px', color: item.is_correct ? 'var(--success)' : 'var(--danger)' }}>
                  {item.is_correct ? '✓' : '✗'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div>
        <div className="page-header"><h1>练习历史</h1><p>你的所有练习和考试记录</p></div>
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          还没有练习记录，开始答题吧
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header"><h1>练习历史</h1><p>你的所有练习和考试记录</p></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sessions.map(s => (
          <div key={s.id}
            onClick={() => handleView(s.id)}
            style={{
              padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '16px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
          >
            <span style={{ fontSize: '18px' }}>{s.type === 'exam' ? '📝' : '📖'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.type === 'exam' ? '模拟考试' : s.category_name ? s.category_name : '综合练习'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {s.finished_at?.slice(0, 16)} · {Math.floor(s.time_spent / 60)}分钟
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: s.score >= 60 ? 'var(--success)' : 'var(--danger)' }}>
                {s.score}%
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {s.correct}/{s.total}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
