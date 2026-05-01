import axios from 'axios'

// Determine API base URL - use environment variable or default
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000') + '/api'

// Create axios instance with proper configuration
const api = axios.create({
    baseURL: API_BASE,
    timeout: 1200000,  // 20 minutes for AI operations
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor for logging
api.interceptors.request.use(config => {
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

    exportJSON: (reportId) =>
        api.post(`/export/json/${reportId}`),

    exportXML: (reportId) =>
        api.post(`/export/xml/${reportId}`),

    exportExcel: (reportId) =>
        api.post(`/export/excel/${reportId}`),

    exportCSV: (reportId) =>
        api.post(`/export/csv/${reportId}`),

    exportWord: (reportId) =>
        api.post(`/export/word/${reportId}`),

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

export default api
