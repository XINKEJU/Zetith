import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getDueReviewQuestions, getQuestionsByCategory, getWrongQuestions, saveStudyRecord, setReviewState, addToReviewQueue } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer, shuffleArray } from '../services/studyService'

const TARGET = 30

export default function DailyPage() {
  const navigate = useNavigate()
  const { categories, stats, persistAndRefresh } = useApp()

  const [started, setStarted] = useState(false)
  const [questions, setQuestions] = useState([])
  const [displays, setDisplays] = useState([])
  const [index, setIndex] = useState(0)
  const [option, setOption] = useState(null)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)
  const [results, setResults] = useState([])

  // Cache repeated DB queries during setup phase
  const reviewQs = useMemo(() => { try { return getDueReviewQuestions() } catch { return [] } }, [stats])
  const wrongQs = useMemo(() => { try { return getWrongQuestions() } catch { return [] } }, [stats])

  const reviewCount = reviewQs.length
  const wrongCount = wrongQs.length

  // Build daily mix (cached via useMemo)
  const mix = useMemo(() => {
    const selectedReview = shuffleArray([...reviewQs]).slice(0, Math.min(Math.floor(TARGET * 0.7), reviewQs.length))
    const wrongSelected = shuffleArray([...wrongQs]).slice(0, Math.min(10, wrongQs.length))
    
    const reviewIds = new Set(selectedReview.map(r => r.id))
    const wrongIds = new Set(wrongSelected.map(w => w.id))
    const excludedIds = new Set([...reviewIds, ...wrongIds])
    
    const newCount = TARGET - selectedReview.length - wrongSelected.length
    let newQs = []
    if (newCount > 0 && categories.length > 0) {
      const allCats = categories.filter(c => c.question_count > 0)
      if (allCats.length > 0) {
        const cat = allCats[Math.floor(Math.random() * allCats.length)]
        const catQs = getQuestionsByCategory(cat.id)
        newQs = shuffleArray(catQs)
          .filter(q => !excludedIds.has(q.id))
          .slice(0, newCount)
      }
    }
    
    const combined = [...selectedReview, ...wrongSelected, ...newQs]
    return {
      questions: shuffleArray(combined),
      reviewCount: selectedReview.length,
      wrongCount: wrongSelected.length,
      newCount: newQs.length
    }
  }, [reviewQs, wrongQs, categories])

  // Used to quickly check if a question is review/wrong
  const reviewIdSet = useMemo(() => new Set(reviewQs.map(r => r.id)), [reviewQs])
  const wrongIdSet = useMemo(() => new Set(wrongQs.map(w => w.id)), [wrongQs])

  const begin = useCallback(() => {
    if (!mix.questions.length) return
    const ds = mix.questions.map(q => prepareQuestionForDisplay(q, true))
    setQuestions(mix.questions)
    setDisplays(ds)
    setIndex(0)
    setOption(null)
    setDone(false)
    setResult(null)
    setResults([])
    setStarted(true)
  }, [mix])

  const correct = useMemo(() => results.filter(r => r.correct).length, [results])

  const submit = useCallback(() => {
    if (option === null) return
    const currentQ = questions[index]
    const currentD = displays[index]
    const r = checkAnswer(currentQ, option, currentD.shuffleMap)
    setResult(r)
    setDone(true)
    saveStudyRecord(currentQ.id, currentQ.category_id, r.isCorrect, r.userAnswer, 0)
    
    const quality = r.isCorrect ? 4 : 1
    setReviewState(currentQ.id, quality)
    
    if (!reviewIdSet.has(currentQ.id) && !wrongIdSet.has(currentQ.id)) {
      addToReviewQueue(currentQ.id, 0, 2.5, r.isCorrect ? 1 : 0)
    }

    setResults(prev => [...prev, { correct: r.isCorrect }])
  }, [option, questions, index, displays, reviewIdSet, wrongIdSet])

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      setStarted(false)
      persistAndRefresh().catch(() => {})
    } else {
      setIndex(i => i + 1)
      setOption(null)
      setDone(false)
      setResult(null)
    }
  }, [index, questions.length, persistAndRefresh])

  if (!started) {
    return (
      <div>
        <div className="page-header">
          <h1>每日一练</h1>
          <p>智能混合待复习题、错题和新题，科学刷题</p>
        </div>

        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{reviewCount}</div>
            <div className="stat-label">待复习题</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{wrongCount}</div>
            <div className="stat-label">错题</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{mix.questions.length}</div>
            <div className="stat-label">今日推荐</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <div className="card" style={{ display: 'inline-block', textAlign: 'left', minWidth: '320px', marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', marginBottom: '12px' }}>今日练习组成：</div>
            {mix.questions.length > 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 2 }}>
                <div>待复习：{mix.reviewCount} 题</div>
                <div>错题巩固：{mix.wrongCount} 题</div>
                <div>新题拓展：{mix.newCount} 题</div>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>暂无题目，请先导入题库并开始练习</p>
            )}
          </div>
          <br />
          <button className="btn btn-primary btn-large" onClick={begin} disabled={mix.questions.length === 0}>
            开始今日练习（{mix.questions.length} 题）
          </button>
        </div>
      </div>
    )
  }

  const q = questions[index]
  const d = displays[index]
  if (!q || !d) return <div className="loading">加载中...</div>

  const pct = ((index + (done ? 1 : 0)) / questions.length) * 100

  return (
    <div>
      <div className="page-header"><h1>每日一练</h1></div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="progress-info">
        <span>{index + 1} / {questions.length}</span>
        <span>正确 {correct}</span>
      </div>

      <div className="question-card" style={{ marginBottom: '0' }}>
        <div className="question-meta">
          <span className="question-badge badge-type">{d.question_type}</span>
          {d.difficulty && <span className="question-badge badge-difficulty">{d.difficulty}</span>}
        </div>
        <div className="question-stem">{index + 1}. {d.stem}</div>

        <div className="options-list">
          {d.displayOptions.map((opt, idx) => {
            let cls = 'option-item'
            if (done) {
              const letter = ['A','B','C','D'][d.shuffleMap[idx]]
              if (letter === result?.correctAnswer || opt.text === result?.correctAnswer) cls += ' correct'
              else if (idx === option && !result?.isCorrect) cls += ' wrong'
            } else if (idx === option) cls += ' selected'
            return (
              <div key={idx} className={cls} onClick={() => !done && setOption(idx)}>
                <span className="option-letter">{opt.key}</span>
                <span className="option-text">{opt.text}</span>
              </div>
            )
          })}
        </div>

        {!done ? (
          <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
            <button className="btn btn-primary btn-large" onClick={submit} disabled={option === null}>提交</button>
          </div>
        ) : (
          <div style={{ paddingBottom: '16px' }}>
            <div className={`explanation-box ${result?.isCorrect ? 'correct-box' : 'wrong-box'}`}>
              <h4>{result?.isCorrect ? '正确' : '错误'} — 答案：{result?.correctAnswer}</h4>
              {q.explanation && <p style={{ marginTop: '8px' }}>{q.explanation}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="practice-fixed-bar">
        <button className="btn btn-outline" onClick={() => { setIndex(i => Math.max(0, i - 1)); setOption(null); setDone(false); setResult(null) }}
          disabled={index === 0 && !done}>
          上一题
        </button>
        {!done ? (
          <button className="btn btn-primary" onClick={submit} disabled={option === null}>提交</button>
        ) : (
          <button className="btn btn-primary" onClick={next}>
            {index < questions.length - 1 ? '下一题' : '完成'}
          </button>
        )}
      </div>
    </div>
  )
}
