import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { saveStudyRecord, saveSession } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer, getQuestionsForPractice } from '../services/studyService'

export default function ExamPage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()

  // Setup
  const [setupDone, setSetupDone] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [questionCount, setQuestionCount] = useState(50)
  const [timeLimit, setTimeLimit] = useState(60)
  const [passingScore, setPassingScore] = useState(60)

  // Exam state
  const [questions, setQuestions] = useState([])
  const [displays, setDisplays] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [results, setResults] = useState([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [finished, setFinished] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [answerResult, setAnswerResult] = useState(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  // Start exam
  const startExam = () => {
    if (!selectedCategory) return
    const qs = getQuestionsForPractice(parseInt(selectedCategory), questionCount)
    if (qs.length === 0) return

    const ds = qs.map(q => prepareQuestionForDisplay(q, true))
    setQuestions(qs)
    setDisplays(ds)
    setCurrentIndex(0)
    setSelectedOption(null)
    setResults([])
    setFinished(false)
    setSubmitted(false)
    setAnswerResult(null)
    setTimeLeft(timeLimit * 60)
    setSetupDone(true)
    startTimeRef.current = Date.now()
  }

  // Timer
  const handleSubmitExam = useCallback(() => {
    if (finished) return
    setFinished(true)
    clearTimeout(timerRef.current)
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
    const correctCount = results.filter(r => r && r.isCorrect).length
    saveSession({
      type: 'exam', categoryId: parseInt(selectedCategory) || null, total: questions.length,
      correct: correctCount, timeSpent: elapsed,
      score: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
      items: results.map((r, i) => ({ questionId: questions[i]?.id, isCorrect: r.isCorrect }))
    })
    persistAndRefresh().catch(() => {})
  }, [finished, persistAndRefresh, selectedCategory, questions, results])

  useEffect(() => {
    if (!setupDone || finished) return
    if (timeLeft <= 0) {
      handleSubmitExam()
      return
    }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [timeLeft, setupDone, finished, handleSubmitExam])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleSelectOption = (idx) => {
    if (submitted) return
    setSelectedOption(idx)
  }

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return
    const currentQ = questions[currentIndex]
    const currentD = displays[currentIndex]
    const result = checkAnswer(currentQ, selectedOption, currentD.shuffleMap)
    setAnswerResult(result)
    setSubmitted(true)
    saveStudyRecord(currentQ.id, currentQ.category_id, result.isCorrect, result.userAnswer, Math.round((Date.now() - startTimeRef.current) / 1000))
    setResults(prev => [...prev, { ...result, questionId: currentQ.id }])
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1)
      setSelectedOption(null)
      setSubmitted(false)
      setAnswerResult(null)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1)
      // Restore previous answer if exists
      const prevResult = results[currentIndex - 1]
      if (prevResult) {
        setSubmitted(true)
        setAnswerResult(prevResult)
        setSelectedOption(null)
      } else {
        setSelectedOption(null)
        setSubmitted(false)
        setAnswerResult(null)
      }
    }
  }

  const correctCount = results.filter(r => r.isCorrect).length
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0
  const passed = score >= passingScore
  const totalTime = Math.round((Date.now() - startTimeRef.current) / 1000)

  // Type breakdown
  const typeBreakdown = useMemo(() => {
    const map = {}
    results.forEach((r, i) => {
      const type = questions[i]?.question_type || '未知'
      if (!map[type]) map[type] = { total: 0, correct: 0 }
      map[type].total++
      if (r.isCorrect) map[type].correct++
    })
    return Object.entries(map)
  }, [results, questions])

  // Setup screen
  if (!setupDone) {
    const cat = categories.find(c => c.id === parseInt(selectedCategory))
    return (
      <div>
        <div className="page-header">
          <h1>模拟考试</h1>
          <p>模拟真实考试环境，设定时长和分数线</p>
        </div>

        <div className="practice-setup">
          <h2>考试设置</h2>

          <div className="form-group">
            <label>选择题库</label>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
              <option value="">-- 请选择题库 --</option>
              {categories.filter(c => c.question_count > 0).map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.question_count}题)</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>题目数量</label>
            <select value={questionCount} onChange={e => setQuestionCount(parseInt(e.target.value))}>
              <option value={20}>20 题</option>
              <option value={50}>50 题</option>
              <option value={80}>80 题</option>
              <option value={100}>100 题</option>
            </select>
            {cat && <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>题库共 {cat.question_count} 题</p>}
          </div>

          <div className="form-group">
            <label>考试时间（分钟）</label>
            <select value={timeLimit} onChange={e => setTimeLimit(parseInt(e.target.value))}>
              <option value={30}>30 分钟</option>
              <option value={45}>45 分钟</option>
              <option value={60}>60 分钟</option>
              <option value={90}>90 分钟</option>
              <option value={120}>120 分钟</option>
            </select>
          </div>

          <div className="form-group">
            <label>及格分数线</label>
            <select value={passingScore} onChange={e => setPassingScore(parseInt(e.target.value))}>
              <option value={60}>60 分</option>
              <option value={70}>70 分</option>
              <option value={80}>80 分</option>
              <option value={90}>90 分</option>
            </select>
          </div>

          <button className="btn btn-primary btn-large" style={{ width: '100%' }} onClick={startExam} disabled={!selectedCategory}>
            开始考试
          </button>
        </div>
      </div>
    )
  }

  // Results screen
  if (finished) {
    return (
      <div>
        <div className="page-header">
          <h1>考试成绩单</h1>
        </div>

        <div className="question-card practice-result">
          <div className="result-score" style={{ color: passed ? 'var(--success)' : 'var(--danger)' }}>
            {score}
          </div>
          <div className="result-label">
            {passed ? '通过！' : '不合格，请继续努力'}
          </div>

          <div className="result-details">
            <div className="result-detail-item">
              <div className="detail-value">{correctCount}/{questions.length}</div>
              <div className="detail-label">正确/总题</div>
            </div>
            <div className="result-detail-item">
              <div className="detail-value">{Math.floor(totalTime / 60)}分{totalTime % 60}秒</div>
              <div className="detail-label">用时</div>
            </div>
            <div className="result-detail-item">
              <div className="detail-value" style={{ color: passed ? 'var(--success)' : 'var(--danger)' }}>
                {passed ? '合格' : '不合格'}
              </div>
              <div className="detail-label">结果（{passingScore}分及格）</div>
            </div>
          </div>

          {/* Question type breakdown */}
          <div style={{ marginTop: '20px', textAlign: 'left' }}>
            <h4 style={{ fontSize: '15px', marginBottom: '12px' }}>各题型得分</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {typeBreakdown.map(([type, data]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '60px', fontSize: '13px', color: 'var(--text-secondary)' }}>{type}</span>
                  <div style={{ flex: 1, height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(data.correct / data.total) * 100}%`, height: '100%',
                      background: data.correct / data.total >= 0.6 ? 'var(--success)' : 'var(--danger)',
                      borderRadius: '4px', transition: 'width 0.5s'
                    }} />
                  </div>
                  <span style={{ fontSize: '13px', minWidth: '60px', textAlign: 'right' }}>
                    {data.correct}/{data.total} ({Math.round((data.correct / data.total) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Error review */}
          {correctCount < questions.length && (
            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <h4 style={{ fontSize: '15px', marginBottom: '12px' }}>错题回顾</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {results.map((r, i) => !r.isCorrect ? (
                  <div key={i} style={{
                    padding: '12px', marginBottom: '8px', borderRadius: '8px',
                    background: 'var(--danger-light)', fontSize: '13px'
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>第 {i + 1} 题</div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {questions[i]?.stem || ''}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      你的答案: <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{r.userAnswer}</span>
                      {' '}正确答案: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{r.correctAnswer}</span>
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          <div className="action-bar" style={{ marginTop: '24px' }}>
            <button className="btn btn-primary" onClick={() => { setSetupDone(false); setFinished(false) }}>
              重新考试
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/wrongbook')}>
              📝 错题本
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Exam in progress
  const currentQ = questions[currentIndex]
  const currentD = displays[currentIndex]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px' }}>模拟考试</h1>
        <div style={{
          padding: '8px 16px', borderRadius: '8px', fontSize: '18px', fontWeight: 700,
          background: timeLeft < 300 ? 'var(--danger-light)' : 'var(--primary-light)',
          color: timeLeft < 300 ? 'var(--danger)' : 'var(--primary)',
          fontVariantNumeric: 'tabular-nums'
        }}>
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="progress-info">
        <span>第 {currentIndex + 1} / {questions.length} 题</span>
        <span>已答 {results.length} 题，正确 {correctCount}</span>
      </div>

      <div className="question-card" style={{ marginBottom: '0' }}>
        <div className="question-meta">
          <span className="question-badge badge-type">{currentD.question_type}</span>
          <span className="question-badge badge-difficulty">{currentD.difficulty}</span>
        </div>

        <div className="question-stem">
          <strong>{currentIndex + 1}.</strong> {currentD.stem}
        </div>

        <div className="options-list">
          {currentD.displayOptions.map((opt, idx) => {
            let cls = 'option-item'
            if (submitted) {
              const letters = ['A', 'B', 'C', 'D']
              const orig = letters[currentD.shuffleMap[idx]]
              if (orig === answerResult?.correctAnswer || opt.text === answerResult?.correctAnswer) cls += ' correct'
              else if (idx === selectedOption && !answerResult?.isCorrect) cls += ' wrong'
            } else if (idx === selectedOption) cls += ' selected'
            return (
              <div key={idx} className={cls} onClick={() => handleSelectOption(idx)}>
                <span className="option-letter">{opt.key}</span>
                <span className="option-text">{opt.text}</span>
              </div>
            )
          })}
        </div>

        {!submitted ? (
          <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
            <button className="btn btn-primary btn-large" onClick={handleSubmitAnswer} disabled={selectedOption === null}>
              提交答案
            </button>
          </div>
        ) : (
          <div style={{ paddingBottom: '16px' }}>
            <div className={`explanation-box ${answerResult?.isCorrect ? 'correct-box' : 'wrong-box'}`}>
              <h4>{answerResult?.isCorrect ? '✅ 正确' : '❌ 错误'} · 正确答案: {answerResult?.correctAnswer}</h4>
            </div>
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="practice-fixed-bar">
        <button className="btn btn-outline" onClick={handlePrev} disabled={currentIndex === 0}>
          上一题
        </button>
        {!submitted ? (
          <button className="btn btn-primary" onClick={handleSubmitAnswer} disabled={selectedOption === null}>
            提交答案
          </button>
        ) : currentIndex < questions.length - 1 ? (
          <button className="btn btn-primary" onClick={handleNext}>下一题</button>
        ) : (
          <button className="btn btn-success" onClick={handleSubmitExam}>提交试卷</button>
        )}
      </div>
    </div>
  )
}
