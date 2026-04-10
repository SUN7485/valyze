import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import ProcessingPage from './pages/ProcessingPage'
import EditorPage from './pages/EditorPage'
import GeneratingPage from './pages/GeneratingPage'
import DonePage from './pages/DonePage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/processing/:reportId" element={<ProcessingPage />} />
        <Route path="/editor/:reportId" element={<EditorPage />} />
        <Route path="/generating/:reportId" element={<GeneratingPage />} />
        <Route path="/done/:reportId" element={<DonePage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}
