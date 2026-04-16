import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, Trash2, Edit3, ChevronDown, X, FileText, Database, Loader2, Cloud, RefreshCw, FolderOutput, CheckSquare, Square, HardDrive } from 'lucide-react'
import { reportAPI } from '../api/client'

// Custom hook for debouncing
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)
        return () => clearTimeout(handler)
    }, [value, delay])

    return debouncedValue
}

const EXPORT_FORMATS = [
    { id: 'pdf', label: 'PDF', ext: 'pdf' },
    { id: 'json', label: 'JSON', ext: 'json' },
    { id: 'xml', label: 'XML', ext: 'xml' },
    { id: 'xlsx', label: 'Excel', ext: 'xlsx' },
    { id: 'csv', label: 'CSV', ext: 'csv' },
    { id: 'docx', label: 'Word', ext: 'docx' },
]

const PAGE_SIZE = 50

function LocationBadge({ location }) {
    if (location === 'cloud' || location === 'both') {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"><Cloud size={10} />Cloud</span>
    }
    if (location === 'output') {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><FolderOutput size={10} />Output</span>
    }
    return null
}

function FormatBadge({ format }) {
    const colors = {
        pdf: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        json: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
        xml: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        xlsx: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        csv: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        docx: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    }
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium ${colors[format] || 'bg-slate-100 text-slate-600'}`}>
            {format.toUpperCase()}
        </span>
    )
}

function ExportDropdown({ reportId, onExport, loading }) {
    const [isOpen, setIsOpen] = useState(false)

    const handleExport = async (format) => {
        setIsOpen(false)
        await onExport(reportId, format)
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50 flex items-center gap-0.5"
                title="Export Options"
            >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-30 py-1.5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-3 py-1.5 mb-1 border-b border-slate-100 dark:border-white/5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Export Formats</span>
                        </div>
                        {EXPORT_FORMATS.map((format) => (
                            <button
                                key={format.id}
                                onClick={() => handleExport(format.id)}
                                className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary flex items-center justify-between gap-2 transition-all"
                            >
                                <span>{format.label}</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-slate-400 font-bold uppercase">{format.ext}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

function DeleteConfirmModal({ isOpen, onClose, onConfirm, reportName }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                        <Trash2 size={20} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Delete Report</h3>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                    Are you sure you want to delete <span className="font-semibold text-slate-700 dark:text-slate-200">{reportName}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-rose-500/20 transition-all"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}

function LoadingOverlay({ message }) {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-8 flex items-center gap-4">
                <Loader2 size={24} className="text-primary animate-spin" />
                <span className="text-slate-600 dark:text-slate-300 font-medium">{message}</span>
            </div>
        </div>
    )
}

export default function ReportsPage() {
    const navigate = useNavigate()
    const [reports, setReports] = useState([])
    const [outputReports, setOutputReports] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [countries, setCountries] = useState([])
    const [countryFilter, setCountryFilter] = useState('')
    const [crNumbers, setCrNumbers] = useState([])
    const [deleteModal, setDeleteModal] = useState({ open: false, reportId: null, reportName: '', location: '' })
    const [downloading, setDownloading] = useState({})
    const [loadingReportId, setLoadingReportId] = useState(null)
    const [showSourceFilter, setShowSourceFilter] = useState('all')
    const [showTab, setShowTab] = useState('db')
    const [stats, setStats] = useState({ cloud: 0, local: 0, synced: 0 })
    const [selectedReports, setSelectedReports] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [savingToCloud, setSavingToCloud] = useState({})
    const [savingLocally, setSavingLocally] = useState({})
    const [saveMessage, setSaveMessage] = useState({})
    const tableContainerRef = useRef(null)

    // Debounce search input (300ms delay)
    const search = useDebounce(searchInput, 300)

    const fetchReports = async () => {
        try {
            setLoading(true)
            
            // Fetch both DB reports and output reports in parallel
            const [dbRes, outputRes] = await Promise.all([
                reportAPI.getAllReportsCombined(0, 500, search, countryFilter),
                reportAPI.getOutputReports(search)
            ])
            
            const allReports = dbRes.data.reports || []
            const allOutput = outputRes.data.reports || []
            
            // Mark output reports with location 'output'
            const outputMarked = allOutput.map(o => ({ ...o, location: 'output' }))
            
            setReports(allReports)
            setOutputReports(outputMarked)
            
            const uniqueCountries = [...new Set(allReports.map(r => r.country).filter(Boolean))].sort()
            const uniqueCrNumbers = [...new Set(allReports.map(r => r.cr_number).filter(Boolean))].sort()
            setCountries(uniqueCountries)
            setCrNumbers(uniqueCrNumbers)
            
            const cloudCount = allReports.filter(r => r.location === 'cloud').length
            const localCount = allReports.filter(r => r.location === 'local').length
            const syncedCount = allReports.filter(r => r.location === 'both').length
            setStats({ cloud: cloudCount, local: localCount, synced: syncedCount })
            
            console.log('[ReportsPage] DB Reports:', allReports.length, 'Output Reports:', allOutput.length)
        } catch (e) {
            setError(e.message || 'Failed to load reports')
            console.error('[ReportsPage] Error fetching reports:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchReports()
    }, [])

    useEffect(() => {
        fetchReports()
    }, [search])

    const filteredReports = useMemo(() => {
        let result = reports.filter(report => {
            if (showSourceFilter === 'cloud' && report.location !== 'cloud') return false
            if (search) {
                const s = search.toLowerCase()
                const matchCompany = report.company_name && report.company_name.toLowerCase().includes(s)
                const matchCr = report.cr_number && report.cr_number.toLowerCase().includes(s)
                const matchClientRef = report.client_reference && report.client_reference.toLowerCase().includes(s)
                const matchAnalyst = report.analyst && report.analyst.toLowerCase().includes(s)
                const matchCountry = report.country && report.country.toLowerCase().includes(s)
                if (!matchCompany && !matchCr && !matchClientRef && !matchAnalyst && !matchCountry) return false
            }
            return true
        })
        
        // Sort by date (newest first)
        result.sort((a, b) => {
            const aVal = new Date(a.updated_at || a.created_at || '').getTime() || 0
            const bVal = new Date(b.updated_at || b.created_at || '').getTime() || 0
            return bVal - aVal
        })
        
        return result
    }, [reports, showSourceFilter, search])

    // Get current reports based on tab
    const currentReports = showTab === 'output' ? outputReports : filteredReports

    const handleOpenReport = async (report) => {
        try {
            setLoadingReportId(report.id)
            setError('')
            
            // If report is in local or synced, no need to load from cloud
            if (report.location === 'local' || report.location === 'both') {
                navigate(`/editor/${report.id}`)
                return
            }
            
            // If only in cloud, load it first then navigate
            await reportAPI.loadFromCloud(report.id)
            navigate(`/editor/${report.id}`)
        } catch (e) {
            setError(`Failed to load report: ${e.message}`)
            console.error('[ReportsPage] Error loading report:', e)
        } finally {
            setLoadingReportId(null)
        }
    }

    const handleExport = async (reportId, format) => {
        try {
            setDownloading(prev => ({ ...prev, [reportId]: true }))
            setError('')
            
            const report = reports.find(r => r.id === reportId)
            
            // If not cloud-only, no need to load from cloud
            if (report && report.location !== 'cloud') {
                // Already local, proceed with export
            } else {
                await reportAPI.loadFromCloud(reportId)
            }
            
            const exportAPI = {
                pdf: reportAPI.generatePDF,
                json: reportAPI.exportJSON,
                xml: reportAPI.exportXML,
                xlsx: reportAPI.exportExcel,
                csv: reportAPI.exportCSV,
                docx: reportAPI.exportWord,
            }[format]
            
            await exportAPI(reportId)
            
            setTimeout(() => {
                const downloadUrl = format === 'pdf' 
                    ? reportAPI.getDownloadURL(reportId)
                    : reportAPI.getExportDownloadURL(reportId, format)
                const link = document.createElement('a')
                link.href = downloadUrl
                const companyName = reports.find(r => r.id === reportId)?.company_name || reportId
                link.download = `CreditReport_${companyName.replace(/\s+/g, '_').slice(0, 30)}.${format === 'xlsx' ? 'xlsx' : format === 'docx' ? 'docx' : format}`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
            }, 500)
        } catch (e) {
            setError(`Failed to export: ${e.message}`)
            console.error('[ReportsPage] Export error:', e)
        } finally {
            setDownloading(prev => ({ ...prev, [reportId]: false }))
        }
    }

    const handleDelete = async () => {
        const { reportId, location } = deleteModal
        try {
            if (location === 'cloud' || location === 'both') {
                await reportAPI.deleteCloudReport(reportId)
            }
            if (location === 'local' || location === 'both') {
                await reportAPI.deleteLocalReport(reportId)
            }
            if (location === 'output') {
                await reportAPI.deleteOutputReport(reportId)
            }
            setDeleteModal({ open: false, reportId: null, reportName: '', location: '' })
            fetchReports()
        } catch (e) {
            setError(`Failed to delete: ${e.message}`)
        }
    }

    const handleSaveToCloud = async (reportId) => {
        try {
            setSavingToCloud(prev => ({ ...prev, [reportId]: true }))
            setError('')
            await reportAPI.saveToCloud(reportId)
            setSaveMessage(prev => ({ ...prev, [reportId]: 'Saved to cloud!' }))
            setTimeout(() => setSaveMessage(prev => ({ ...prev, [reportId]: '' })), 3000)
            fetchReports()
        } catch (e) {
            setError(`Failed to save to cloud: ${e.message}`)
        } finally {
            setSavingToCloud(prev => ({ ...prev, [reportId]: false }))
        }
    }

    const handleSaveLocally = async (reportId) => {
        try {
            setSavingLocally(prev => ({ ...prev, [reportId]: true }))
            setError('')
            // Save to cloud which will store in Supabase, then we can load from there
            await reportAPI.saveToCloud(reportId)
            await reportAPI.loadFromCloud(reportId)
            setSaveMessage(prev => ({ ...prev, [reportId]: 'Saved locally!' }))
            setTimeout(() => setSaveMessage(prev => ({ ...prev, [reportId]: '' })), 3000)
            fetchReports()
        } catch (e) {
            setError(`Failed to save locally: ${e.message}`)
        } finally {
            setSavingLocally(prev => ({ ...prev, [reportId]: false }))
        }
    }

    // Selection functions
    const toggleSelect = (reportId) => {
        setSelectedReports(prev => {
            const newSet = new Set(prev)
            if (newSet.has(reportId)) {
                newSet.delete(reportId)
            } else {
                newSet.add(reportId)
            }
            return newSet
        })
    }

    const toggleSelectAll = (currentReports) => {
        if (selectedReports.size === currentReports.length && currentReports.length > 0) {
            setSelectedReports(new Set())
        } else {
            setSelectedReports(new Set(currentReports.map(r => r.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedReports.size === 0) return
        
        const confirmMsg = `Delete ${selectedReports.size} selected report(s)? This will delete from ${showTab === 'output' ? 'output folder' : 'cloud/local database'}.`
        if (!window.confirm(confirmMsg)) return
        
        setBulkDeleting(true)
        try {
            for (const reportId of selectedReports) {
                if (showTab === 'output') {
                    await reportAPI.deleteOutputReport(reportId)
                } else {
                    const report = reports.find(r => r.id === reportId)
                    if (report) {
                        if (report.location === 'cloud' || report.location === 'both') {
                            await reportAPI.deleteCloudReport(reportId)
                        }
                        if (report.location === 'local' || report.location === 'both') {
                            await reportAPI.deleteLocalReport(reportId)
                        }
                    }
                }
            }
            setSelectedReports(new Set())
            fetchReports()
        } catch (e) {
            setError(`Bulk delete failed: ${e.message}`)
        } finally {
            setBulkDeleting(false)
        }
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto">
            {loadingReportId && <LoadingOverlay message="Loading report from cloud..." />}
            
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Saved Reports</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {showTab === 'output' 
                            ? `${outputReports.length} generated files`
                            : `${reports.length} total • ${stats.cloud} cloud • ${stats.local} local • ${stats.synced} synced`
                        }
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchReports}
                        className="p-3 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                        title="Refresh"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* Tab Buttons */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={() => { setShowTab('db'); setShowSourceFilter('all') }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                        showTab === 'db' 
                            ? 'bg-primary text-white' 
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                >
                    <Database size={14} /> Database ({reports.length})
                </button>
                <button
                    onClick={() => { setShowTab('output'); setSelectedReports(new Set()) }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                        showTab === 'output' 
                            ? 'bg-amber-500 text-white' 
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                >
                    <FolderOutput size={14} /> Generated Files ({outputReports.length})
                </button>
            </div>

            {showTab === 'db' && (
                <>
                    {/* Source filter */}
                    <div className="flex items-center gap-2 mb-4">
                        <button
                            onClick={() => setShowSourceFilter('all')}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                                showSourceFilter === 'all' 
                                    ? 'bg-primary text-white' 
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                            }`}
                        >
                            All ({reports.length})
                        </button>
                        <button
                            onClick={() => setShowSourceFilter('cloud')}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                                showSourceFilter === 'cloud' 
                                    ? 'bg-purple-500 text-white' 
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                            }`}
                        >
                            <Cloud size={14} /> Cloud ({stats.cloud})
                        </button>
                    </div>

                    {/* Single search box */}
                    <div className="glass-card p-4 mb-6">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by company, CR number, client reference, analyst or country..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Database Tab - Add select all here */}
            {showTab === 'db' && reports.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                    <button
                        onClick={() => toggleSelectAll(filteredReports)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-primary"
                    >
                        {selectedReports.size === filteredReports.length ? <CheckSquare size={16} /> : <Square size={16} />}
                        Select All
                    </button>
                    {selectedReports.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                            className="px-4 py-2 bg-rose-500 text-white text-xs font-bold uppercase rounded-lg hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            Delete {selectedReports.size} Selected
                        </button>
                    )}
                </div>
            )}

            {showTab === 'output' && outputReports.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                    <button
                        onClick={() => toggleSelectAll(outputReports)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-primary"
                    >
                        {selectedReports.size === outputReports.length ? <CheckSquare size={16} /> : <Square size={16} />}
                        Select All
                    </button>
                    {selectedReports.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                            className="px-4 py-2 bg-rose-500 text-white text-xs font-bold uppercase rounded-lg hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            Delete {selectedReports.size} Selected
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading reports...</span>
                </div>
            ) : currentReports.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">
                        {showTab === 'output' ? 'No Generated Files' : 'No Reports Found'}
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {showTab === 'output' 
                            ? 'Generate PDF or export reports to see them here' 
                            : (search || countryFilter ? 'Try adjusting your search or filter' : 'Save reports using the editor to see them here')
                        }
                    </p>
                </div>
            ) : (
<div 
                    className="glass-card overflow-hidden"
                    ref={tableContainerRef}
                    style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}
                >
                    {showTab === 'db' ? (
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-200 dark:border-white/10">
                                <th className="w-12 px-4 py-4">
                                    <button
                                        onClick={() => toggleSelectAll(filteredReports)}
                                        className="text-slate-400 hover:text-primary transition-colors"
                                        title="Select All"
                                    >
                                        {selectedReports.size === filteredReports.length && filteredReports.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Source</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Company & ID</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Reference</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Country</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Analyst</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Updated</th>
                                <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredReports.map((report) => (
                                <tr 
                                    key={report.id} 
                                    className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all duration-200"
                                >
                                    <td className="px-4 py-4">
                                        <button
                                            onClick={() => toggleSelect(report.id)}
                                            className="text-slate-300 group-hover:text-slate-400 hover:text-primary transition-colors"
                                        >
                                            {selectedReports.has(report.id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4">
                                        <LocationBadge location={report.location} />
                                    </td>
                                    <td className="px-4 py-4 min-w-[200px]">
                                        <div className="flex flex-col gap-0.5">
                                            <button 
                                                onClick={() => handleOpenReport(report)}
                                                disabled={loadingReportId === report.id}
                                                className="font-bold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors text-left disabled:opacity-50 text-sm leading-tight group-hover:translate-x-0.5 transition-transform"
                                            >
                                                {loadingReportId === report.id ? (
                                                    <span className="flex items-center gap-2">
                                                        <Loader2 size={14} className="animate-spin" /> Loading...
                                                    </span>
                                                ) : (
                                                    report.company_name || 'Untitled Report'
                                                )}
                                            </button>
                                            <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                                                {report.id}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                {report.cr_number || '-'}
                                            </span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                                {report.client_reference || 'REF -'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                                            {report.country || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                                            {report.analyst_name || report.analyst || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                                {formatDate(report.updated_at).split(',')[0]}
                                            </span>
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                                {formatDate(report.updated_at).split(',')[1]}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {saveMessage[report.id] ? (
                                                <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest px-2 animate-in slide-in-from-right-2">{saveMessage[report.id]}</span>
                                            ) : (
                                                <>
                                                    {report.location !== 'cloud' && (
                                                        <button
                                                            onClick={() => handleSaveToCloud(report.id)}
                                                            disabled={savingToCloud[report.id]}
                                                            className="p-2 text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 rounded-lg transition-all disabled:opacity-50"
                                                            title="Save to Cloud"
                                                        >
                                                            {savingToCloud[report.id] ? <Loader2 size={18} className="animate-spin" /> : <Cloud size={18} />}
                                                        </button>
                                                    )}
                                                    {report.location !== 'local' && (
                                                        <button
                                                            onClick={() => handleSaveLocally(report.id)}
                                                            disabled={savingLocally[report.id]}
                                                            className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all disabled:opacity-50"
                                                            title="Save Locally"
                                                        >
                                                            {savingLocally[report.id] ? <Loader2 size={18} className="animate-spin" /> : <HardDrive size={18} />}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button
                                                onClick={() => handleOpenReport(report)}
                                                disabled={loadingReportId === report.id}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
                                                title="Edit"
                                            >
                                                {loadingReportId === report.id ? <Loader2 size={18} className="animate-spin" /> : <Edit3 size={18} />}
                                            </button>
                                            <ExportDropdown 
                                                reportId={report.id} 
                                                onExport={handleExport}
                                                loading={downloading[report.id]}
                                            />
                                            <button
                                                onClick={() => setDeleteModal({ 
                                                    open: true, 
                                                    reportId: report.id, 
                                                    reportName: report.company_name || report.id,
                                                    location: report.location
                                                })}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    ) : (
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-200 dark:border-white/10">
                                <th className="w-12 px-4 py-4">
                                    <button
                                        onClick={() => toggleSelectAll(outputReports)}
                                        className="text-slate-400 hover:text-primary transition-colors"
                                        title="Select All"
                                    >
                                        {selectedReports.size === outputReports.length && outputReports.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID & Info</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Formats</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Generated On</th>
                                <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {outputReports.map((report) => (
                                <tr 
                                    key={report.id} 
                                    className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all duration-200"
                                >
                                    <td className="px-4 py-4">
                                        <button
                                            onClick={() => toggleSelect(report.id)}
                                            className="text-slate-300 group-hover:text-slate-400 hover:text-primary transition-colors"
                                        >
                                            {selectedReports.has(report.id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:translate-x-0.5 transition-transform">
                                                {report.filename?.replace(/_/g, ' ').slice(0, 40) || 'Exported File'}
                                            </span>
                                            <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                                                ID: {report.id}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {report.files?.map((f, i) => (
                                                <FormatBadge key={i} format={f.format} />
                                            ))}
                                            {report.files?.length > 3 && (
                                                <span className="text-[10px] font-bold text-slate-400 flex items-center px-1">
                                                    +{report.files.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                                {formatDate(report.created_at).split(',')[0]}
                                            </span>
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                                                {formatDate(report.created_at).split(',')[1]}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setDeleteModal({ 
                                                    open: true, 
                                                    reportId: report.id, 
                                                    reportName: report.filename || report.id,
                                                    location: 'output'
                                                })}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>
            )}

            <DeleteConfirmModal 
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, reportId: null, reportName: '', location: '' })}
                onConfirm={handleDelete}
                reportName={deleteModal.reportName}
            />
        </div>
    )
}