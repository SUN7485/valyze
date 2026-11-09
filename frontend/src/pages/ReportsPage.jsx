import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, Trash2, Edit3, ChevronDown, X, FileText, Loader2, Cloud, RefreshCw, CheckSquare, Square, HardDrive } from 'lucide-react'
import { reportAPI, downloadReportExport, downloadReportJson } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useDebounce } from '../lib/orderHelpers'
import { printHtml } from '../lib/htmlDocument'

const EXPORT_FORMATS = [
    { id: 'pdf', label: 'PDF', ext: 'pdf' },
    { id: 'json', label: 'JSON', ext: 'json' },
    { id: 'xml', label: 'XML', ext: 'xml' },
    { id: 'xlsx', label: 'Excel', ext: 'xlsx' },
    { id: 'csv', label: 'CSV', ext: 'csv' },
    { id: 'docx', label: 'Word', ext: 'docx' },
]

// Reports are fetched a page at a time (the server caps a page at 1000 and
// reports the true total), with "Load more" for the rest.
const PAGE_SIZE = 200

function LocationBadge() {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"><Cloud size={10} />Cloud</span>
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
    const { isAdmin } = useAuth()
    const [reports, setReports] = useState([])
    const [totalReports, setTotalReports] = useState(0)
    const [loadingMore, setLoadingMore] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [countries, setCountries] = useState([])
    const [countryFilter, setCountryFilter] = useState('')
    const [deleteModal, setDeleteModal] = useState({ open: false, reportId: null, reportName: '' })
    const [downloading, setDownloading] = useState({})
    const [loadingReportId, setLoadingReportId] = useState(null)
    const [selectedReports, setSelectedReports] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [savingLocally, setSavingLocally] = useState({})
    const [saveMessage, setSaveMessage] = useState({})
    const tableContainerRef = useRef(null)
    // Only the newest request may update the list — a slow response for an old
    // search must not overwrite the results of the current one.
    const requestSeq = useRef(0)

    // Debounce search input (300ms delay)
    const search = useDebounce(searchInput, 300)

    const fetchReports = useCallback(async () => {
        const seq = ++requestSeq.current
        try {
            setLoading(true)
            setError('')
            const res = await reportAPI.getAllReportsCombined(0, PAGE_SIZE, search, countryFilter)
            if (seq !== requestSeq.current) return
            const allReports = res.data?.reports || []
            setReports(allReports)
            setTotalReports(res.data?.total ?? allReports.length)
            // The country list comes from an unfiltered result, so choosing one
            // country does not shrink the dropdown to that country.
            if (!countryFilter) {
                setCountries(prev => [...new Set([...prev, ...allReports.map(r => r.country).filter(Boolean)])].sort())
            }
        } catch (e) {
            if (seq !== requestSeq.current) return
            setError(e.message || 'Failed to load reports')
            console.error('[ReportsPage] Error fetching reports:', e)
        } finally {
            if (seq === requestSeq.current) setLoading(false)
        }
    }, [search, countryFilter])

    // Next page, appended. Same staleness rule: a new search discards it.
    const loadMore = useCallback(async () => {
        const seq = requestSeq.current
        setLoadingMore(true)
        try {
            const res = await reportAPI.getAllReportsCombined(reports.length, PAGE_SIZE, search, countryFilter)
            if (seq !== requestSeq.current) return
            const page = res.data?.reports || []
            setReports(prev => {
                const seen = new Set(prev.map(r => r.id))
                return [...prev, ...page.filter(r => !seen.has(r.id))]
            })
            setTotalReports(res.data?.total ?? totalReports)
        } catch (e) {
            if (seq === requestSeq.current) setError(e.message || 'Failed to load more reports')
        } finally {
            if (seq === requestSeq.current) setLoadingMore(false)
        }
    }, [reports.length, search, countryFilter, totalReports])

    // One effect: runs on mount and whenever the search or country changes.
    useEffect(() => {
        fetchReports()
    }, [fetchReports])

    const filteredReports = useMemo(() => {
        const result = [...reports]
        // Sort by date (newest first)
        result.sort((a, b) => {
            const aVal = new Date(a.updated_at || a.created_at || '').getTime() || 0
            const bVal = new Date(b.updated_at || b.created_at || '').getTime() || 0
            return bVal - aVal
        })
        return result
    }, [reports])

    const currentReports = filteredReports

    const handleOpenReport = (report) => {
        setError('')
        navigate(`/editor/${report.id}`)
    }

    const reportBaseName = (reportId) => {
        const companyName = reports.find(r => r.id === reportId)?.company_name || reportId
        return `CreditReport_${String(companyName).replace(/\s+/g, '_').slice(0, 30)}`
    }

    // Downloads exactly what the export endpoint returns (as the Editor does).
    const handleExport = async (reportId, format) => {
        try {
            setDownloading(prev => ({ ...prev, [reportId]: true }))
            setError('')
            if (format === 'pdf') {
                const res = await reportAPI.generatePDF(reportId)
                if (!res.data?.html) throw new Error('No HTML returned for the PDF')
                printHtml(res.data.html)
            } else {
                await downloadReportExport(reportId, format, reportBaseName(reportId))
            }
        } catch (e) {
            setError(`Failed to export: ${e.message}`)
            console.error('[ReportsPage] Export error:', e)
        } finally {
            setDownloading(prev => ({ ...prev, [reportId]: false }))
        }
    }

    const handleDelete = async () => {
        const { reportId } = deleteModal
        try {
            await reportAPI.deleteReport(reportId)
            setDeleteModal({ open: false, reportId: null, reportName: '' })
            fetchReports()
        } catch (e) {
            setDeleteModal({ open: false, reportId: null, reportName: '' })
            setError(`Failed to delete: ${e.message}`)
        }
    }

    // "Save Locally": download the report JSON. Reports are already in the
    // database — there is nothing to "save to cloud".
    const handleSaveLocally = async (reportId) => {
        try {
            setSavingLocally(prev => ({ ...prev, [reportId]: true }))
            setError('')
            const res = await reportAPI.getReport(reportId)
            downloadReportJson(res.data, reportBaseName(reportId))
            setSaveMessage(prev => ({ ...prev, [reportId]: 'Downloaded' }))
            setTimeout(() => setSaveMessage(prev => ({ ...prev, [reportId]: '' })), 3000)
        } catch (e) {
            setError(`Failed to download: ${e.message}`)
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

        if (!window.confirm(`Delete ${selectedReports.size} selected report(s)? This cannot be undone.`)) return

        setBulkDeleting(true)
        try {
            for (const reportId of selectedReports) {
                await reportAPI.deleteReport(reportId)
            }
            setSelectedReports(new Set())
            fetchReports()
        } catch (e) {
            setError(`Bulk delete failed: ${e.message}`)
            fetchReports()
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
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Saved Reports</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {totalReports > reports.length
                            ? `Showing ${reports.length} of ${totalReports} reports`
                            : `${reports.length} report${reports.length === 1 ? '' : 's'}`}
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

            {/* Search + country filter */}
            <div className="glass-card p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by company name or CR number..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
                        />
                    </div>
                    <select
                        value={countryFilter}
                        onChange={(e) => setCountryFilter(e.target.value)}
                        className="sm:w-56 px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                        aria-label="Filter by country"
                    >
                        <option value="">All countries</option>
                        {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {reports.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                    <button
                        onClick={() => toggleSelectAll(filteredReports)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-primary"
                    >
                        {selectedReports.size === filteredReports.length ? <CheckSquare size={16} /> : <Square size={16} />}
                        Select All
                    </button>
                    {isAdmin && selectedReports.size > 0 && (
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
                        No Reports Found
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {search || countryFilter ? 'Try adjusting your search or filter' : 'Save reports using the editor to see them here'}
                    </p>
                </div>
            ) : (
<div 
                    className="glass-card overflow-hidden"
                    ref={tableContainerRef}
                    style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}
                >
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
                                        <LocationBadge />
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
                                                <button
                                                    onClick={() => handleSaveLocally(report.id)}
                                                    disabled={savingLocally[report.id]}
                                                    className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all disabled:opacity-50"
                                                    title="Save Locally (download JSON)"
                                                >
                                                    {savingLocally[report.id] ? <Loader2 size={18} className="animate-spin" /> : <HardDrive size={18} />}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleOpenReport(report)}
                                                disabled={loadingReportId === report.id}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
                                                title="Edit"
                                            >
                                                <Edit3 size={18} />
                                            </button>
                                            <ExportDropdown 
                                                reportId={report.id} 
                                                onExport={handleExport}
                                                loading={downloading[report.id]}
                                            />
                                            {isAdmin && (
                                                <button
                                                    onClick={() => setDeleteModal({
                                                        open: true,
                                                        reportId: report.id,
                                                        reportName: report.company_name || report.id,
                                                    })}
                                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {totalReports > reports.length && (
                        <div className="p-4 flex justify-center border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary disabled:opacity-50 flex items-center gap-2"
                            >
                                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                                Load more ({totalReports - reports.length} remaining)
                            </button>
                        </div>
                    )}
                </div>
            )}

            <DeleteConfirmModal 
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, reportId: null, reportName: '' })}
                onConfirm={handleDelete}
                reportName={deleteModal.reportName}
            />
        </div>
    )
}