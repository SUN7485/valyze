import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
    AlertTriangle, ArrowLeft, Ban, CalendarClock, CheckCircle2, Clock, Download,
    FileText, Gauge, History, Loader2, MapPin, PencilLine, Phone, PlayCircle,
    RefreshCw, Trash2, User, UserCheck,
} from 'lucide-react'
import { ordersAPI, searchAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'

const SERVICE_LEVEL_OPTIONS = [
    { value: 'basic', label: 'Basic' },
    { value: 'standard', label: 'Standard' },
    { value: 'express', label: 'Express' },
    { value: 'urgent', label: 'Urgent' },
]

const ANALYST_OPTIONS = [
    { value: '', label: 'Unassigned' },
    { value: 'waleed@valyze.com', label: 'Waleed' },
    { value: 'mohamed@valyze.com', label: 'Mohamed' },
    { value: 'mahmoud@valyze.com', label: 'Mahmoud' },
    { value: 'amani@valyze.com', label: 'Amani' },
    { value: 'sally@valyze.com', label: 'Sally' },
]

const STATUS_STYLE = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    cancelled: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40',
}

const COUNTRY_FLAGS = {
    sa: '🇸🇦', 'saudi arabia': '🇸🇦', ae: '🇦🇪', uae: '🇦🇪', 'united arab emirates': '🇦🇪',
    eg: '🇪🇬', egypt: '🇪🇬', kw: '🇰🇼', kuwait: '🇰🇼', qa: '🇶🇦', qatar: '🇶🇦',
    bh: '🇧🇭', bahrain: '🇧🇭', om: '🇴🇲', oman: '🇴🇲', jo: '🇯🇴', jordan: '🇯🇴',
}

const norm = (s) => String(s || 'pending').toLowerCase()
const titleCase = (s) => norm(s) === 'in_progress' ? 'In Progress' : norm(s).charAt(0).toUpperCase() + norm(s).slice(1)

function formatDate(value) {
    if (!value) return '-'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFileSize(value) {
    const size = Number(value || 0)
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
    if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
    return `${size} B`
}

function getFlag(country) {
    if (!country) return '🌍'
    return COUNTRY_FLAGS[String(country).trim().toLowerCase()] || '🌍'
}

function Fact({ label, value, icon }) {
    return (
        <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-4 min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{icon} {label}</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value || '-'}</div>
        </div>
    )
}

// A Fact-styled box that renders arbitrary children instead of a plain value.
function FactBox({ label, icon, children }) {
    return (
        <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-4 min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{icon} {label}</div>
            {children}
        </div>
    )
}

function ReportTypeBadges({ value }) {
    const types = String(value || '').split(',').map(t => t.trim()).filter(Boolean)
    if (types.length === 0) return <div className="text-sm font-bold text-slate-700 dark:text-slate-200">-</div>
    return (
        <div className="flex flex-wrap gap-1">
            {types.map((t, i) => (
                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                    {t.replace(/_/g, ' ')}
                </span>
            ))}
        </div>
    )
}

