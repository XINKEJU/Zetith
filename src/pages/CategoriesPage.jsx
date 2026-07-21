import React, { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastProvider'
import { importFromFiles, parseExcelFile } from '../services/importService'
import { deleteCategory, getCategoryProgress, clearAllData, removeDuplicatesInCategory, exportAllToJSON, exportCategoryToJSON, backupDatabase, restoreDatabase } from '../db/database'
import { exportCategoryToDocx } from '../services/exportService'

export default function CategoriesPage() {
  const navigate = useNavigate()
  const { categories, persistAndRefresh } = useApp()
  const { addToast, confirm } = useToast()
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewFiles, setPreviewFiles] = useState(null)
  const [importResults, setImportResults] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const categoryProgress = useMemo(() => {
    const progress = {}
    for (const cat of categories) {
      try { progress[cat.id] = getCategoryProgress(cat.id) } catch { progress[cat.id] = { total: 0, attempted: 0, correct: 0 } }
    }
    return progress
  }, [categories])

  const handleImport = async (files) => {
    if (files.length === 0) return
    
    setPreviewFiles(files)
    try {
      const firstFile = files[0]
      const arrayBuffer = await firstFile.arrayBuffer()
      const parsed = parseExcelFile(arrayBuffer, firstFile.name)
      if (parsed.length > 0 && parsed[0].questions.length > 0) {
        setPreview({
          fileName: firstFile.name,
          sheetName: parsed[0].sheetName,
          headers: parsed[0].headers,
          sample: parsed[0].questions.slice(0, 5),
          totalQuestions: parsed[0].questions.length,
          skipCount: parsed[0].skipCount,
          totalFiles: files.length
        })
      }
    } catch (err) {
      addToast('预览失败: ' + err.message, 'error')
    }
  }

  const handleConfirmImport = async () => {
    if (!previewFiles) return
    setPreview(null)
    setImporting(true)
    setImportResults(null)
    try {
      const result = await importFromFiles(previewFiles)
      setImportResults(result)
      await persistAndRefresh().catch(() => {})
      addToast(`成功导入 ${result.totalImported} 道题目`, 'success')
    } catch (err) {
      setImportResults({ error: err.message })
      addToast('导入失败: ' + err.message, 'error')
    } finally {
      setImporting(false)
      setPreviewFiles(null)
    }
  }

  const handleExportAll = () => {
    const data = exportAllToJSON()
    downloadJSON(data, '题库导出')
  }

  const handleExportCategory = (e, catId) => {
    e.stopPropagation()
    const data = exportCategoryToJSON(catId)
    if (data) downloadJSON(data, data.category?.name || '题库')
  }

  const downloadJSON = (data, name) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
    addToast('导出成功', 'success')
  }

  const downloadTemplate = () => {
    const a = document.createElement('a')
    a.href = '/template.xlsx'
    a.download = '题库导入模板.xlsx'
    a.click()
    addToast('模板下载中...', 'info')
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = () => {
    setDragActive(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.match(/\.(xlsx|xls)$/i)
    )
    handleImport(files)
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>题库管理</h1>
          <p>管理你的所有题库，支持导入 Excel 文件</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {categories.length > 0 && (
            <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={async () => {
              const ok = await confirm('确定要清空所有题库和学习记录吗？此操作不可撤销。', '清空全部数据')
              if (ok) {
                clearAllData().then(() => persistAndRefresh().catch(() => {}))
              }
            }}>
              清空
            </button>
          )}
          {categories.length > 0 && (<>
          <button className="btn btn-outline" onClick={handleExportAll}>
            导出 JSON
          </button>
          <button className="btn btn-outline" onClick={() => {
            if (categories.length === 0) return
            const catId = prompt('输入要导出 Word 的题库 ID（可查看下方卡片）:', categories[0]?.id)
            const numId = parseInt(catId)
            if (!isNaN(numId) && numId > 0) exportCategoryToDocx(numId).then(() => addToast('Word 导出成功', 'success'))
          }}>
            导出 Word
          </button>
          <button className="btn btn-outline" onClick={async () => {
            const ok = await confirm('将检测并移除所有题库中的重复题目（保留最早的一条）。确定继续？', '试题去重')
            if (ok) {
              let totalRemoved = 0
              for (const cat of categories) {
                totalRemoved += removeDuplicatesInCategory(cat.id)
              }
              persistAndRefresh().catch(() => {})
              addToast(`已移除 ${totalRemoved} 道重复题目`, 'success')
            }
          }}>
            去重
          </button>
          <button className="btn btn-outline" onClick={() => backupDatabase().catch(e => addToast('备份失败: ' + e.message, 'error'))}>
            备份数据
          </button>
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            恢复数据
            <input type="file" accept=".db" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files[0]
                if (!file) return
                const ok = await confirm('恢复数据将覆盖当前所有内容，确定继续？', '恢复数据')
                if (ok) {
                  try { await restoreDatabase(file) }
                  catch (err) { addToast('恢复失败: ' + err.message, 'error') }
                }
                e.target.value = ''
              }}
            />
          </label>
          </>)}
          <button className="btn btn-outline" onClick={downloadTemplate}>
            下载模板
          </button>
          <button className="btn btn-primary btn-large" onClick={() => setShowImport(true)}>
            导入题库
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>还没有题库</h3>
          <p>点击"导入题库"按钮，选择 Excel 文件开始学习</p>
          <button
            className="btn btn-primary btn-large"
            style={{ marginTop: '16px' }}
            onClick={() => setShowImport(true)}
          >
            导入题库
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {categories.map(cat => {
            const progress = categoryProgress[cat.id]
            const pct = progress.total > 0 ? Math.round((progress.attempted / progress.total) * 100) : 0
            const correctPct = progress.attempted > 0 ? Math.round((progress.correct / progress.attempted) * 100) : 0
            return (
            <div
              key={cat.id}
              className="category-card"
              onClick={() => navigate(`/study/${cat.id}`)}
            >
              <button
                className="delete-btn"
                onClick={async (e) => {
                  e.stopPropagation()
                  const ok = await confirm(`确定要删除题库"${cat.name}"吗？所有题目和学习记录将被清空。`, '删除题库')
                  if (ok) {
                    deleteCategory(cat.id)
                    persistAndRefresh().catch(() => {})
                  }
                }}
                title="删除题库"
              >
                ✕
              </button>
              <h3>{cat.name}</h3>
              <div className="category-meta" style={{ marginBottom: progress.attempted > 0 ? '12px' : '0' }}>
                <span>📝 {cat.question_count} 题</span>
                {progress.attempted > 0 && (
                  <span>✅ {correctPct}% 正确率</span>
                )}
              </div>
              {progress.attempted > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                      已学 {progress.attempted}/{progress.total}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--primary)' : 'var(--warning)',
                      borderRadius: '2px', transition: 'width 0.4s'
                    }} />
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>
      )}

      {showImport && (
        <div className="modal-overlay" onClick={() => !importing && setShowImport(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>导入题库</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              支持 .xlsx / .xls 格式的 Excel 文件。系统会自动识别列名并映射字段。
              文件名将作为题库名称。
            </p>

            {!importing && !importResults && !preview && (
              <div
                className={`drop-zone ${dragActive ? 'active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="drop-icon">Files</div>
                <p>拖拽 Excel 文件到此处，或点击选择文件</p>
                <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-light)' }}>
                  支持同时选择多个文件
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleImport(Array.from(e.target.files))}
                />
              </div>
            )}

            {preview && (
              <div>
                <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                  <strong>{preview.fileName}</strong>
                  {preview.totalFiles > 1 && <span> 等 {preview.totalFiles} 个文件</span>}
                </div>
                <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  共解析 {preview.totalQuestions} 题，以下为前 5 题预览：
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                  <table style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {preview.headers.slice(0, 5).map(h => (
                          <th key={h} style={{ padding: '6px 8px', background: 'var(--bg)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((q, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.question_type}</td>
                          <td style={{ padding: '6px 8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.stem}</td>
                          <td style={{ padding: '6px 8px' }}>{q.answer}</td>
                          <td style={{ padding: '6px 8px' }}>{q.difficulty}</td>
                          <td style={{ padding: '6px 8px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.tags}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => { setPreview(null); setPreviewFiles(null) }}>取消</button>
                  <button className="btn btn-primary" onClick={handleConfirmImport}>确认导入</button>
                </div>
              </div>
            )}

            {importing && (
              <div className="loading">正在导入题库，请稍候...</div>
            )}

            {importResults && (
              <div className="import-progress">
                {importResults.error ? (
                  <div className="import-result error">
                    导入失败：{importResults.error}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                      <strong>导入完成：</strong>
                      成功导入 {importResults.totalImported} 道题目，跳过 {importResults.totalSkipped} 行，
                      {importResults.totalErrors > 0 && ` ${importResults.totalErrors} 个文件失败`}
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {importResults.results.map((r, i) => (
                        <div key={i} className={`import-result ${r.error ? 'error' : 'success'}`}>
                          {r.error
                            ? `❌ ${r.fileName}: ${r.error}`
                            : `✅ ${r.categoryName}: ${r.imported} 题`
                          }
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ marginTop: '16px', textAlign: 'right' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setShowImport(false)
                      setImportResults(null)
                    }}
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
