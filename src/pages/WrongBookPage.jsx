import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getWrongQuestions, getQuestionById, saveStudyRecord, markQuestionMastered, markWrongReason } from '../db/database'
import { prepareQuestionForDisplay, checkAnswer } from '../services/studyService'
import { useToast } from '../components/ToastProvider'

const WRONG_REASONS = ['概念模糊', '审题不清', '记忆混淆', '计算失误', '知识盲区']

export default function WrongBookPage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()
  const { addToast, confirm } = useToast()
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [practicingId, setPracticingId] = useState(null)
  const [practiceQuestion, setPracticeQuestion] = useState(null)
  const [displayQuestion, setDisplayQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [answerResult, setAnswerResult] = useState(null)

  const wrongQuestions = useMemo(() => {
    return getWrongQuestions(filterCategoryId ? parseInt(filterCategoryId) : null)
  }, [filterCategoryId, refreshKey])

  const startPracticeQuestion = (questionId) => {
    const q = getQuestionById(questionId)
    if (!q) return
    const d = prepareQuestionForDisplay(q, true)
    setPracticingId(questionId)
    setPracticeQuestion(q)
    setDisplayQuestion(d)
    setSelectedOption(null)
    setSubmitted(false)
    setAnswerResult(null)
  }

  const handleSubmit = () => {
    if (selectedOption === null) return
    const result = checkAnswer(practiceQuestion, selectedOption, displayQuestion.shuffleMap)
    setAnswerResult(result)
    setSubmitted(true)
    saveStudyRecord(practiceQuestion.id, practiceQuestion.category_id, result.isCorrect, result.userAnswer, 0)
    persistAndRefresh().catch(() => {})
    setRefreshKey(k => k + 1)
  }

  const handleBack = () => {
    setPracticingId(null)
    setPracticeQuestion(null)
    setDisplayQuestion(null)
  }

  if (practicingId && displayQuestion) {
    return (
      <div>
        <div className="page-header">
          <h1>错题复习</h1>
        </div>

        <div className="question-card">
          <div className="question-meta">
            <span className="question-badge badge-type">{displayQuestion.question_type}</span>
            <span className="question-badge badge-difficulty">{displayQuestion.difficulty}</span>
          </div>

          <div className="question-stem">
            {displayQuestion.stem}
          </div>

          <div className="options-list">
            {displayQuestion.displayOptions.map((opt, idx) => {
              let optionClass = 'option-item'
              if (submitted) {
                const letters = ['A', 'B', 'C', 'D']
                const originalLetter = letters[displayQuestion.shuffleMap[idx]]
                if (originalLetter === answerResult?.correctAnswer || opt.text === answerResult?.correctAnswer) {
                  optionClass += ' correct'
                } else if (idx === selectedOption && !answerResult?.isCorrect) {
                  optionClass += ' wrong'
                }
              } else if (idx === selectedOption) {
                optionClass += ' selected'
              }
              return (
                <div
                  key={idx}
                  className={optionClass}
                  onClick={() => !submitted && setSelectedOption(idx)}
                >
                  <span className="option-letter">{opt.key}</span>
                  <span className="option-text">{opt.text}</span>
                </div>
              )
            })}
          </div>

          {!submitted ? (
            <div style={{ textAlign: 'center' }}>
              <button
                className="btn btn-primary btn-large"
                onClick={handleSubmit}
                disabled={selectedOption === null}
              >
                提交答案
              </button>
            </div>
          ) : (
            <div>
              <div className={`explanation-box ${answerResult?.isCorrect ? 'correct-box' : 'wrong-box'}`}>
                <h4>{answerResult?.isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}</h4>
                <p>正确答案：<strong>{answerResult?.correctAnswer}</strong></p>
                {practiceQuestion.explanation && (
                  <p style={{ marginTop: '8px' }}>{practiceQuestion.explanation}</p>
                )}
              </div>
              {!answerResult?.isCorrect && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>错因标记：</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {WRONG_REASONS.map(reason => (
                      <button key={reason} className="btn btn-outline btn-sm"
                        style={{ fontSize: '11px' }}
                        onClick={() => {
                          markWrongReason(practiceQuestion.id, reason)
                          addToast(`已标记: ${reason}`, 'info')
                        }}>
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="action-bar">
                <button className="btn btn-primary" onClick={handleBack}>返回列表</button>
                <button className="btn btn-success" onClick={async () => {
                  const ok = await confirm('确定这道题已经彻底掌握了吗？', '彻底掌握')
                  if (ok) {
                    markQuestionMastered(practiceQuestion.id)
                    persistAndRefresh().catch(() => {})
                    setRefreshKey(k => k + 1)
                    addToast('已掌握，从错题本移除', 'success')
                    handleBack()
                  }
                }}>✅ 彻底掌握</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>错题本</h1>
        <p>所有答错的题目都在这里，按错误次数排序</p>
      </div>

      <div className="filter-bar">
        <select
          value={filterCategoryId}
          onChange={e => setFilterCategoryId(e.target.value)}
        >
          <option value="">全部题库</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          共 {wrongQuestions.length} 道错题
        </span>
      </div>

      {wrongQuestions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <h3>没有错题</h3>
          <p>太棒了，继续保持！去练习几道题吧</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => navigate('/practice')}
          >
            去练习
          </button>
        </div>
      ) : (
        <div className="card">
          {wrongQuestions.map(q => (
            <div key={q.id} className="wrong-item">
              <div className="wrong-stem" onClick={() => startPracticeQuestion(q.id)}>
                [{q.question_type}] {q.stem}
              </div>
              <div className="wrong-count">✕{q.wrong_count}</div>
              <div className="wrong-time">{q.last_wrong_time?.slice(0, 16) || ''}</div>
              <button className="btn btn-success" style={{ fontSize: '11px', padding: '3px 10px', marginLeft: '10px', whiteSpace: 'nowrap' }}
                onClick={async (e) => {
                  e.stopPropagation()
                  const ok = await confirm('确定这道题已经彻底掌握了吗？将从错题本中移除。', '彻底掌握')
                  if (ok) {
                    markQuestionMastered(q.id)
                    persistAndRefresh().catch(() => {})
                    setRefreshKey(k => k + 1)
                    addToast('已从错题本移除', 'success')
                  }
                }}>
                ✅ 掌握
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
