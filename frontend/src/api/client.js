import axios from 'axios'

// Determine API base URL from env, with localhost fallback
function getBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl) {
    return envUrl.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
    return 'http://localhost:8000'
  }
  const msg = '[API] VITE_API_BASE_URL is not set. API calls will fail. Set it in your .env or Vercel environment variables.'
  if (import.meta.env.DEV) {
    console.warn(msg, '\nFalling back to http://localhost:8000 for local dev only.')
    return 'http://localhost:8000'
  }
  throw new Error(msg)
}

const API_BASE = getBaseUrl() + '/api'

// Create axios instance with proper configuration
const api = axios.create({
    baseURL: API_BASE,
    timeout: 1200000,  // 20 minutes for AI operations
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor - attach JWT token + logging
api.interceptors.request.use(config => {
    const token = localStorage.getItem('valyze_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
    return config
})

// Response interceptor for error handling
api.interceptors.response.use(
    response => response,
    error => {
        const msg = error.response?.data?.detail
            || error.message
            || 'Unknown error'
        console.error('[API Error]', msg, error.response?.status)
        return Promise.reject(new Error(msg))
    }
)

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export const authAPI = {
    login: (email, password) =>
        api.post('/auth/login', { email, password }),

    me: () =>
        api.get('/auth/me'),

    verify: () =>
        api.post('/auth/verify'),
}

// ---------------------------------------------------------------------------
// Users API
// ---------------------------------------------------------------------------

export const usersAPI = {
    getAll: () =>
        api.get('/auth/users'),

    create: (data) =>
        api.post('/auth/users', data),

    update: (id, data) =>
        api.patch(`/auth/users/${id}`, data),

    delete: (id) =>
        api.delete(`/auth/users/${id}`),
}

// ---------------------------------------------------------------------------
// Clients API
// ---------------------------------------------------------------------------


export const clientsAPI = {
    getAll: (search = '') =>
        api.get('/clients/', { params: { search } }),

    getOne: (id) =>
        api.get(`/clients/${id}`),

    create: (data) =>
        api.post('/clients/', data),

    update: (id, data) =>
        api.patch(`/clients/${id}`, data),

    delete: (id) =>
        api.delete(`/clients/${id}`),

    generatePortalLink: (id, opts = {}) =>
        api.post(`/clients/${id}/generate-portal-link`, opts),

    getSessions: (id) =>
        api.get(`/clients/${id}/sessions`),

    revokeSession: (sessionId) =>
        api.delete(`/clients/sessions/${sessionId}`),
}

// ---------------------------------------------------------------------------
// Orders API
// ---------------------------------------------------------------------------

export const ordersAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams()
        if (filters.status && filters.status !== 'all') params.set('status', filters.status)
        if (filters.analyst && filters.analyst !== 'all') params.set('analyst', filters.analyst)
        return api.get('/orders/', { params })
    },

    getAllOrderCompanies: (filters = {}) => {
        const params = new URLSearchParams()
        if (filters.status && filters.status !== 'all') params.set('status', filters.status)
        if (filters.country) params.set('country', filters.country)
        if (filters.search) params.set('search', filters.search)
        return api.get('/orders/companies/', { params })
    },

    getOne: (id) =>
        api.get(`/orders/${id}`),

    update: (id, data) =>
        api.patch(`/orders/${id}`, data),

    updateCompany: (orderId, companyId, data) =>
        api.patch(`/orders/${orderId}/companies/${companyId}`, data),

    startCompany: (orderId, companyId) =>
        api.post(`/orders/${orderId}/companies/${companyId}/start`),

    completeCompany: (orderId, companyId) =>
        api.post(`/orders/${orderId}/companies/${companyId}/complete`),

    reassign: (orderId, analyst) =>
        api.post(`/orders/${orderId}/reassign`, { analyst }),

    reassignCompany: (orderId, companyId, analyst) =>
        api.post(`/orders/${orderId}/reassign-company/${companyId}`, { analyst }),

    cancel: (orderId) =>
        api.post(`/orders/${orderId}/cancel`),
}

// ---------------------------------------------------------------------------
// Reports API
// ---------------------------------------------------------------------------

export const reportAPI = {

    // -- Upload ----------------------------------

    startReport: (data) =>
        api.post('/upload/start', data),

    uploadFiles: (reportId, files) => {
        const formData = new FormData()
        files.forEach(file =>
            formData.append('files', file)
        )
        return api.post(
            `/upload/files/${reportId}`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        )
    },

    getUploadStatus: (reportId) =>
        api.get(`/upload/status/${reportId}`),

    deleteFile: (reportId, filename) =>
        api.delete(`/upload/file/${reportId}/${filename}`),

    // -- Extraction ------------------------------

    startExtraction: (reportId) =>
        api.post(`/extract/start/${reportId}`),

    getExtractionProgress: (reportId) =>
        api.get(`/extract/progress/${reportId}`),

    getExtractedFields: (reportId) =>
        api.get(`/extract/fields/${reportId}`),

    // -- Report CRUD -----------------------------

    getReport: (reportId) =>
        api.get(`/report/${reportId}`),

    updateField: (reportId, fieldName, value) =>
        api.patch(`/report/${reportId}/field`, {
            field_name: fieldName,
            value: value,
            source: 'user'
        }),

    updateFieldsBulk: (reportId, fields) =>
        api.patch(`/report/${reportId}/fields`, {
            fields: fields
        }),

    updateArray: (reportId, arrayName, data) =>
        api.patch(`/report/${reportId}/array`, {
            array_name: arrayName,
            data: data
        }),

    recalculate: (reportId) =>
        api.post(`/report/${reportId}/recalculate`),

    getAllReports: () =>
        api.get('/report/'),

    deleteReport: (reportId) =>
        api.delete(`/report/${reportId}`),

    // -- Generation ------------------------------

    generateNarratives: (reportId) =>
        api.post(`/generate/narratives/${reportId}`),

    getGenerationProgress: (reportId) =>
        api.get(`/generate/progress/${reportId}`),

    regenerateSection: (reportId, sections) =>
        api.post(`/generate/regenerate/${reportId}`, {
            sections: sections
        }),

    // -- Easy Way Import -------------------------
    easyWayImport: (reportId, data) =>
        api.post(`/report/${reportId}/easy-way`, data),

    // -- PDF -------------------------------------

    generatePDF: (reportId) =>
        api.post(`/pdf/generate/${reportId}`),

    getPDFStatus: (reportId) =>
        api.get(`/pdf/status/${reportId}`),

    getPreviewURL: (reportId) =>
        `${API_BASE}/pdf/preview/${reportId}`,

    getDownloadURL: (reportId) =>
        `${API_BASE}/pdf/download/${reportId}`,

    // -- Export -----------------------------------

    exportJSON: (reportId, opts) =>
        api.post(`/export/json/${reportId}`, null, opts),

    exportXML: (reportId, opts) =>
        api.post(`/export/xml/${reportId}`, null, opts),

    exportExcel: (reportId, opts) =>
        api.post(`/export/excel/${reportId}`, null, opts),

    exportCSV: (reportId, opts) =>
        api.post(`/export/csv/${reportId}`, null, opts),

    exportWord: (reportId, opts) =>
        api.post(`/export/word/${reportId}`, null, opts),

    getExportStatus: (reportId) =>
        api.get(`/export/status/${reportId}`),

    getExportDownloadURL: (reportId, format) =>
        `${API_BASE}/export/download/${reportId}/${format}`,

    // -- Cloud / Supabase ------------------------

    saveToCloud: (reportId) =>
        api.post(`/cloud/save/${reportId}`),

    getCloudStatus: (reportId) =>
        api.get(`/cloud/status/${reportId}`),

    getReports: () =>
        api.get('/search/reports'),

    deleteCloudReport: (reportId) =>
        api.delete(`/cloud/${reportId}`),

    // -- Local Reports
    getLocalReports: (skip = 0, limit = 50, status = null, search = null) => {
        const params = new URLSearchParams()
        params.append('skip', skip)
        params.append('limit', limit)
        if (status) params.append('status', status)
        if (search) params.append('search', search)
        return api.get(`/search/local?${params}`)
    },

    getLocalReportsCount: () =>
        api.get('/search/local/count'),

    deleteLocalReport: (reportId) =>
        api.delete(`/search/local/${reportId}`),

    // -- Combined Reports (Cloud + Local)
    getAllReportsCombined: (skip = 0, limit = 100, search = null, country = null) => {
        const params = new URLSearchParams()
        params.append('skip', skip)
        params.append('limit', limit)
        if (search) params.append('search', search)
        if (country) params.append('country', country)
        return api.get(`/search/all?${params}`)
    },

    // -- Output Files
    getOutputReports: (search = null) => {
        const params = new URLSearchParams()
        if (search) params.append('search', search)
        return api.get(`/search/output?${params}`)
    },

    deleteOutputReport: (reportId) =>
        api.delete(`/search/output/${reportId}`),

    // -- Duplicate Detection
    checkDuplicate: (crNumber, companyName) =>
        api.post('/upload/check-duplicate', {
            cr_number: crNumber,
            company_name: companyName
        }),
}

export const invoicesAPI = {
    generate: (orderId) =>
        api.post(`/invoices/generate/${orderId}`),

    getAll: (filters = {}) => {
        const params = new URLSearchParams()
        if (filters.status) params.append('status', filters.status)
        if (filters.client_id) params.append('client_id', filters.client_id)
        return api.get('/invoices/', { params })
    },

    getOne: (id) =>
        api.get(`/invoices/${id}`),

    update: (id, data) =>
        api.patch(`/invoices/${id}`, data),

    updateStatus: (id, status) =>
        api.patch(`/invoices/${id}/status`, { status }),

    getHtml: (id) =>
        api.get(`/invoices/${id}/html`, {
            responseType: 'text'
        }),
}

export default api
