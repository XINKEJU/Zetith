import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getStreak, getTodayCount, getLevelInfo } from '../db/database'

export default function HomePage() {
  const navigate = useNavigate()
  const { categories, stats, wrongCount, persistAndRefresh } = useApp()
  
  const [dailyGoal, setDailyGoal] = useState(() => {
    const v = parseInt(localStorage.getItem('dailyGoal') || '50')
    return isNaN(v) || v <= 0 ? 50 : v
  })
  
  const streak = useMemo(() => { try { return getStreak() } catch { return { streak: 0, todayDone: false } } }, [stats])
  const todayCount = useMemo(() => { try { return getTodayCount() } catch { return 0 } }, [stats])
  const levelInfo = useMemo(() => { try { return getLevelInfo() } catch { return { level: '新手', color: '#b0b0b6', xp: 0, nextXp: 100, pct: 0 } } }, [stats])

  const handleSetGoal = () => {
    const val = prompt('设置每日答题目标（题）:', dailyGoal)
    if (val && parseInt(val) > 0) {
      setDailyGoal(parseInt(val))
      localStorage.setItem('dailyGoal', val)
    }
  }
  
  const goalPct = Math.min(100, Math.round((todayCount / dailyGoal) * 100))
  const goalDone = todayCount >= dailyGoal

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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--accent-light)', borderRadius: '16px',
            padding: '6px 14px', fontWeight: 800, fontSize: '14px',
            color: 'var(--duo-green-dark)'
          }}>
            ⚡ {levelInfo.xp} XP
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleSetGoal} title="设置每日目标">
            🎯 {dailyGoal}
          </button>
          <button className="btn btn-outline btn-sm" onClick={persistAndRefresh} title="刷新数据">
            🔄
          </button>
        </div>
      </div>

      {/* Streak + XP card */}
      <div style={{ marginBottom: '24px' }}>
        <div className="card" style={{ 
          padding: '20px 28px', 
          border: goalDone ? '3px solid var(--duo-green)' : '2px solid var(--border-light)',
          background: goalDone ? 'var(--green-light)' : 'var(--bg-card)',
          borderBottomWidth: goalDone ? '6px' : '4px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '16px',
                background: goalDone 
                  ? 'linear-gradient(135deg, var(--duo-green), var(--duo-green-dark))' 
                  : 'var(--bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px',
                boxShadow: goalDone ? '0 3px 0 var(--duo-green-shadow)' : 'none',
                animation: streak.streak > 0 ? 'pulse 2s ease-in-out infinite' : 'none'
              }}>
                {goalDone ? '🔥' : '💤'}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800 }}>
                  {streak.streak > 0 ? `连续学习 ${streak.streak} 天` : '今天还没有学习'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {goalDone ? '🔥 今日目标已达成！太棒了！' : `今日进度 ${todayCount}/${dailyGoal} 题`}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                {levelInfo.level}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: levelInfo.color }}>
                {levelInfo.pct}%
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                距下一级
              </div>
            </div>
          </div>
          {!goalDone && (
            <div style={{ height: '10px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginTop: '14px' }}>
              <div style={{
                width: `${goalPct}%`, height: '100%',
                background: goalPct > 60 ? 'linear-gradient(90deg, var(--duo-green), var(--duo-blue))' : 'linear-gradient(90deg, var(--duo-orange), var(--duo-gold))',
                borderRadius: '10px', transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }} />
            </div>
          )}
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--duo-green)' }}>{stats.total.toLocaleString()}</div>
          <div className="stat-label">总答题数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: stats.rate >= 60 ? 'var(--duo-green)' : 'var(--duo-orange)' }}>{stats.rate}%</div>
          <div className="stat-label">正确率</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--duo-blue)' }}>{totalQuestions.toLocaleString()}</div>
          <div className="stat-label">题库总题数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: wrongCount > 0 ? 'var(--duo-red)' : 'var(--duo-green)' }}>
            {wrongCount}
          </div>
          <div className="stat-label">待复习错题</div>
        </div>
      </div>

        {difficultySummary && (
          <div className="card" style={{ 
            display: 'flex', alignItems: 'center', gap: '12px', 
            padding: '16px 24px', marginBottom: '24px',
            background: 'var(--accent-light)', border: 'none',
            borderRadius: '16px', borderBottom: '4px solid var(--duo-green)'
          }}>
            <span style={{ fontSize: '24px' }}>💡</span>
            <span style={{ fontSize: '14px', color: 'var(--duo-green-dark)', fontWeight: 800 }}>
              {difficultySummary.text}
            </span>
          </div>
        )}

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '14px', fontWeight: 800 }}>快捷操作</h3>
        <div className="quick-actions">
          <QuickAction
            label="📖" iconBg="#E5F8D3" title="浏览学习"
            desc={categories.length > 0 ? '选择题库，按顺序或随机浏览题目' : '还没有题库'}
            disabled={categories.length === 0}
            onClick={() => {
              if (categories.length > 0) navigate(`/study/${categories[0].id}`)
            }}
          />
          <QuickAction
            label="✏️" iconBg="#E3F2FD" title="答题练习"
            desc="自选题库与题量，即时判题反馈"
            disabled={totalQuestions === 0}
            onClick={() => navigate('/practice')}
          />
          <QuickAction
            label="🏆" iconBg="#FFE5E5" title="模拟考试"
            desc="倒计时、自动交卷、成绩分析"
            disabled={totalQuestions === 0}
            onClick={() => navigate('/exam')}
          />
          <QuickAction
            label="🧠" iconBg="#F3E5F5" title="智能复习"
            desc="基于间隔重复算法的科学复习"
            onClick={() => navigate('/review')}
          />
          <QuickAction
            label="📝" iconBg="#FFF0DA" title="错题本"
            desc={wrongCount > 0 ? `${wrongCount} 道错题待复习` : '暂无错题'}
            onClick={() => navigate('/wrongbook')}
          />
          <QuickAction
            label="📊" iconBg="#E5F8D3" title="学习统计"
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
