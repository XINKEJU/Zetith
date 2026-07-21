import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getDailyStats, getStreak, getTodayCount } from '../db/database'

export default function HomePage() {
  const navigate = useNavigate()
  const { categories, stats, wrongCount, persistAndRefresh } = useApp()
  
  const [dailyGoal, setDailyGoal] = useState(() => {
    return parseInt(localStorage.getItem('dailyGoal') || '50')
  })
  
  const streak = useMemo(() => { try { return getStreak() } catch { return { streak: 0, todayDone: false } } }, [stats])
  const todayCount = useMemo(() => { try { return getTodayCount() } catch { return 0 } }, [stats])
  
  const handleSetGoal = () => {
    const val = prompt('设置每日答题目标（题）:', dailyGoal)
    if (val && parseInt(val) > 0) {
      setDailyGoal(parseInt(val))
      localStorage.setItem('dailyGoal', val)
    }
  }
  
  const goalPct = Math.min(100, Math.round((todayCount / dailyGoal) * 100))
  const goalDone = todayCount >= dailyGoal

  const dailyStats = useMemo(() => {
    try { return getDailyStats(7) } catch { return [] }
  }, [categories, stats])

  // Find categories with recent activity (based on updated_at)
  const recentCategories = useMemo(() => {
    return categories.filter(c => c.question_count > 0).slice(0, 6)
  }, [categories])

  const totalQuestions = useMemo(() => 
    categories.reduce((s, c) => s + c.question_count, 0),
    [categories]
  )

  const difficultySummary = useMemo(() => {
    if (stats.total === 0) return null
    const rate = stats.rate
    if (rate >= 80) return { text: '正确率优秀，继续保持', color: 'var(--green)' }
    if (rate >= 60) return { text: '正确率良好，还有提升空间', color: 'var(--accent)' }
    return { text: '需要加强练习，建议多复习错题', color: 'var(--amber)' }
  }, [stats])

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>学习仪表盘</h1>
          <p>欢迎回来，准备好今天的学习了吗？</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={handleSetGoal} 
            style={{ fontSize: '12px' }} title="设置每日目标">
            目标 {dailyGoal} 题
          </button>
          <button className="btn btn-outline" onClick={persistAndRefresh} style={{ fontSize: '12px' }} title="刷新数据">
            刷新
          </button>
        </div>
      </div>

      {/* Daily goal + streak */}
      <div style={{ marginBottom: '24px' }}>
        <div className="card" style={{ padding: '18px 24px', border: goalDone ? '1px solid var(--green)' : '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: goalDone ? '0' : '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: goalDone ? 'var(--green-light)' : 'var(--accent-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: 700,
                color: goalDone ? 'var(--green)' : 'var(--accent)'
              }}>
                {streak.streak > 0 ? streak.streak : '0'}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {streak.streak > 0 ? `连续学习 ${streak.streak} 天` : '今天还没有学习'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {goalDone ? '今日目标已达成！' : `今日进度 ${todayCount}/${dailyGoal} 题`}
                </div>
              </div>
            </div>
            {!goalDone && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{goalPct}%</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>目标进度</div>
              </div>
            )}
            {goalDone && (
              <div style={{ fontSize: '13px', color: 'var(--green)', fontWeight: 600 }}>已完成</div>
            )}
          </div>
          {!goalDone && (
            <div style={{ height: '5px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{
                width: `${goalPct}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--accent), var(--accent-dark))',
                borderRadius: '10px', transition: 'width 0.5s ease'
              }} />
            </div>
          )}
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">总答题数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.rate}%</div>
          <div className="stat-label">正确率</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalQuestions.toLocaleString()}</div>
          <div className="stat-label">题库总题数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: wrongCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {wrongCount}
          </div>
          <div className="stat-label">待复习错题</div>
        </div>
      </div>

        {difficultySummary && (
          <div className="card" style={{ 
            display: 'flex', alignItems: 'center', gap: '12px', 
            padding: '14px 24px', marginBottom: '24px',
            background: 'var(--accent-light)', border: 'none'
          }}>
            <span style={{ fontSize: '13px', color: 'var(--accent-dark)', fontWeight: 520 }}>
              {difficultySummary.text}
            </span>
          </div>
        )}

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>快捷操作</h3>
        <div className="quick-actions">
          <QuickAction
            label="Re" iconBg="var(--accent-light)" title="浏览学习"
            desc={categories.length > 0 ? '选择题库，按顺序或随机浏览题目' : '还没有题库'}
            disabled={categories.length === 0}
            onClick={() => {
              if (categories.length > 0) navigate(`/study/${categories[0].id}`)
            }}
          />
          <QuickAction
            label="Pr" iconBg="var(--green-light)" title="答题练习"
            desc="自选题库与题量，即时判题反馈"
            disabled={totalQuestions === 0}
            onClick={() => navigate('/practice')}
          />
          <QuickAction
            label="Ex" iconBg="var(--red-light)" title="模拟考试"
            desc="倒计时、自动交卷、成绩分析"
            disabled={totalQuestions === 0}
            onClick={() => navigate('/exam')}
          />
          <QuickAction
            label="Rv" iconBg="var(--amber-light)" title="智能复习"
            desc="基于间隔重复算法的科学复习"
            onClick={() => navigate('/review')}
          />
          <QuickAction
            label="Wr" iconBg="var(--red-light)" title="错题本"
            desc={wrongCount > 0 ? `${wrongCount} 道错题待复习` : '暂无错题'}
            onClick={() => navigate('/wrongbook')}
          />
          <QuickAction
            label="St" iconBg="var(--green-light)" title="学习统计"
            desc="正确率趋势、弱项诊断"
            onClick={() => navigate('/stats')}
          />
        </div>
      </div>

      {recentCategories.length > 0 && (
        <div>
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>题库列表</h3>
          <div className="card-grid">
            {recentCategories.map(cat => (
              <div
                key={cat.id}
                className="category-card"
                onClick={() => navigate(`/study/${cat.id}`)}
              >
                <h3 style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat.name}
                </h3>
                <div className="category-meta">
                  <span>📝 {cat.question_count} 题</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {categories.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>欢迎使用智能题库学习系统</h3>
          <p>前往「题库管理」导入 Excel 题库文件，开始你的学习之旅</p>
          <button
            className="btn btn-primary btn-large"
            style={{ marginTop: '16px' }}
            onClick={() => navigate('/categories')}
          >
            去导入题库
          </button>
        </div>
      )}
    </div>
  )
}

function QuickAction({ label, iconBg, title, desc, onClick, disabled }) {
  return (
    <div
      className="quick-action-card"
      onClick={disabled ? undefined : onClick}
      style={disabled ? { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
    >
      <div className="action-icon" style={{ background: iconBg, color: 'var(--text)', fontSize: '15px', fontWeight: 700 }}>
        {label}
      </div>
      <div className="action-info">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  )
}
