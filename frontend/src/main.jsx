import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ReportProvider } from './context/ReportContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

ReactDOM.createRoot(
  document.getElementById('root')
).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ReportProvider>
          <App />
        </ReportProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
