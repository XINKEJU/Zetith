import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { saveStudyRecord, getFilteredRandomQuestions, getAllTags } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer } from '../services/studyService'

export default function PracticePage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()

  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [questionCount, setQuestionCount] = useState(20)
  const [optionShuffle, setOptionShuffle] = useState(true)
  const [filterTag, setFilterTag] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')

  const [phase, setPhase] = useState('setup')
  const [questions, setQuestions] = useState([])
  const [displays, setDisplays] = useState([])
  const [index, setIndex] = useState(0)
  const [option, setOption] = useState(null)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)
  const [results, setResults] = useState([])
  const startedAt = React.useRef(null)

  const begin = () => {
    if (!selectedCategoryId) return
    const qs = getFilteredRandomQuestions(+selectedCategoryId, questionCount, {
      tag: filterTag || undefined,
      difficulty: filterDifficulty || undefined
    })
    if (!qs.length) return
    const ds = qs.map(q => prepareQuestionForDisplay(q, optionShuffle))
    setQuestions(qs)
    setDisplays(ds)
    setIndex(0)
    setOption(null)
    setDone(false)
    setResult(null)
    setResults([])
    startedAt.current = Date.now()
    setPhase('practice')
  }

  const submit = () => {
    if (option === null) return
    const r = checkAnswer(questions[index], option, displays[index].shuffleMap)
    setResult(r)
    setDone(true)
    saveStudyRecord(questions[index].id, questions[index].category_id, r.isCorrect, r.userAnswer, 0)
    setResults(prev => [...prev, { correct: r.isCorrect }])
  }

  const next = () => {
    if (index + 1 >= questions.length) {
      setPhase('finished')
      persistAndRefresh()
    } else {
      setIndex(i => i + 1)
      setOption(null)
      setDone(false)
      setResult(null)
    }
  }

  const correct = useMemo(() => results.filter(r => r.correct).length, [results])
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
              <label>标签筛选</label>
              <select value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">全部</option>
                {selectedCategoryId && getAllTags().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>难度筛选</label>
              <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}>
                <option value="">全部</option>
                {['易','偏易','适中','偏难','难'].map(d => (
                  <option key={d} value={d}>{d}</option>
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
      <div className="page-header"><h1>答题练习</h1></div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-info">
        <span>{index + 1} / {questions.length} 题</span>
        <span>正确 {correct} 题</span>
      </div>

      <div className="question-card">
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
              if (letter === result?.correctAnswer) cls += ' correct'
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
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-primary btn-large" onClick={submit} disabled={option === null}>
              提交答案
            </button>
          </div>
        ) : (
          <div>
            <div className={`explanation-box ${result?.isCorrect ? 'correct-box' : 'wrong-box'}`}>
              <h4>{result?.isCorrect ? '正确' : '错误'} — 答案：{result?.correctAnswer}</h4>
              {q.explanation && <p style={{ marginTop: '8px' }}>{q.explanation}</p>}
            </div>
            <div className="action-bar">
              <button className="btn btn-primary" onClick={next}>
                {index < questions.length - 1 ? '下一题' : '查看结果'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
