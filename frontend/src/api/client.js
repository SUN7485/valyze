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

// Backend origin (no /api suffix) — for the few callers that use fetch() directly
// (the Anthropic proxy, binary downloads) instead of the axios instance.
export const API_ROOT = getBaseUrl()
const API_BASE = API_ROOT + '/api'

// Every localStorage key that belongs to the signed-in user. Cleared on logout and
// whenever the session turns out to be dead, so the next person on a shared
// workstation inherits none of it (the Anthropic key above all).
export const USER_STORAGE_KEYS = [
    'valyze_token',
    'valyze_api_key',
    'valyze_pending_import',
    'valyze_order_summary',
    'current_report_id',
]

export function clearUserStorage() {
    for (const key of USER_STORAGE_KEYS) {
        try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
    }
    try {
        // Per-report QA runs cached by QAPage.
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i)
            if (key && key.startsWith('valyze_qa_')) sessionStorage.removeItem(key)
        }
    } catch { /* storage unavailable */ }
}

// A 401 from any staff endpoint means the session is gone (expired, revoked, or
// the user was deleted). AuthContext subscribes and sends the user to /login.
const unauthorizedListeners = new Set()
export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener)
    return () => unauthorizedListeners.delete(listener)
}

// Create axios instance with proper configuration
const api = axios.create({
    baseURL: API_BASE,
    timeout: 1200000,  // 20 minutes for AI operations
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor - attach JWT token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('valyze_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// FastAPI's `detail` is a string, a pydantic error list, or (409 conflicts) an object.
function detailToMessage(detail) {
    if (!detail) return ''
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
        return detail.map(item => (typeof item === 'string' ? item : item?.msg || JSON.stringify(item))).join(' ')
    }
    if (typeof detail === 'object') return detail.message || detail.error || JSON.stringify(detail)
    return String(detail)
}

// Response interceptor. The rejected error keeps `.status`, `.response` and
// `.detail` so callers can branch on 403/404/409 — replacing it with a bare
// `new Error(msg)` made every `e.response?.status` check in the app dead code.
api.interceptors.response.use(
    response => response,
    async error => {
        const response = error.response
        let data = response?.data
        // Blob/text downloads deliver their error body as a Blob — read it so the
        // server's detail reaches the user instead of "status code 404".
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
            try {
                const text = await data.text()
                try { data = JSON.parse(text) } catch { data = { detail: text } }
            } catch { /* keep the blob */ }
        }
        const detail = data?.detail
        const status = response?.status
        const err = new Error(detailToMessage(detail) || error.message || 'Unknown error')
        err.status = status
        err.response = response ? { ...response, data } : undefined
        err.detail = detail
        err.code = error.code
        err.config = error.config
        if (axios.isCancel(error)) err.name = 'CanceledError'
        console.error('[API Error]', err.message, status)

        const url = error.config?.url || ''
        if (status === 401 && !url.includes('/auth/login')) {
            unauthorizedListeners.forEach(listener => {
                try { listener(err) } catch { /* a listener must not break the caller */ }
            })
        }
        return Promise.reject(err)
    }
)

// ---------------------------------------------------------------------------
// Raw-URL access (window.open / link.href) for PDF previews and downloads.
// Those requests cannot carry an Authorization header, so the backend accepts a
// short-lived, single-purpose "link" token in `?token=`. The login JWT itself is
// never put in a URL (it would land in logs, history and copied links).
// ---------------------------------------------------------------------------

export async function linkUrl(url) {
    const res = await api.post('/auth/link-token')
    const token = res.data?.token
    if (!token) throw new Error('Could not obtain a download link — please try again.')
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

// Open an authenticated raw URL in a new tab. The tab is opened synchronously —
// inside the click — because a window.open() issued after an await has lost the
// user gesture and is eaten by the pop-up blocker.
export async function openAuthenticatedUrl(url) {
    const w = window.open('', '_blank')
    if (!w) throw new Error('Please allow pop-ups for this site to open the preview.')
    try {
        w.document.title = 'Loading…'
        w.document.body.textContent = 'Loading…'
    } catch { /* cosmetic only */ }
    try {
        const target = await linkUrl(url)
        // The opened page is server-rendered on another origin; it gets no handle on this tab.
        w.opener = null
        w.location.href = target
    } catch (e) {
        w.close()
        throw e
    }
}

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

    // Returns { new_password } — shown once; the server never stores the plaintext.
    resetSessionPassword: (sessionId) =>
        api.post(`/clients/sessions/${sessionId}/reset-password`),
}

// ---------------------------------------------------------------------------
// Orders API
// ---------------------------------------------------------------------------

export const ordersAPI = {
    // Assignable staff for the analyst dropdowns -> { analysts: [{ email, name, role }] }
    getAnalysts: () =>
        api.get('/orders/analysts'),

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

    // Focused single report (one order_company) for the Orders page
    getCompany: (companyId) =>
        api.get(`/orders/companies/${companyId}`),

    deleteCompany: (companyId) =>
        api.delete(`/orders/companies/${companyId}`),

    getOne: (id) =>
        api.get(`/orders/${id}`),

    update: (id, data) =>
        api.patch(`/orders/${id}`, data),

    // Alias for update — used by the focused-report service-level editor.
    updateOrder: (id, data) =>
        api.patch(`/orders/${id}`, data),

    delete: (id) =>
        api.delete(`/orders/${id}`),

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

    downloadOrder: (orderId) =>
        api.get(`/orders/${orderId}/download`, { responseType: 'blob' }),

    // Signed, short-lived Storage URLs per file — for orders too large to ZIP
    // in one serverless response (the ZIP endpoint answers 413).
    // -> { order_id, files: [{ id, order_company_id, filename, file_size, url, expires_in }] }
    getFileLinks: (orderId) =>
        api.get(`/orders/${orderId}/files`),

    // Order details document — HTML (converted to PDF client-side via print) or Word (.doc)
    getOrderDocumentHtml: (orderId) =>
        api.get(`/orders/${orderId}/document`, { params: { format: 'html' }, responseType: 'text' }),

    getOrderDocumentDoc: (orderId) =>
        api.get(`/orders/${orderId}/document`, { params: { format: 'doc' }, responseType: 'blob' }),
}

// ---------------------------------------------------------------------------
// Search API (existing reports in the database)
// ---------------------------------------------------------------------------

export const searchAPI = {
    // GET /api/search/?company_name=...&cr_number=... -> { total, reports }
    search: (params = {}) =>
        api.get('/search/', { params }),
}

// ---------------------------------------------------------------------------
// Reports API
// ---------------------------------------------------------------------------

export const reportAPI = {

    // -- Upload ----------------------------------

    // Creates an empty report seeded with the order details -> { report_id }
    startReport: (data) =>
        api.post('/upload/start', data),

    deleteFile: (reportId, filename) =>
        api.delete(`/upload/file/${encodeURIComponent(reportId)}/${encodeURIComponent(filename)}`),

    // -- Report CRUD -----------------------------
    // Every edit sends `last_known_updated_at` (the report's updated_at as this
    // browser last saw it). The server answers 409 if someone else saved since.

    getReport: (reportId) =>
        api.get(`/report/${reportId}`),

    updateField: (reportId, fieldName, value, lastKnownUpdatedAt) =>
        api.patch(`/report/${reportId}/field`, {
            field_name: fieldName,
            value: value,
            source: 'user',
            ...(lastKnownUpdatedAt ? { last_known_updated_at: lastKnownUpdatedAt } : {}),
        }),

    updateFieldsBulk: (reportId, fields, lastKnownUpdatedAt) =>
        api.patch(`/report/${reportId}/fields`, {
            fields: fields,
            ...(lastKnownUpdatedAt ? { last_known_updated_at: lastKnownUpdatedAt } : {}),
        }),

    updateArray: (reportId, arrayName, data, lastKnownUpdatedAt) =>
        api.patch(`/report/${reportId}/array`, {
            array_name: arrayName,
            data: data,
            ...(lastKnownUpdatedAt ? { last_known_updated_at: lastKnownUpdatedAt } : {}),
        }),

    recalculate: (reportId) =>
        api.post(`/report/${reportId}/recalculate`),

    // Admin only.
    deleteReport: (reportId) =>
        api.delete(`/report/${reportId}`),

    // -- Easy Way Import -------------------------
    easyWayImport: (reportId, data) =>
        api.post(`/report/${reportId}/easy-way`, data),

    // -- PDF -------------------------------------
    // The PDF is produced in the browser (print → Save as PDF) from server HTML.

    generatePDF: (reportId) =>
        api.post(`/pdf/generate/${reportId}`),

    // -> { can_generate, report_status, ... }
    getPDFStatus: (reportId) =>
        api.get(`/pdf/status/${reportId}`),

    // Opens the rendered report in a new tab (raw URL, short-lived link token).
    openPreview: (reportId) =>
        openAuthenticatedUrl(`${API_BASE}/pdf/preview/${encodeURIComponent(reportId)}`),

    // -- Export -----------------------------------
    // The POST response IS the file (JSON/XML/CSV as a blob, Excel/Word as base64).

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

    // -- Report list ------------------------------
    getAllReportsCombined: (skip = 0, limit = 100, search = null, country = null) => {
        const params = new URLSearchParams()
        params.append('skip', skip)
        params.append('limit', limit)
        if (search) params.append('search', search)
        if (country) params.append('country', country)
        return api.get(`/search/all?${params}`)
    },

    // -- Duplicate Detection
    checkDuplicate: (crNumber, companyName) =>
        api.post('/upload/check-duplicate', {
            cr_number: crNumber,
            company_name: companyName
        }),
}

const EXPORT_MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
}

