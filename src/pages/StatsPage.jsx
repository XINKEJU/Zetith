import { useMemo, memo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend
} from 'chart.js'
import { useApp } from '../context/AppContext'
import { getDailyStats, getIndividualTagStats, getQuestionTypeStats, getCategoryProgress, getDailyHeatmap, getLearningDaysCount } from '../db/database'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend
)

function Heatmap({ data }) {
  const today = new Date()
  const months = []
  for (let m = 0; m < 7; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1)
    months.unshift({ year: d.getFullYear(), month: d.getMonth() })
  }
  const dayMap = {}
  data.forEach(d => { dayMap[d.day] = d.count })

  const maxCount = Math.max(1, ...data.map(d => d.count))
  const getColor = (count) => {
    if (!count) return 'var(--border-light)'
    const pct = count / maxCount
    if (pct > 0.7) return 'var(--accent)'
    if (pct > 0.4) return 'var(--accent-dark)'
    return 'var(--accent-light)'
  }

  const dayNames = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '4px', paddingTop: '18px' }}>
        {dayNames.map((d, i) => (
          <div key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', height: '12px', lineHeight: '12px', textAlign: 'right' }}>
            {i % 2 === 0 ? d : ''}
          </div>
        ))}
      </div>
      {months.map(({ year, month }) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const firstDay = new Date(year, month, 1).getDay()
        const offset = firstDay === 0 ? 6 : firstDay - 1
        const weeks = Math.ceil((daysInMonth + offset) / 7)
        return (
          <div key={`${year}-${month}`}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textAlign: 'center' }}>
              {month + 1}月
            </div>
            <div style={{ display: 'grid', gridTemplateRows: `repeat(7, 12px)`, gridAutoFlow: 'column', gap: '3px' }}>
              {Array.from({ length: offset }, (_, i) => (
                <div key={`e${i}`} style={{ width: '12px', height: '12px', borderRadius: '3px' }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const count = dayMap[dateStr] || 0
                return (
                  <div key={day}
                    style={{
                      width: '12px', height: '12px', borderRadius: '3px',
                      background: getColor(count),
                      cursor: 'pointer'
                    }}
                    title={`${dateStr}: ${count} 题`}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingBottom: '2px' }}>
        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--border-light)' }} />
        <span>少</span>
        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent)' }} />
        <span>多</span>
      </div>
    </div>
  )
}

export default function StatsPage() {
  const { categories, stats } = useApp()

  const dailyStats = useMemo(() => { try { return getDailyStats(14) } catch { return [] } }, [stats])
  const tagStats = useMemo(() => { try { return getIndividualTagStats() } catch { return [] } }, [stats])
  const typeStats = useMemo(() => { try { return getQuestionTypeStats() } catch { return [] } }, [stats])

  const totalQuestions = useMemo(() => categories.reduce((s, c) => s + c.question_count, 0), [categories])
  const learningDays = useMemo(() => { try { return getLearningDaysCount(365) } catch { return 0 } }, [stats])

  const categoryProgress = useMemo(() => {
    const progress = {}
    for (const cat of categories) {
      try { progress[cat.id] = getCategoryProgress(cat.id) } catch { progress[cat.id] = { total: 0, attempted: 0, correct: 0 } }
    }
    return progress
  }, [categories, stats])

  const heatmapData = useMemo(() => {
    try { return getDailyHeatmap(210) } catch { return [] }
  }, [stats])

  const dailyChartData = {
    labels: dailyStats.map(d => d.day.slice(5)),
    datasets: [{
      data: dailyStats.map(d => d.rate),
      backgroundColor: dailyStats.map(d => d.rate >= 60 ? '#6b9b7f' : '#d4786e'),
      borderRadius: 6,
      barThickness: 16
    }]
  }

  const typeChartData = typeStats.length > 0 ? {
    labels: typeStats.map(t => t.type),
    datasets: [{
      data: typeStats.map(t => t.count),
      backgroundColor: ['#6b9b7f', '#d4a857', '#7b9bc0', '#c0907b', '#8ba88b'],
      borderWidth: 0
    }]
  } : null

  const weakTags = tagStats.filter(t => t.rate < 60).slice(0, 8)
  const strongTags = tagStats.filter(t => t.rate >= 80).slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <h1>学习统计</h1>
        <p>你的学习数据分析与弱项诊断</p>
      </div>

      <div className="stat-cards">
        <StatCard value={stats.total.toLocaleString()} label="总答题数" />
        <StatCard value={`${stats.rate}%`} label="总正确率" color={stats.rate >= 60 ? 'var(--primary)' : 'var(--danger)'} />
        <StatCard value={learningDays} label="学习天数" />
        <StatCard value={totalQuestions.toLocaleString()} label="题库总题数" />
      </div>

      <div className="stats-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>每日正确率趋势（近14天）</h3>
          {dailyStats.length > 0 ? (
            <div style={{ height: '220px' }}>
              <Bar data={dailyChartData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
              }} />
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '50px 20px' }}><p>暂无练习数据</p></div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>题型分布</h3>
          {typeChartData ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '200px', height: '200px' }}>
                <Doughnut data={typeChartData} options={{
                  responsive: true,
                  plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } } }
                }} />
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '50px 20px' }}><p>暂无数据</p></div>
          )}
        </div>
      </div>

      {/* 弱项诊断 */}
      {tagStats.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px' }}>
            🔍 知识点弱项诊断
          </h3>
          
          {weakTags.length > 0 && (
            <div className="card" style={{ marginBottom: '14px', borderLeft: '3px solid var(--danger)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--danger)', marginBottom: '12px' }}>
                ⚠️ 需要加强的知识点（正确率 &lt; 60%）
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {weakTags.map(t => (
                  <div key={t.tag} style={{
                    background: 'var(--danger-light)', borderRadius: '10px',
                    padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px'
                  }}>
                    <span style={{ fontWeight: 500 }}>{t.tag}</span>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t.rate}%</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>({t.total}题)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {strongTags.length > 0 && (
            <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)', marginBottom: '12px' }}>
                ✅ 掌握良好的知识点（正确率 ≥ 80%）
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {strongTags.map(t => (
                  <div key={t.tag} style={{
                    background: 'var(--success-light)', borderRadius: '10px',
                    padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px'
                  }}>
                    <span style={{ fontWeight: 500 }}>{t.tag}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {tagStats.length === 0 && stats.total > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>🔍 弱项诊断</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            题目缺少标签信息，暂时无法进行知识点分析。建议在 Excel 题库中为题目添加标签列。
          </p>
        </div>
      )}

      {/* 学习热力图 */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>学习热力图</h3>
        <Heatmap data={heatmapData} />
      </div>

      {/* 题库概览 */}
      <div className="card" style={{ marginBottom: '0' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>题库总览</h3>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>题库名称</th><th style={{ textAlign: 'right' }}>题目数</th>
              <th style={{ textAlign: 'right' }}>已学</th><th style={{ textAlign: 'right' }}>进度</th>
            </tr>
          </thead>
          <tbody>
            {categories.slice(0, 20).map(cat => {
              const prog = categoryProgress[cat.id] || { total: 0, attempted: 0, correct: 0 }
              const attempted = prog.attempted
              const pct = cat.question_count > 0 ? Math.round((attempted / cat.question_count) * 100) : 0
              return (
                <tr key={cat.id}>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                    {cat.name}
                  </td>
                  <td style={{ textAlign: 'right' }}>{cat.question_count}</td>
                  <td style={{ textAlign: 'right' }}>{attempted || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{cat.question_count > 0 ? `${pct}%` : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

const StatCard = memo(function StatCard({ value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
})
