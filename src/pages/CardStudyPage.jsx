import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getQuestionsByCategory, getCategoryById, toggleBookmark, isBookmarked, getFilteredQuestions, getAllTags } from '../db/database'
import { shuffleArray } from '../services/studyService'

export default function CardStudyPage() {
  const navigate = useNavigate()
  const { categories } = useApp()
  
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('')
  const [randomOrder, setRandomOrder] = useState(true)
  const [started, setStarted] = useState(false)
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [category, setCategory] = useState(null)
  const [bookmarked, setBookmarked] = useState(false)
  
  const tags = useMemo(() => {
    if (!selectedCategoryId) return []
    try { return getAllTags(selectedCategoryId) } catch { return [] }
  }, [selectedCategoryId])

  const begin = () => {
    if (!selectedCategoryId) return
    let qs = getFilteredQuestions(+selectedCategoryId, { 
      tag: selectedTag || undefined, 
      difficulty: selectedDifficulty || undefined 
    })
    if (randomOrder) qs = shuffleArray(qs)
    if (!qs.length) return
    setQuestions(qs)
    setIndex(0)
    setFlipped(false)
    setCategory(getCategoryById(+selectedCategoryId))
    setStarted(true)
  }

  useEffect(() => {
    if (started && questions[index]) {
      setBookmarked(isBookmarked(questions[index].id))
    }
  }, [index, started, questions])

  const handleFlip = () => setFlipped(f => !f)
  const handlePrev = () => { if (index > 0) { setIndex(i => i - 1); setFlipped(false) } }
  const handleNext = () => { if (index < questions.length - 1) { setIndex(i => i + 1); setFlipped(false) } }
  const handleBookmark = () => {
    const q = questions[index]
    if (q) { toggleBookmark(q.id); setBookmarked(b => !b) }
  }

  useEffect(() => {
    const h = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFlip() }
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [index, flipped, questions.length])

  if (!started) {
    return (
      <div>
        <div className="page-header">
          <h1>背题模式</h1>
          <p>卡片翻转式浏览，正面题干 → 翻转显示答案</p>
        </div>
        <div className="practice-setup">
          <div className="form-group">
            <label>选择题库</label>
            <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}>
              <option value="">请选择题库...</option>
              {categories.filter(c => c.question_count > 0).map(c => (
                <option key={c.id} value={c.id}>{c.name}（{c.question_count} 题）</option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>标签筛选</label>
              <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)}>
                <option value="">全部标签</option>
                {tags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>难度筛选</label>
              <select value={selectedDifficulty} onChange={e => setSelectedDifficulty(e.target.value)}>
                <option value="">全部难度</option>
                {['易','偏易','适中','偏难','难'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginRight: '8px' }}
                checked={randomOrder} onChange={e => setRandomOrder(e.target.checked)} />
              随机顺序
            </label>
          </div>
          
          <button className="btn btn-primary btn-large" style={{ width: '100%' }}
            onClick={begin} disabled={!selectedCategoryId}>开始背题</button>
        </div>
      </div>
    )
  }

  const q = questions[index]
  if (!q) return <div className="loading">加载中...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1>背题模式</h1>
          <p>{category?.name} · {index + 1} / {questions.length}</p>
        </div>
        <button className="btn btn-outline" onClick={() => setStarted(false)}>返回</button>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div
        onClick={handleFlip}
        style={{
          maxWidth: '700px', margin: '0 auto', minHeight: '400px',
          perspective: '1000px', cursor: 'pointer'
        }}
      >
        <div style={{
          position: 'relative', width: '100%', minHeight: '380px',
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}>
          {/* Front - Question */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow)', border: '1px solid var(--border-light)',
            padding: '36px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span className="question-badge badge-type">{q.question_type}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="question-badge badge-difficulty">{q.difficulty || '适中'}</span>
                <button className="bookmark-btn" onClick={e => { e.stopPropagation(); handleBookmark() }}
                  style={{ fontSize: '20px' }}>
                  {bookmarked ? '★' : '☆'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '17px', lineHeight: 1.9, textAlign: 'center', fontWeight: 500 }}>
              {q.stem}
            </div>
            {q.option_a && (
              <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {['A','B','C','D'].map((letter, i) => {
                  const opt = q[`option_${letter.toLowerCase()}`]
                  if (!opt) return null
                  return (
                    <div key={letter} style={{
                      padding: '10px 14px', borderRadius: '10px',
                      background: 'var(--bg)', textAlign: 'center',
                      fontSize: '14px', border: '1px solid var(--border-light)'
                    }}>
                      <strong style={{ color: 'var(--accent)' }}>{letter}.</strong> {opt}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              点击翻转查看答案 · 空格键翻转
            </div>
          </div>

          {/* Back - Answer */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow)', border: '1px solid var(--border-light)',
            padding: '36px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{ 
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'var(--green-light)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', fontWeight: 700, color: 'var(--green)',
              marginBottom: '20px'
            }}>
              {q.answer}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>
              正确答案：{q.answer}
            </div>
            {q.explanation && (
              <div style={{ 
                maxWidth: '500px', fontSize: '14px', color: 'var(--text-secondary)',
                lineHeight: 1.8, textAlign: 'left', padding: '16px 20px',
                background: 'var(--green-light)', borderRadius: '12px', marginTop: '8px'
              }}>
                {q.explanation}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              点击翻转回题目
            </div>
          </div>
        </div>
      </div>

      <div className="action-bar">
        <button className="btn btn-outline" onClick={handlePrev} disabled={index === 0}>上一题</button>
        <button className="btn btn-primary" onClick={handleFlip}>{flipped ? '隐藏答案' : '显示答案'}</button>
        <button className="btn btn-outline" onClick={handleNext} disabled={index === questions.length - 1}>下一题</button>
      </div>
    </div>
  )
}
