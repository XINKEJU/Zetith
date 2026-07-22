import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastProvider'
import {
  getAdaptiveQuestions, getDueReviewQuestions, getWrongQuestionsNotMastered, getReviewSchedule
} from '../db/database'
import { setSmartSet } from '../services/smartStudy'

export default function SmartStudyPage() {
  const { categories } = useApp()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [categoryId, setCategoryId] = useState('')
  const [count, setCount] = useState(20)
  const [dueCount, setDueCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [schedule, setSchedule] = useState([])

  useEffect(() => {
    const cat = categoryId ? +categoryId : null
    try {
      setDueCount(getDueReviewQuestions(cat).length)
      setWrongCount(getWrongQuestionsNotMastered(cat).length)
      setSchedule(getReviewSchedule(7))
    } catch {}
  }, [categoryId])

  const start = (mode) => {
    const cat = categoryId ? +categoryId : null
    let questions = []
    let label = ''
    try {
      if (mode === 'adaptive') { questions = getAdaptiveQuestions(cat, count); label = '自适应薄弱点练习' }
      else if (mode === 'review') { questions = getDueReviewQuestions(cat); label = '间隔复习' }
      else if (mode === 'wrong') { questions = getWrongQuestionsNotMastered(cat, count); label = '错题重练' }
    } catch (e) {
      addToast('生成题目失败: ' + (e?.message || e), 'error')
      return
    }
    if (!questions.length) {
      addToast('暂无符合条件的题目，换个范围试试', 'warning')
      return
    }
    setSmartSet(questions, { label, categoryId: cat })
    navigate('/practice?smart=1')
  }

  const modes = [
    {
      key: 'adaptive', icon: '🎯', title: '自适应薄弱点',
      desc: '按遗忘曲线与历史正确率，优先推送你最易错的题，把时间花在刀刃上。',
      badge: '智能', badgeType: 'primary'
    },
    {
      key: 'review', icon: '🔁', title: '间隔复习',
      desc: '只练今天到期的复习题（SM-2 排程），巩固记忆临界点的内容。',
      badge: dueCount + ' 题待复习', badgeType: 'accent'
    },
    {
      key: 'wrong', icon: '❌', title: '错题重练',
      desc: '从历史错题中抽题重练，直至掌握后自动移出，形成闭环。',
      badge: wrongCount + ' 题未掌握', badgeType: 'warn'
    }
  ]

  return (
    <div>
      <div className="page-header">
        <h1>智能练习</h1>
        <p>让算法替你安排今天该练什么</p>
      </div>

      {/* 复习排程概览 */}
      <div className="smart-schedule">
        <div className="smart-schedule-title">未来 7 天复习排程</div>
        <div className="smart-schedule-days">
          {schedule.map((s, i) => (
            <div key={i} className={'smart-day' + (s.isToday ? ' is-today' : '') + (s.due > 0 ? ' has-due' : '')}>
              <div className="smart-day-label">{i === 0 ? '今天' : i === 1 ? '明天' : s.day.slice(5)}</div>
              <div className="smart-day-count">{s.due}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="smart-grid">
        {modes.map(m => (
          <div key={m.key} className="smart-card">
            <div className="smart-card-head">
              <span className="smart-card-icon">{m.icon}</span>
              <span className={'smart-badge badge-' + m.badgeType}>{m.badge}</span>
            </div>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => start(m.key)}>
              开始{m.title}
            </button>
          </div>
        ))}
      </div>

      <div className="practice-setup" style={{ marginTop: '28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label>选择题库（留空＝全部）</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">全部题库</option>
              {categories.filter(c => c.question_count > 0).map(c => (
                <option key={c.id} value={c.id}>{c.name}（{c.question_count} 题）</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>每组题量</label>
            <select value={count} onChange={e => setCount(+e.target.value)}>
              {[10, 20, 30, 50, 100].map(n => (
                <option key={n} value={n}>{n} 题</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          题量对「自适应薄弱点」与「错题重练」生效；「间隔复习」按实际到期数出题。
        </p>
        <button className="btn btn-outline" style={{ width: '100%', marginTop: '8px' }}
          onClick={() => navigate('/stats')}>
          查看学习洞察 →
        </button>
      </div>
    </div>
  )
}
