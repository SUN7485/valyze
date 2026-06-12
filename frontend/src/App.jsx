import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'

// Lazy load pages
const LoginPage = lazy(() => import('./pages/LoginPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))
const ProcessingPage = lazy(() => import('./pages/ProcessingPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const GeneratingPage = lazy(() => import('./pages/GeneratingPage'))
const DonePage = lazy(() => import('./pages/DonePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'))
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'))
const ExtractorPage = lazy(() => import('./pages/ExtractorPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

// Loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

// Protected route wrapper — redirects to /login if not authenticated
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes (require login) */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
        <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
        <Route path="/clients/:clientId" element={<ProtectedRoute><ClientDetailPage /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
        <Route path="/invoices/:invoiceId" element={<ProtectedRoute><InvoiceDetailPage /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
        <Route path="/processing/:reportId" element={<ProtectedRoute><ProcessingPage /></ProtectedRoute>} />
        <Route path="/editor/:reportId" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="/generating/:reportId" element={<ProtectedRoute><GeneratingPage /></ProtectedRoute>} />
        <Route path="/done/:reportId" element={<ProtectedRoute><DonePage /></ProtectedRoute>} />
        <Route path="/extractor" element={<ProtectedRoute><ExtractorPage /></ProtectedRoute>} />
        <Route path="/extractor/:reportId" element={<ProtectedRoute><ExtractorPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </AuthProvider>
  )
}