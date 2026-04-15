import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

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
        console.error('[API Error]', msg)
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

    // -- Export -------------------------------------

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
}

export default api
