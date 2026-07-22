import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { saveStudyRecord, getFilteredRandomQuestions, getAllTags, saveSession } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer } from '../services/studyService'
import { playCorrect, playIncorrect, playComplete } from '../services/soundService'

export default function PracticePage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()

  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [questionCount, setQuestionCount] = useState(20)
  const [optionShuffle, setOptionShuffle] = useState(true)
  const [filterTag, setFilterTag] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [filterType, setFilterType] = useState('')
  const [perQuestionTimer, setPerQuestionTimer] = useState(false)
  const [timePerQ, setTimePerQ] = useState(60)

  const [phase, setPhase] = useState('setup')
  const [questions, setQuestions] = useState([])
  const [displays, setDisplays] = useState([])
  const [index, setIndex] = useState(0)
  const [option, setOption] = useState(null)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)
  const [results, setResults] = useState([])
  const [qTimeLeft, setQTimeLeft] = useState(0)
  const timerRef = useRef(null)
  const startedAt = useRef(null)
  const [focusMode, setFocusMode] = useState(false)

  // 答题专注模式：隐藏侧栏 / 底栏，沉浸答题
  useEffect(() => {
    document.body.classList.toggle('focus-mode', focusMode)
    return () => document.body.classList.remove('focus-mode')
  }, [focusMode])

  // Dock 进度条（macOS）：练习中显示当前进度，退出时移除
  useEffect(() => {
    const r = window.electronAPI?.reportProgress
    if (!r) return
    if (phase === 'practice' && questions.length > 0) {
      r((index + (done ? 1 : 0)) / questions.length)
    } else {
      r(-1)
    }
  }, [phase, index, done, questions.length])

  useEffect(() => () => { window.electronAPI?.reportProgress?.(-1) }, [])

  // 失焦暂停单题倒计时：切走 App / 切到其他标签页时停止计时，回到前台恢复
  useEffect(() => {
    const pause = () => { if (phase === 'practice' && perQuestionTimer && !done) clearInterval(timerRef.current) }
    const resume = () => { if (phase === 'practice' && perQuestionTimer && !done) startTimer() }
    const onVis = () => { document.hidden ? pause() : resume() }
    window.addEventListener('blur', pause)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', pause)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [phase, perQuestionTimer, done])

  const begin = () => {
    if (!selectedCategoryId) return
    const qs = getFilteredRandomQuestions(+selectedCategoryId, questionCount, {
      tag: filterTag || undefined,
      difficulty: filterDifficulty || undefined
    })
    if (!qs.length) return
    // Apply type filter
    let filtered = qs
    if (filterType) {
      filtered = qs.filter(q => q.question_type === filterType)
      if (!filtered.length) return
    }
    const ds = filtered.map(q => prepareQuestionForDisplay(q, optionShuffle))
    setQuestions(filtered)
    setDisplays(ds)
    setIndex(0)
    setOption(null)
    setDone(false)
    setResult(null)
    setResults([])
    if (perQuestionTimer) { setQTimeLeft(timePerQ); startTimer(timePerQ) }
    startedAt.current = Date.now()
    setPhase('practice')
  }

  const startTimer = (sec) => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setQTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0 }
        return t - 1
      })
    }, 1000)
  }

  const submit = useCallback(() => {
    if (option === null) return
    const r = checkAnswer(questions[index], option, displays[index].shuffleMap)
    setResult(r)
    setDone(true)
    saveStudyRecord(questions[index].id, questions[index].category_id, r.isCorrect, r.userAnswer, 0)
    // 覆盖式写入，避免「上一题」返回后重复提交导致结果被重复计入
    setResults(prev => {
      const next = [...prev]
      next[index] = { correct: r.isCorrect }
      return next
    })
    r.isCorrect ? playCorrect() : playIncorrect()
    if (navigator.vibrate) navigator.vibrate(r.isCorrect ? 25 : 80)
  }, [option, questions, index, displays])

  useEffect(() => {
    if (qTimeLeft === 0 && phase === 'practice' && perQuestionTimer && !done && questions.length > 0) {
      submit()
    }
  }, [qTimeLeft, phase, perQuestionTimer, done, questions.length, submit])

  useEffect(() => () => clearInterval(timerRef.current), [])

  const next = () => {
    clearInterval(timerRef.current)
    if (index + 1 >= questions.length) {
      setPhase('finished')
      const elapsed = Math.round((Date.now() - startedAt.current) / 1000)
      saveSession({ type: 'practice', categoryId: selectedCategoryId ? +selectedCategoryId : null, total: questions.length, correct, timeSpent: elapsed, score: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0, items: results.map((r, i) => ({ questionId: questions[i]?.id, isCorrect: r.correct })) })
      playComplete()
      persistAndRefresh().catch(() => {})
    } else {
      setIndex(i => i + 1)
      setOption(null)
      setDone(false)
      setResult(null)
      if (perQuestionTimer) { setQTimeLeft(timePerQ); startTimer(timePerQ) }
    }
  }

  // 移动端左右滑切题
  const touchStartX = useRef(0)
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      if (diff > 0) {
        if (index < questions.length - 1) { setIndex(i => i + 1); setOption(null); setDone(false); setResult(null) }
      } else {
        if (index > 0) { setIndex(i => i - 1); setOption(null); setDone(false); setResult(null) }
      }
    }
  }

  const correct = useMemo(() => results.filter(r => r && r.correct).length, [results])
  const elapsed = useMemo(() =>
    startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0,
    [phase]
  )

  if (phase === 'setup') {
    return (
      <div>
        <div className="page-header">
          <h1>答题练习</h1>
          <p>选择题库和题量，开始练习</p>
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
              <label>题型筛选</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">全部题型</option>
                <option value="单选题">单选题</option>
                <option value="多选题">多选题</option>
                <option value="判断题">判断题</option>
              </select>
            </div>
            <div className="form-group">
              <label>单题倒计时</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={perQuestionTimer}
                  onChange={e => setPerQuestionTimer(e.target.checked)} />
                <span style={{ fontSize: '14px' }}>开启</span>
                {perQuestionTimer && (
                  <select value={timePerQ} onChange={e => setTimePerQ(+e.target.value)}
                    style={{ width: 'auto', padding: '6px 10px' }}>
                    {[30, 45, 60, 90, 120].map(s => (
                      <option key={s} value={s}>{s} 秒</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>难度筛选</label>
              <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}>
                <option value="">全部难度</option>
                <option value="易">易</option>
                <option value="偏易">偏易</option>
                <option value="适中">适中</option>
                <option value="偏难">偏难</option>
                <option value="难">难</option>
              </select>
            </div>
            <div className="form-group">
              <label>标签筛选</label>
              <select value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">全部</option>
                {selectedCategoryId && getAllTags().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>题目数量</label>
            <select value={questionCount} onChange={e => setQuestionCount(+e.target.value)}>
              {[10, 20, 30, 50, 100].map(n => (
                <option key={n} value={n}>{n} 题</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginRight: '8px' }}
                checked={optionShuffle} onChange={e => setOptionShuffle(e.target.checked)} />
              选项乱序
            </label>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '22px' }}>
              打乱 ABCD 顺序，防止死记位置
            </p>
          </div>
          <button className="btn btn-primary btn-large" style={{ width: '100%' }}
            onClick={begin} disabled={!selectedCategoryId}>
            开始练习
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'finished') {
    const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0
    const msg = pct >= 80 ? '表现优秀！' : pct >= 60 ? '继续加油！' : '需要更多练习'
    return (
      <div>
        <div className="page-header"><h1>练习完成</h1></div>
        <div className="question-card practice-result">
          <div className="result-score">{correct}/{questions.length}</div>
          <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '28px' }}>{msg}</div>
          <div className="result-details">
            <div className="result-detail-item">
              <div className="detail-value">{pct}%</div>
              <div className="detail-label">正确率</div>
            </div>
            <div className="result-detail-item">
              <div className="detail-value">{Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒</div>
              <div className="detail-label">用时</div>
            </div>
            <div className="result-detail-item">
              <div className="detail-value">{questions.length - correct}</div>
              <div className="detail-label">错题</div>
            </div>
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={() => setPhase('setup')}>再来一组</button>
            <button className="btn btn-outline" onClick={() => navigate('/wrongbook')}>错题本</button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>返回首页</button>
          </div>
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>答题练习</h1>
        <button className="btn btn-outline" onClick={() => setFocusMode(f => !f)}>
          {focusMode ? '退出专注' : '专注模式'}
        </button>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-info">
        <span>{index + 1} / {questions.length} 题</span>
        {perQuestionTimer && (
          <span style={{ color: qTimeLeft <= 10 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: qTimeLeft <= 10 ? 600 : 400 }}>
            ⏱ {qTimeLeft}s
          </span>
        )}
        <span>正确 {correct} 题</span>
      </div>

      <div className="question-card" style={{ marginBottom: '0' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
            } else if (idx === option) {
              cls += ' selected'
            }
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
            <button className="btn btn-primary btn-large" onClick={submit} disabled={option === null}>
              提交答案
            </button>
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

      {/* Fixed bottom action bar */}
      <div className="practice-fixed-bar">
        <button className="btn btn-outline" onClick={() => { setIndex(i => Math.max(0, i - 1)); setOption(null); setDone(false); setResult(null) }}
          disabled={index === 0 && !done}>
          上一题
        </button>
        {!done ? (
          <button className="btn btn-primary" onClick={submit} disabled={option === null}>
            提交答案
          </button>
        ) : (
          <button className="btn btn-primary" onClick={next}>
            {index < questions.length - 1 ? '下一题' : '查看结果'}
          </button>
        )}
      </div>
    </div>
  )
}