// Run one export and save the file it returns. Shared by the Editor and the
// Reports list so both download exactly what the POST endpoint produced.
export async function downloadReportExport(reportId, format, baseName = 'CreditReport') {
    const call = {
        json: reportAPI.exportJSON,
        xml: reportAPI.exportXML,
        xlsx: reportAPI.exportExcel,
        csv: reportAPI.exportCSV,
        docx: reportAPI.exportWord,
    }[format]
    if (!call) throw new Error(`Unsupported export format "${format}"`)

    // Excel/Word return JSON with base64; JSON/XML/CSV return the file content.
    const res = await call(reportId, {
        responseType: (format === 'xlsx' || format === 'docx') ? 'json' : 'blob',
    })

    let blob, filename
    if (res.data?.base64) {
        const binary = atob(res.data.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        blob = new Blob([bytes], { type: EXPORT_MIME[format] || 'application/octet-stream' })
        filename = res.data.filename || `${baseName}.${format}`
    } else {
        blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: EXPORT_MIME[format] })
        filename = `${baseName}.${format}`
    }
    saveBlob(blob, filename)
}

export function saveBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

// Download an order's client submission as a ZIP. Large orders do not fit in one
// serverless response (413): then return the per-file signed links instead, for
// the page to offer (OrderFileLinksModal). Returns null when the ZIP was saved.
export async function downloadOrderSubmission(orderId, filename) {
    try {
        const res = await ordersAPI.downloadOrder(orderId)
        saveBlob(new Blob([res.data], { type: 'application/zip' }), filename)
        return null
    } catch (e) {
        if (e.status !== 413) throw e
        const links = await ordersAPI.getFileLinks(orderId)
        return links.data?.files || []
    }
}

