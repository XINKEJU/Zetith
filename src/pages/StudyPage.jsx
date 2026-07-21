import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestionsByCategory, getCategoryById, toggleBookmark, isBookmarked, getNote, saveNote } from '../db/database'
import { shuffleArray, prepareQuestionForDisplay } from '../services/studyService'
import { useToast } from '../components/ToastProvider'

export default function StudyPage() {
  const { categoryId } = useParams()
  const navigate = useNavigate()
  const catId = parseInt(categoryId)
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [category, setCategory] = useState(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [note, setNote] = useState('')
  const [noteLoaded, setNoteLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    if (isNaN(catId)) {
      navigate('/categories')
      return
    }
    const cat = getCategoryById(catId)
    if (!cat) {
      navigate('/categories')
      return
    }
    setCategory(cat)
    const qs = getQuestionsByCategory(catId)
    setQuestions(qs)
    setLoading(false)
  }, [categoryId, navigate])

  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length) {
      const q = questions[currentIndex]
      setBookmarked(isBookmarked(q?.id))
      setNote(getNote(q?.id))
      setNoteLoaded(true)
    }
  }, [currentIndex, questions])

  const currentQuestion = questions[currentIndex]
  const displayQuestion = currentQuestion ? prepareQuestionForDisplay(currentQuestion, false) : null

  const handleToggleShuffle = () => {
    if (shuffleMode) {
      const qs = getQuestionsByCategory(catId)
      setQuestions(qs)
      setCurrentIndex(0)
    } else {
      const qs = getQuestionsByCategory(catId)
      setQuestions(shuffleArray(qs))
      setCurrentIndex(0)
    }
    setShuffleMode(!shuffleMode)
    setShowAnswer(false)
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setShowAnswer(false)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setShowAnswer(false)
    }
  }

  const handleBookmark = () => {
    if (!currentQuestion) return
    const newState = toggleBookmark(currentQuestion.id)
    setBookmarked(newState)
    const msg = newState ? '已收藏' : '已取消收藏'
    addToast(msg, 'success', 1500)
  }

  const handleSaveNote = () => {
    if (!currentQuestion) return
    saveNote(currentQuestion.id, note)
    addToast('笔记已保存', 'success', 1500)
  }

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') handlePrev()
    if (e.key === 'ArrowRight') handleNext()
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setShowAnswer(s => !s)
    }
  }, [currentIndex, questions.length])

  // Swipe gesture for mobile
  const touchStartX = useRef(0)
  const handleTouchStart = useCallback((e) => { touchStartX.current = e.touches[0].clientX }, [])
  const handleTouchEnd = useCallback((e) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      if (diff > 0) handleNext()
      else handlePrev()
    }
  }, [currentIndex, questions.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{category?.name || '浏览学习'}</h1>
          <p>共 {questions.length} 题 · 当前第 {currentIndex + 1} 题</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${shuffleMode ? 'btn-primary' : 'btn-outline'}`} onClick={handleToggleShuffle}>
            🔀 {shuffleMode ? '顺序' : '随机'}
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/categories')}>
            返回
          </button>
        </div>
      </div>

      {!currentQuestion ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>题库为空</h3>
          <p>该题库还没有题目，请先导入题目</p>
        </div>
      ) : (
        <>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>

          <div className="question-card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="question-meta" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="question-badge badge-type">{displayQuestion.question_type}</span>
                <span className="question-badge badge-difficulty">{displayQuestion.difficulty}</span>
                {displayQuestion.tags && displayQuestion.tags.split(',').filter(Boolean).map((tag, i) => (
                  <span key={i} className="question-badge" style={{ background: '#f0f0f0', color: '#666' }}>
                    {tag.trim()}
                  </span>
                ))}
              </div>
              <button className="bookmark-btn" onClick={handleBookmark} title={bookmarked ? '取消收藏' : '收藏'}>
                {bookmarked ? '⭐' : '☆'}
              </button>
            </div>

            <div className="question-stem">
              <strong>第 {currentIndex + 1} 题.</strong> {displayQuestion.stem}
            </div>

            <div className="options-list">
              {displayQuestion.displayOptions.map((opt, idx) => (
                <div key={idx} className="option-item">
                  <span className="option-letter">{opt.key}</span>
                  <span className="option-text">{opt.text}</span>
                </div>
              ))}
            </div>

            {!showAnswer ? (
              <div style={{ textAlign: 'center' }}>
                <button className="btn btn-primary btn-large" onClick={() => setShowAnswer(true)}>
                  显示答案
                </button>
                <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '8px' }}>
                  提示：按空格键显示/隐藏答案，← → 切换题目
                </p>
              </div>
            ) : (
              <div>
                <div className="explanation-box correct-box">
                  <h4>✅ 正确答案：{displayQuestion.answer}</h4>
                  {displayQuestion.explanation && (
                    <p style={{ marginTop: '8px' }}>{displayQuestion.explanation}</p>
                  )}
                </div>
                
                {/* Notes */}
                <div style={{ marginTop: '16px' }}>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="📝 在这里写笔记..."
                    style={{
                      width: '100%', minHeight: '60px', padding: '10px 14px',
                      border: '1.5px solid var(--border)', borderRadius: '10px',
                      fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text)',
                      resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                      lineHeight: 1.6
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 12px' }}
                      onClick={handleSaveNote}>
                      保存
                    </button>
                  </div>
                </div>

                <div className="action-bar">
                  <button className="btn btn-outline" onClick={handlePrev} disabled={currentIndex === 0}>
                    ← 上一题
                  </button>
                  <button className="btn btn-primary" onClick={() => setShowAnswer(false)}>
                    隐藏答案
                  </button>
                  <button className="btn btn-outline" onClick={handleNext} disabled={currentIndex === questions.length - 1}>
                    下一题 →
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="swipe-hint">← 左滑下一题 · 右滑上一题 →</div>
        </>
      )}
    </div>
  )
}
