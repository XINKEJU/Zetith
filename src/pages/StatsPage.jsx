import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend, PointElement, LineElement,
} from 'chart.js'
import { useApp } from '../context/AppContext'
import { getDailyStats, getReviewStats, getIndividualTagStats, getQuestionTypeStats } from '../db/database'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend, PointElement, LineElement
)

export default function StatsPage() {
  const navigate = useNavigate()
  const { categories, stats } = useApp()

  const dailyStats = useMemo(() => { try { return getDailyStats(14) } catch { return [] } }, [stats])
  const reviewStats = useMemo(() => { try { return getReviewStats() } catch { return { total: 0, due: 0, mastered: 0 } } }, [stats])
  const tagStats = useMemo(() => { try { return getIndividualTagStats() } catch { return [] } }, [stats])
  const typeStats = useMemo(() => { try { return getQuestionTypeStats() } catch { return [] } }, [stats])

  const totalQuestions = useMemo(() => categories.reduce((s, c) => s + c.question_count, 0), [categories])
  const learningDays = useMemo(() => { try { return getDailyStats(365).length } catch { return 0 } }, [stats])

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px', marginBottom: '20px' }}>
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

      {/* 题库概览 */}
      <div className="card" style={{ marginBottom: '0' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>题库总览</h3>
        <table>
          <thead>
            <tr>
              <th>题库名称</th><th style={{ textAlign: 'right' }}>题目数</th>
              <th style={{ textAlign: 'right' }}>已学</th><th style={{ textAlign: 'right' }}>进度</th>
            </tr>
          </thead>
          <tbody>
            {categories.slice(0, 20).map(cat => {
              const attempted = Math.min(cat.question_count, Math.floor(Math.random() * 0 + /* placeholder */ 0))
              return (
                <tr key={cat.id}>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                    {cat.name}
                  </td>
                  <td style={{ textAlign: 'right' }}>{cat.question_count}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>-</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-light)' }}>-</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
