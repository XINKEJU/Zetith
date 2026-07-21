import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getBookmarkedQuestions, toggleBookmark } from '../db/database'
import { useToast } from '../components/ToastProvider'

export default function FavoritesPage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()
  const { addToast } = useToast()

  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  
  const bookmarks = useMemo(() => {
    try { return getBookmarkedQuestions(filterCategoryId ? +filterCategoryId : null) }
    catch { return [] }
  }, [filterCategoryId, refreshKey])

  const handleRemove = (e, questionId) => {
    e.stopPropagation()
    toggleBookmark(questionId)
    persistAndRefresh().catch(() => {})
    setRefreshKey(k => k + 1)
    addToast('已取消收藏', 'info')
  }

  return (
    <div>
      <div className="page-header">
        <h1>收藏夹</h1>
        <p>你收藏的所有重点题目</p>
      </div>

      <div className="filter-bar">
        <select value={filterCategoryId} onChange={e => setFilterCategoryId(e.target.value)}>
          <option value="">全部题库</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          共 {bookmarks.length} 道收藏
        </span>
      </div>

      {bookmarks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">☆</div>
          <h3>还没有收藏</h3>
          <p>在浏览学习时可以收藏重点题目，方便回顾</p>
        </div>
      ) : (
        <div className="card">
          {bookmarks.map(q => (
            <div key={q.id} className="wrong-item"
              onClick={() => navigate(`/study/${q.category_id}`)}
              style={{ cursor: 'pointer' }}>
              <div className="wrong-stem" style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' }}>
                  [{q.category_name}]
                </span>
                [{q.question_type}] {q.stem}
              </div>
              <button className="btn btn-outline btn-sm"
                onClick={(e) => handleRemove(e, q.id)}
                style={{ color: 'var(--accent)', borderColor: 'var(--border)', fontSize: '11px', flexShrink: 0 }}>
                取消收藏
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
