import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ToastProvider } from './components/ToastProvider'
import Layout from './components/Layout'

const HomePage = lazy(() => import('./pages/HomePage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const StudyPage = lazy(() => import('./pages/StudyPage'))
const PracticePage = lazy(() => import('./pages/PracticePage'))
const ExamPage = lazy(() => import('./pages/ExamPage'))
const WrongBookPage = lazy(() => import('./pages/WrongBookPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const CardStudyPage = lazy(() => import('./pages/CardStudyPage'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'var(--accent)', animation: 'pulse 0.8s ease infinite'
      }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
      <Layout>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/study/:categoryId" element={<StudyPage />} />
          <Route path="/cards" element={<CardStudyPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/wrongbook" element={<WrongBookPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>
      </ToastProvider>
    </AppProvider>
  )
}