export default function OrderFocusPage() {
    const navigate = useNavigate()
    const { companyId } = useParams()
    const { user } = useAuth()
    const isAdmin = ['admin', 'super_admin'].includes(user?.role)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(null)
    const [analyst, setAnalyst] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [prevReports, setPrevReports] = useState([])
    const [prevLoading, setPrevLoading] = useState(false)

    const fetchData = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        setError('')
        try {
            const res = await ordersAPI.getCompany(companyId)
            setData(res.data)
            setAnalyst(res.data?.analyst_assigned || res.data?.order?.auto_assigned_analyst || '')
        } catch (e) { setError(e.message || 'Failed to load order') } finally { setLoading(false) }
    }, [companyId])

    useEffect(() => { fetchData() }, [fetchData])

    // Previous-reports check: after the main fetch, look up whether this company
    // already exists in the reports database (by name, falling back to CR number).
    useEffect(() => {
        const name = data?.company_name
        const cr = data?.registration_no
        if (!name && !cr) { setPrevReports([]); return undefined }

        let cancelled = false
        setPrevLoading(true)
        searchAPI.search(name ? { company_name: name } : { cr_number: cr })
            .then(res => {
                if (cancelled) return
                const reports = res.data?.reports || []
                setPrevReports(reports.filter(r => r.id && r.id !== data?.report_id))
            })
            .catch(() => { if (!cancelled) setPrevReports([]) })
            .finally(() => { if (!cancelled) setPrevLoading(false) })
        return () => { cancelled = true }
    }, [data?.company_name, data?.registration_no, data?.report_id])

    const updateServiceLevel = async (level) => {
        setBusy('service_level')
        setError('')
        try {
            await ordersAPI.updateOrder(data.order_id, { service_level: level })
            await fetchData()
        } catch (e) { setError(e.message || 'Failed to update service level') } finally { setBusy(null) }
    }

    const order = data?.order || {}
    const client = data?.client || {}
    const files = data?.files || []
    const status = norm(data?.status)
    const reportId = data?.report_id

    const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/orderds'))

    const start = async () => {
        setBusy('start')
        setError('')
        try {
            const res = await ordersAPI.startCompany(data.order_id, data.id)
            const rid = res.data?.report_id
            if (rid) navigate(`/extractor/${rid}`)
            else await fetchData()
        } catch (e) { setError(e.message || 'Failed to start report') } finally { setBusy(null) }
    }

    const complete = async () => {
        if (!window.confirm('Mark this report as complete?')) return
        setBusy('complete')
        setError('')
        try {
            await ordersAPI.completeCompany(data.order_id, data.id)
            await fetchData()
        } catch (e) { setError(e.message || 'Failed to complete report') } finally { setBusy(null) }
    }

    const reassign = async () => {
        setBusy('reassign')
        setError('')
        try {
            await ordersAPI.reassignCompany(data.order_id, data.id, analyst)
            await fetchData()
        } catch (e) { setError(e.message || 'Failed to reassign') } finally { setBusy(null) }
    }

    const remove = async () => {
        setBusy('delete')
        setError('')
        try {
            await ordersAPI.deleteCompany(data.id)
            navigate('/orderds')
        } catch (e) { setError(e.message || 'Failed to delete report'); setBusy(null) }
    }

    const download = async () => {
        setBusy('download')
        setError('')
        try {
            const res = await ordersAPI.downloadOrder(data.order_id)
            const blob = new Blob([res.data], { type: 'application/zip' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${order.order_number || data.order_id}.zip`
            a.click()
            URL.revokeObjectURL(url)
        } catch (e) { setError(e.message || 'Failed to download submission') } finally { setBusy(null) }
    }

    const primary = useMemo(() => {
        if (status === 'pending') return { label: 'Start Report', icon: PlayCircle, run: start }
        if (status === 'in_progress') return { label: 'Continue in Editor', icon: PencilLine, run: () => reportId && navigate(`/editor/${reportId}`), disabled: !reportId }
        if (status === 'completed') return { label: 'View Report', icon: FileText, subtle: true, run: () => reportId && navigate(`/editor/${reportId}`), disabled: !reportId }
        return null
    }, [status, reportId]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="py-8 px-6 max-w-5xl mx-auto">
            <button onClick={goBack} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors">
                <ArrowLeft size={16} /> Back to Orders
            </button>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <AlertTriangle size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading order...</span>
                </div>
            ) : !data ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">Order Not Found</h3>
                    <button onClick={goBack} className="mt-4 text-primary font-black uppercase tracking-widest text-xs">Back to Orders</button>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div className="glass-card p-6 mb-6 cursor-default">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-3xl leading-none">{getFlag(data.country)}</span>
                                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight truncate">{data.company_name || 'Unnamed Company'}</h1>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {titleCase(status)}
                                    </span>
                                    {order.order_number && (
                                        <Link to={`/orders/${data.order_id}`} className="text-xs font-mono font-bold text-primary hover:underline" title="View the full batch this report belongs to">
                                            {order.order_number}
                                        </Link>
                                    )}
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Client: {client.client_id || order.client_id ? (
                                            <Link to={`/clients/${order.client_id}`} className="font-black text-primary hover:underline">{client.client_name || 'Unknown'}</Link>
                                        ) : <span className="font-black text-slate-700 dark:text-slate-200">{client.client_name || 'Unknown'}</span>}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={download} disabled={busy === 'download'}
                                    className="px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2">
                                    {busy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download
                                </button>
                                <button onClick={fetchData} className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"><RefreshCw size={18} /></button>
                            </div>
                        </div>

                        {/* Primary action */}
                        {primary && (
                            <button onClick={primary.run} disabled={busy === 'start' || primary.disabled}
                                className={`mt-5 w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2.5 ${primary.subtle ? 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-200/60 dark:hover:bg-white/10' : 'bg-primary text-white shadow-lg shadow-primary/25 hover:opacity-90'}`}>
                                {busy === 'start' ? <Loader2 size={17} className="animate-spin" /> : <primary.icon size={17} />} {primary.label}
                            </button>
                        )}
                    </div>

                    {/* Facts */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                        <Fact label="Due Date" value={formatDate(order.due_date)} icon={<Clock size={11} />} />
                        <Fact label="Date Received" value={formatDate(order.date_received)} icon={<CalendarClock size={11} />} />
                        {isAdmin ? (
                            <FactBox label="Service Level" icon={<CalendarClock size={11} />}>
                                <select
                                    value={order.service_level || 'standard'}
                                    disabled={busy === 'service_level'}
                                    onChange={e => updateServiceLevel(e.target.value)}
                                    className="w-full px-2 py-1.5 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                                >
                                    {SERVICE_LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">{o.label}</option>)}
                                </select>
                            </FactBox>
                        ) : (
                            <Fact label="Service Level" value={order.service_level} icon={<CalendarClock size={11} />} />
                        )}
                        <Fact label="Speed" value={order.speed} icon={<Gauge size={11} />} />
                        <FactBox label="Report Types" icon={<FileText size={11} />}>
                            <ReportTypeBadges value={order.report_types || order.report_type} />
                        </FactBox>
                        <Fact label="Analyst" value={ANALYST_OPTIONS.find(a => a.value === (data.analyst_assigned || ''))?.label || data.analyst_assigned || order.auto_assigned_analyst} icon={<User size={11} />} />
                        <Fact label="Client Ref" value={order.client_ref} icon={<FileText size={11} />} />
                        <Fact label="Report ID" value={reportId} icon={<FileText size={11} />} />
                        <Fact label="Registration No" value={data.registration_no} icon={<FileText size={11} />} />
                        <Fact label="VAT No" value={data.vat_no} icon={<FileText size={11} />} />
                        <Fact label="Requested Limit" value={data.requested_limit} icon={<FileText size={11} />} />
                        <Fact label="Address" value={data.address} icon={<MapPin size={11} />} />
                        <Fact label="Phone" value={data.phone} icon={<Phone size={11} />} />
                        <Fact label="Submitted via portal" value={order.submitted_via_portal ? 'Yes' : 'No'} icon={<FileText size={11} />} />
                    </div>

                    {/* Previous reports for this company */}
                    <div className="glass-card p-5 mb-6 cursor-default">
                        <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                            <History size={12} /> Previous Reports
                        </div>
                        {prevLoading ? (
                            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Checking the database…</div>
                        ) : prevReports.length === 0 ? (
                            <p className="text-sm text-slate-400">No previous reports found for this company.</p>
                        ) : (
                            <div className="grid gap-2">
                                {prevReports.map(r => (
                                    <Link
                                        key={r.id}
                                        to={`/editor/${r.id}`}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 hover:border-primary/40 transition-all"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{r.company_name || r.legal_name || 'Untitled report'}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {formatDate(r.created_at)}{r.analyst ? ` · ${r.analyst}` : ''}{r.cr_number ? ` · CR ${r.cr_number}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex-shrink-0">{r.status || '-'}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {order.notes && (
                        <div className="glass-card p-5 mb-6 cursor-default">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Order Notes</div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{order.notes}</p>
                        </div>
                    )}

                    {data.comments && (
                        <div className="glass-card p-5 mb-6 cursor-default">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Client Comments</div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{data.comments}</p>
                        </div>
                    )}

                    {/* Client submission */}
                    <div className="glass-card p-6 mb-6 cursor-default">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Client Submission</h2>
                                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{files.length} file{files.length === 1 ? '' : 's'} submitted through the portal.</p>
                            </div>
                            {files.length > 0 && (
                                <button onClick={download} disabled={busy === 'download'}
                                    className="py-2.5 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center gap-2">
                                    {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download All
                                </button>
                            )}
                        </div>
                        {files.length === 0 ? (
                            <p className="text-sm text-slate-400">No files were attached.</p>
                        ) : (
                            <div className="grid gap-2">
                                {files.map(file => (
                                    <div key={file.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><FileText size={16} /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{file.filename || 'Attachment'}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{file.file_type || 'file'} · {formatFileSize(file.file_size)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="glass-card p-6 cursor-default">
                        <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight mb-1">Report Actions</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Assign a researcher, mark complete, or remove this report.</p>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {/* Reassign */}
                            {isAdmin && (
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-4">
                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2"><UserCheck size={11} /> Assigned Researcher</div>
                                    <select value={analyst} onChange={e => setAnalyst(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary/20 mb-2">
                                        {ANALYST_OPTIONS.map(a => <option key={a.value} value={a.value} className="bg-white dark:bg-slate-900">{a.label}</option>)}
                                    </select>
                                    <button onClick={reassign} disabled={busy === 'reassign'}
                                        className="w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-80 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                        {busy === 'reassign' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Reassign
                                    </button>
                                </div>
                            )}

                            {/* Complete / Delete */}
                            <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-4 flex flex-col gap-2">
                                {status === 'in_progress' && (
                                    <button onClick={complete} disabled={busy === 'complete'}
                                        className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                                        {busy === 'complete' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Mark Complete
                                    </button>
                                )}
                                {isAdmin && (status !== 'completed' ? (
                                    !confirmDelete ? (
                                        <button onClick={() => setConfirmDelete(true)}
                                            className="w-full py-2.5 border border-rose-500/30 text-rose-500 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-1.5">
                                            <Trash2 size={12} /> Delete Report
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button onClick={() => setConfirmDelete(false)}
                                                className="flex-1 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">Keep</button>
                                            <button onClick={remove} disabled={busy === 'delete'}
                                                className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                                                {busy === 'delete' ? <Loader2 size={12} className="animate-spin" /> : 'Confirm Delete'}
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={14} /> This report is complete.</div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
