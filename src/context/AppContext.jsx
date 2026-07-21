import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { initDatabase, getAllCategories, getStudyStats, getWrongQuestions, saveDatabase } from '../db/database'

const AppContext = createContext(null)
const isDev = import.meta.env.DEV

export function useApp() {
  return useContext(AppContext)
}

export function AppProvider({ children }) {
  const [dbReady, setDbReady] = useState(false)
  const [initProgress, setInitProgress] = useState(0)
  const [initMessage, setInitMessage] = useState('正在加载数据库引擎...')
  const [initPhase, setInitPhase] = useState('wasm') // wasm | download | done
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState({ total: 0, correct: 0, rate: 0 })
  const [wrongCount, setWrongCount] = useState(0)

  const refreshData = useCallback(() => {
    if (!dbReady) return
    try {
      setCategories(getAllCategories())
      setStats(getStudyStats())
      const wrong = getWrongQuestions()
      setWrongCount(wrong.length)
    } catch (e) {
      if (isDev) console.error('Refresh data error:', e)
    }
  }, [dbReady])

  useEffect(() => {
    setInitPhase('wasm')
    setInitMessage('正在加载数据库引擎...')
    
    initDatabase((percent) => {
      setInitPhase('download')
      setInitMessage(`正在下载题库数据...`)
      setInitProgress(percent)
    })
      .then(() => {
        setInitPhase('done')
        setDbReady(true)
      })
      .catch(err => {
        if (isDev) console.error('Database init failed:', err)
        setInitMessage('初始化失败，请刷新页面重试')
      })
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const persistAndRefresh = useCallback(async () => {
    await saveDatabase()
    refreshData()
  }, [refreshData])

  return (
    <AppContext.Provider value={{
      dbReady,
      initProgress,
      initPhase,
      initMessage,
      categories,
      stats,
      wrongCount,
      refreshData,
      persistAndRefresh
    }}>
      {children}
    </AppContext.Provider>
  )
}