// "Save Locally": the report as JSON, straight from what the browser already holds.
export function downloadReportJson(report, baseName = 'CreditReport') {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    saveBlob(blob, `${baseName}.json`)
}

// ---------------------------------------------------------------------------
// Company Intelligence API (de-duplicated view over all reports + orders)
// ---------------------------------------------------------------------------

export const companiesAPI = {
    // De-duplicated company list — one row per distinct company.
    search: (q = '') =>
        api.get('/companies/search', { params: { q } }),

    // "Do we already have this company?" — full dossier for one company.
    lookup: ({ company_name, cr_number, country } = {}) =>
        api.get('/companies/lookup', { params: { company_name, cr_number, country } }),
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

// ---------------------------------------------------------------------------
// Delivery API — QA verdicts and the admin send queue
// ---------------------------------------------------------------------------

export const deliveryAPI = {

    // Any analyst may record a QA outcome for a report they worked on.
    saveQaVerdict: (reportId, body) =>
        api.patch(`/delivery/qa/${reportId}`, body),

    // Admin only — completed reports that have not been delivered yet.
    getQueue: () =>
        api.get('/delivery/queue'),

    // Admin only — why is a page empty? Counts only, no report content.
    diagnose: () =>
        api.get('/delivery/diagnose'),

    // Admin only — QA findings + invoice for one report (the review page).
    getReview: (reportId) =>
        api.get(`/delivery/${reportId}/review`),

    // Admin only — team performance over a rolling window (days).
    getKpi: ({ days = 30, dateFrom = null, dateTo = null } = {}) =>
        api.get('/delivery/kpi', {
            params: (dateFrom || dateTo)
                ? { date_from: dateFrom || undefined, date_to: dateTo || undefined }
                : { days },
        }),

    // Admin only — invoice numbers straight from pricing_engine, never from AI.
    getInvoice: (reportId) =>
        api.get(`/delivery/${reportId}/invoice`),

    // Admin only, and refused unless DELIVERY_SEND_ENABLED is set server-side.
    // `pdf` (optional File) is attached instead of the HTML rendering; `resend`
    // is required to email a report that was already delivered (else 409).
    // -> { sent, to, transport, attached_as, resent, marked_delivered }
    send: (reportId, { pdf = null, resend = false } = {}) => {
        const config = resend ? { params: { resend: true } } : {}
        if (pdf) {
            const form = new FormData()
            form.append('pdf', pdf)
            return api.post(`/delivery/${reportId}/send`, form, { ...config, headers: { 'Content-Type': 'multipart/form-data' } })
        }
        return api.post(`/delivery/${reportId}/send`, null, config)
    },
}

export default api
