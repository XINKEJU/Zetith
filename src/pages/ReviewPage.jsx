import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getDueReviewQuestions, setReviewState, addToReviewQueue, getReviewStats, saveStudyRecord, getWrongQuestions } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer } from '../services/studyService'

const QUALITY_LABELS = [
  { value: 0, label: '完全忘记', emoji: '😫', color: '#d93025' },
  { value: 1, label: '几乎忘记', emoji: '😣', color: '#e37400' },
  { value: 2, label: '勉强记起', emoji: '😕', color: '#f9ab00' },
  { value: 3, label: '需要回忆', emoji: '🤔', color: '#1a73e8' },
  { value: 4, label: '轻松答对', emoji: '😊', color: '#0d904f' },
  { value: 5, label: '完美掌握', emoji: '🎯', color: '#0d904f' },
]

export default function ReviewPage() {
  const navigate = useNavigate()
  const { categories, wrongCount, persistAndRefresh } = useApp()
  const [questions, setQuestions] = useState([])
  const [displays, setDisplays] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [answerResult, setAnswerResult] = useState(null)
  const [showRate, setShowRate] = useState(false)
  const [rated, setRated] = useState(false)
  const [finished, setFinished] = useState(false)
  const [results, setResults] = useState([]) // { isCorrect, quality }
  const [filterCategory, setFilterCategory] = useState('')
  const [stats, setStats] = useState({ total: 0, due: 0, mastered: 0 })
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const loadQuestions = () => {
    const catId = filterCategory ? parseInt(filterCategory) : null
    const dueQuestions = getDueReviewQuestions(catId)
    
    if (dueQuestions.length > 0) {
      const ds = dueQuestions.map(q => prepareQuestionForDisplay(q, true))
      setQuestions(dueQuestions)
      setDisplays(ds)
    } else {
      setQuestions([])
      setDisplays([])
    }
    
    setCurrentIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setAnswerResult(null)
    setShowRate(false)
    setRated(false)
    setFinished(false)
    setResults([])
    setStats(getReviewStats())
  }

  const handleAddWrongToReview = () => {
    const wrong = getWrongQuestions(filterCategory ? parseInt(filterCategory) : null)
    if (wrong.length === 0) {
      alert('没有错题需要添加')
      return
    }
    
    let count = 0
    for (const q of wrong) {
      addToReviewQueue(q.id, 0, 2.5, 0)
      count++
    }
    
    persistAndRefresh().then(() => {
      alert(`已将 ${count} 道错题加入复习计划`)
      loadQuestions()
    })
  }

  useEffect(() => {
    loadQuestions()
  }, [])

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return
    const currentQ = questions[currentIndex]
    const currentD = displays[currentIndex]
    const result = checkAnswer(currentQ, selectedOption, currentD.shuffleMap)
    setAnswerResult(result)
    setSubmitted(true)
    saveStudyRecord(currentQ.id, currentQ.category_id, result.isCorrect, result.userAnswer, 0)
    setShowRate(true)
  }

  const handleRate = (quality) => {
    const currentQ = questions[currentIndex]
    setReviewState(currentQ.id, quality)
    
    const isCorrect = answerResult?.isCorrect || false
    setResults(prev => [...prev, { questionId: currentQ.id, isCorrect, quality }])
    setRated(true)

    if (currentIndex >= questions.length - 1) {
      timeoutRef.current = setTimeout(() => {
        setFinished(true)
        persistAndRefresh().catch(() => {})
      }, 500)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1)
      setSelectedOption(null)
      setSubmitted(false)
      setAnswerResult(null)
      setShowRate(false)
      setRated(false)
    } else {
      setFinished(true)
      persistAndRefresh().catch(() => {})
    }
  }

  const qualityStats = useMemo(() => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    results.forEach(r => { counts[r.quality] = (counts[r.quality] || 0) + 1 })
    return counts
  }, [results])

  // Loading
  if (questions.length > 0 && !finished) {
    const currentQ = questions[currentIndex]
    const currentD = displays[currentIndex]

    return (
      <div>
        <div className="page-header">
          <h1>智能复习</h1>
          <p>基于 SM-2 间隔重复算法，科学安排复习计划</p>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
        </div>
        <div className="progress-info">
          <span>第 {currentIndex + 1} / {questions.length} 题</span>
          <span>阶段: {currentQ.stage || 0} | 间隔: {currentQ.interval_days || 0} 天</span>
        </div>

        <div className="question-card">
          <div className="question-meta">
            <span className="question-badge badge-type">{currentD.question_type}</span>
            <span className="question-badge badge-difficulty">{currentD.difficulty}</span>
          </div>

          <div className="question-stem">
            {currentD.stem}
          </div>

          <div className="options-list">
            {currentD.displayOptions.map((opt, idx) => {
              let cls = 'option-item'
              if (submitted) {
                const letters = ['A', 'B', 'C', 'D']
                const orig = letters[currentD.shuffleMap[idx]]
                if (orig === answerResult?.correctAnswer) cls += ' correct'
                else if (idx === selectedOption && !answerResult?.isCorrect) cls += ' wrong'
              } else if (idx === selectedOption) cls += ' selected'
              return (
                <div key={idx} className={cls} onClick={() => !submitted && setSelectedOption(idx)}>
                  <span className="option-letter">{opt.key}</span>
                  <span className="option-text">{opt.text}</span>
                </div>
              )
            })}
          </div>

          {!submitted ? (
            <div style={{ textAlign: 'center' }}>
              <button className="btn btn-primary btn-large" onClick={handleSubmitAnswer} disabled={selectedOption === null}>
                提交答案
              </button>
            </div>
          ) : showRate && !rated ? (
            <div>
              <div className={`explanation-box ${answerResult?.isCorrect ? 'correct-box' : 'wrong-box'}`}>
                <h4>{answerResult?.isCorrect ? '✅ 正确' : '❌ 错误'} · 正确答案: {answerResult?.correctAnswer}</h4>
                {currentQ.explanation && <p style={{ marginTop: '8px' }}>{currentQ.explanation}</p>}
              </div>
              
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  请评价你对这道题的掌握程度：
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {QUALITY_LABELS.map(q => (
                    <button
                      key={q.value}
                      className="btn"
                      style={{
                        background: q.value >= 3 ? 'var(--success-light)' : q.value >= 2 ? 'var(--warning-light)' : 'var(--danger-light)',
                        border: `1px solid ${q.color}`,
                        color: q.color,
                        flex: '1 1 100px',
                        maxWidth: '120px',
                        padding: '10px 8px',
                        flexDirection: 'column',
                        gap: '2px'
                      }}
                      onClick={() => handleRate(q.value)}
                    >
                      <span style={{ fontSize: '20px' }}>{q.emoji}</span>
                      <span style={{ fontSize: '12px' }}>{q.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : rated && (
            <div className="action-bar">
              <button className="btn btn-primary" onClick={handleNext}>
                {currentIndex < questions.length - 1 ? '下一题 →' : '完成复习'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Review complete
  if (finished) {
    const avgQuality = results.length > 0 
      ? (results.reduce((s, r) => s + r.quality, 0) / results.length).toFixed(1)
      : 0

    return (
      <div>
        <div className="page-header">
          <h1>复习完成</h1>
        </div>

        <div className="question-card practice-result">
          <div className="result-score" style={{ fontSize: '40px' }}>
            {results.length} 题
          </div>
          <div className="result-label">今日复习完成</div>

          <div className="result-details">
            <div className="result-detail-item">
              <div className="detail-value">{avgQuality}</div>
              <div className="detail-label">平均掌握度/5</div>
            </div>
            <div className="result-detail-item">
              <div className="detail-value">{results.filter(r => r.isCorrect).length}</div>
              <div className="detail-label">回答正确</div>
            </div>
          </div>

          {/* Quality distribution */}
          <div style={{ marginTop: '20px', textAlign: 'left' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>掌握度分布</h4>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '80px' }}>
              {QUALITY_LABELS.map(q => {
                const count = qualityStats[q.value] || 0
                const maxCount = Math.max(...Object.values(qualityStats), 1)
                const height = (count / maxCount) * 60
                return (
                  <div key={q.value} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{count}</span>
                    <div style={{
                      width: '100%', height: `${height}px`, borderRadius: '4px 4px 0 0',
                      background: q.color, minHeight: count > 0 ? '4px' : '0'
                    }} />
                    <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{q.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="action-bar" style={{ marginTop: '24px' }}>
            <button className="btn btn-primary" onClick={loadQuestions}>
              继续复习
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Setup / empty state
  return (
    <div>
      <div className="page-header">
        <h1>智能复习</h1>
        <p>基于 SM-2 间隔重复算法，科学安排复习计划</p>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.total}</div>
          <div className="stat-label">复习队列总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: stats.due > 0 ? 'var(--danger)' : 'var(--success)' }}>{stats.due}</div>
          <div className="stat-label">今日待复习</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.mastered}</div>
          <div className="stat-label">已掌握</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '32px' }}>
        {stats.due > 0 ? (
          <button className="btn btn-primary btn-large" onClick={loadQuestions}>
            🧠 开始今日复习 ({stats.due} 题)
          </button>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>今日没有待复习的题目</h3>
            <p>保持良好的学习节奏！</p>
          </div>
        )}
        
        {wrongCount > 0 && (
          <div style={{ marginTop: '24px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              你还有 {wrongCount} 道错题没有加入复习计划
            </p>
            <button className="btn btn-primary" onClick={handleAddWrongToReview}>
              加入复习计划
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
