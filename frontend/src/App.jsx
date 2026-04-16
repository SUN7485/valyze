import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))
const ProcessingPage = lazy(() => import('./pages/ProcessingPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const GeneratingPage = lazy(() => import('./pages/GeneratingPage'))
const DonePage = lazy(() => import('./pages/DonePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/processing/:reportId" element={<ProcessingPage />} />
          <Route path="/editor/:reportId" element={<EditorPage />} />
          <Route path="/generating/:reportId" element={<GeneratingPage />} />
          <Route path="/done/:reportId" element={<DonePage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
