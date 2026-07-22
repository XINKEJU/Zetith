import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ToastProvider } from './components/ToastProvider'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import AuthModal from './components/AuthModal'

const HomePage = lazy(() => import('./pages/HomePage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const StudyPage = lazy(() => import('./pages/StudyPage'))
const PracticePage = lazy(() => import('./pages/PracticePage'))
const ExamPage = lazy(() => import('./pages/ExamPage'))
const WrongBookPage = lazy(() => import('./pages/WrongBookPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const SmartStudyPage = lazy(() => import('./pages/SmartStudyPage'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const CardStudyPage = lazy(() => import('./pages/CardStudyPage'))
const DailyPage = lazy(() => import('./pages/DailyPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'var(--accent)', animation: 'loaderPulse 0.8s ease infinite'
      }} />
      <style>{`@keyframes loaderPulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()

  // 监听桌面端菜单栏动作，导航到对应页面或触发功能
  useEffect(() => {
    if (!window.electronAPI?.onMenu) return
    const off = window.electronAPI.onMenu((payload) => {
      if (!payload) return
      if (payload.type === 'navigate') {
        navigate(payload.path || '/')
      } else if (payload.type === 'theme') {
        window.electronAPI?.setThemeSource(payload.source)
        localStorage.setItem('themeSource', payload.source)
        window.dispatchEvent(new CustomEvent('app:theme-system', { detail: payload.source }))
      } else if (payload.type === 'action') {
        // 记下待处理动作，待题库管理页挂载后消费；同时派发事件供已在该页时即时响应
        window.__pendingMenuAction = payload.name
        window.dispatchEvent(new CustomEvent('app:' + payload.name))
        navigate('/categories')
      }
    })
    return off
  }, [navigate])

  return (
    <AppProvider>
      <ToastProvider>
      <ErrorBoundary>
      <Layout>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/study/:categoryId" element={<StudyPage />} />
          <Route path="/cards" element={<CardStudyPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/smart" element={<SmartStudyPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/wrongbook" element={<WrongBookPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>
      </ErrorBoundary>
      <AuthModal />
      </ToastProvider>
    </AppProvider>
  )
}
