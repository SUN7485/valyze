import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    AlertTriangle, Ban, CalendarClock, CheckCircle2, Clock, Download, Edit3,
    ExternalLink, FileCheck, FileText, Loader2, PencilLine, PlayCircle,
    RefreshCw, User, UserCheck, X,
} from 'lucide-react'
import { invoicesAPI, ordersAPI } from '../api/client'

const ANALYST_OPTIONS = [
    { value: '', label: 'Unassigned' },
    { value: 'waleed@valyze.com', label: 'Waleed' },
    { value: 'mohamed@valyze.com', label: 'Mohamed' },
    { value: 'mahmoud@valyze.com', label: 'Mahmoud' },
    { value: 'amani@valyze.com', label: 'Amani' },
    { value: 'sally@valyze.com', label: 'Sally' },
]

const SERVICE_LEVEL_OPTIONS = [
    { value: 'basic', label: 'Basic' },
    { value: 'standard', label: 'Standard' },
    { value: 'express', label: 'Express' },
    { value: 'urgent', label: 'Urgent' },
]

const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    invoiced: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
    cancelled: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40',
}

const SERVICE_LEVELS = {
    basic: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700',
    standard: 'bg-primary/15 text-primary border-primary/25 dark:bg-primary/20 dark:text-primary',
    express: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/40',
    urgent: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40',
}

const COUNTRY_FLAGS = {
    sa: '🇸🇦', 'saudi arabia': '🇸🇦', ae: '🇦🇪', uae: '🇦🇪', 'united arab emirates': '🇦🇪',
    eg: '🇪🇬', egypt: '🇪🇬', kw: '🇰🇼', kuwait: '🇰🇼', qa: '🇶🇦', qatar: '🇶🇦',
    bh: '🇧🇭', bahrain: '🇧🇭', om: '🇴🇲', oman: '🇴🇲', jo: '🇯🇴', jordan: '🇯🇴',
}

const norm = (s) => String(s || 'pending').toLowerCase()

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

function getProgress(order) {
    const companies = order?.companies || []
    const total = order?.progress?.total || companies.length || order?.company_count || 0
    const completed = order?.progress?.completed ?? order?.completed_count
        ?? companies.filter(c => norm(c.status) === 'completed').length
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

function Badge({ children, className }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${className}`}>
            {children}
        </span>
    )
}

function InfoItem({ label, value, icon }) {
    return (
        <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{icon} {label}</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value || '-'}</div>
        </div>
    )
}

function CompanyRow({ orderId, company, index, onChanged }) {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const status = norm(company.status)
    const reportId = company.report_id

    const start = async () => {
        setLoading(true)
        try {
            const res = await ordersAPI.startCompany(orderId, company.id)
            const rid = res.data?.report_id
            onChanged()
            if (rid) navigate(`/extractor/${rid}`)
        } catch (e) { alert(e.message || 'Failed to start report') } finally { setLoading(false) }
    }

    const complete = async () => {
        if (!window.confirm('Mark this company report as complete?')) return
        setLoading(true)
        try {
            await ordersAPI.completeCompany(orderId, company.id)
            onChanged()
        } catch (e) { alert(e.message || 'Failed to complete report') } finally { setLoading(false) }
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{getFlag(company.country)}</span>
                        <h4 className="text-sm font-black text-slate-800 dark:text-white truncate">{company.company_name || 'Unnamed Company'}</h4>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">{[company.country, company.registration_no].filter(Boolean).join(' · ') || 'No details'}</div>
                </div>
                <Badge className={STATUS_COLORS[status] || STATUS_COLORS.pending}>{status === 'in_progress' ? 'In Progress' : status}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {status === 'pending' && (
                    <button onClick={start} disabled={loading}
                        className="py-2 px-3 bg-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5">
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />} Start Report
                    </button>
                )}
                {status === 'in_progress' && (
                    <>
                        <button onClick={() => reportId && navigate(`/editor/${reportId}`)} disabled={!reportId}
                            className="py-2 px-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5">
                            <PencilLine size={12} /> Continue
                        </button>
                        <button onClick={complete} disabled={loading}
                            className="py-2 px-3 bg-emerald-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                            {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Complete
                        </button>
                    </>
                )}
                {status === 'completed' && reportId && (
                    <button onClick={() => navigate(`/editor/${reportId}`)}
                        className="py-2 px-3 bg-emerald-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-1.5">
                        <FileCheck size={12} /> View Report
                    </button>
                )}
            </div>
        </div>
    )
}

export default function OrderDrawer({ orderId, open, onClose, onChanged }) {
    const navigate = useNavigate()
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const [analyst, setAnalyst] = useState('')
    const [serviceLevel, setServiceLevel] = useState('standard')
    const [notes, setNotes] = useState('')
    const [notesDirty, setNotesDirty] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const fetchOrder = useCallback(async () => {
        if (!orderId) return
        setLoading(true)
        setError('')
        try {
            const res = await ordersAPI.getOne(orderId)
            setOrder(res.data)
            setAnalyst(res.data?.auto_assigned_analyst || '')
            setServiceLevel(res.data?.service_level || 'standard')
            setNotes(res.data?.notes || '')
            setNotesDirty(false)
        } catch (e) { setError(e.message || 'Failed to load order') } finally { setLoading(false) }
    }, [orderId])

    useEffect(() => { if (open && orderId) fetchOrder() }, [open, orderId, fetchOrder])

    useEffect(() => {
        if (!open) return undefined
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const refresh = useCallback(() => { fetchOrder(); onChanged?.() }, [fetchOrder, onChanged])

    const applyUpdate = async (data, field) => {
        if (!order) return
        setSaving(field)
        setError('')
        try {
            await ordersAPI.update(order.id, data)
            await refresh()
        } catch (e) { setError(e.message || 'Update failed') } finally { setSaving(null) }
    }

    const handleDownload = async () => {
        if (!order) return
        setDownloading(true)
        setError('')
        try {
            const res = await ordersAPI.downloadOrder(order.id)
            const blob = new Blob([res.data], { type: 'application/zip' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${order.order_number || order.id}.zip`
            a.click()
            URL.revokeObjectURL(url)
        } catch (e) { setError(e.message || 'Failed to download order') } finally { setDownloading(false) }
    }

    const handleGenerateInvoice = async () => {
        if (!order) return
        setSaving('invoice')
        setError('')
        try {
            const res = await invoicesAPI.generate(order.id)
            const invoiceId = res.data?.id
            if (invoiceId) navigate(`/invoices/${invoiceId}`)
            else await refresh()
        } catch (e) { setError(e.message || 'Failed to generate invoice') } finally { setSaving(null) }
    }

    const progress = useMemo(() => getProgress(order), [order])
    const companies = order?.companies || []
    const files = order?.files || []
    const isCancelled = order?.status === 'cancelled'
    const allComplete = companies.length > 0 && companies.every(c => norm(c.status) === 'completed')
    const hasInvoice = Boolean(order?.invoice)

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
            <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900">
                    <div className="min-w-0">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Order Management</div>
                        <div className="font-mono text-base font-black text-primary truncate">{order?.order_number || orderId}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button onClick={handleDownload} disabled={downloading || !order} title="Download submitted details + files (ZIP)"
                            className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-40">
                            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        </button>
                        <button onClick={() => fetchOrder()} disabled={loading} title="Refresh"
                            className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-40">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={onClose} title="Close" className="p-2.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs flex items-center gap-2">
                            <X size={14} /> {error}
                        </div>
                    )}

                    {loading && !order ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={28} className="text-primary animate-spin" />
                        </div>
                    ) : !order ? (
                        <div className="text-center py-20 text-slate-400">
                            <AlertTriangle size={32} className="mx-auto mb-3" />
                            <p className="text-sm font-bold">Order not found.</p>
                        </div>
                    ) : (
                        <>
                            {/* Overview */}
                            <section className="glass-card p-5 cursor-default">
                                <div className="flex flex-wrap items-center gap-2 mb-4">
                                    <Badge className={STATUS_COLORS[norm(order.status)] || STATUS_COLORS.pending}>
                                        {norm(order.status) === 'in_progress' ? 'In Progress' : norm(order.status)}
                                    </Badge>
                                    <Badge className={SERVICE_LEVELS[norm(order.service_level)] || SERVICE_LEVELS.standard}>{order.service_level || 'standard'}</Badge>
                                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
                                        Client: <button onClick={() => order.client_id && navigate(`/clients/${order.client_id}`)}
                                            className="font-black text-primary hover:underline">{order.client?.client_name || order.client_name || 'Unknown'}</button>
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <InfoItem label="Date Received" value={formatDate(order.date_received)} icon={<CalendarClock size={11} />} />
                                    <InfoItem label="Due Date" value={formatDate(order.due_date)} icon={<Clock size={11} />} />
                                    <InfoItem label="Analyst" value={ANALYST_OPTIONS.find(a => a.value === (order.auto_assigned_analyst || ''))?.label || order.auto_assigned_analyst} icon={<User size={11} />} />
                                    <InfoItem label="Progress" value={`${progress.completed} / ${progress.total} complete`} icon={<CheckCircle2 size={11} />} />
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                    <span>Completion</span><span>{progress.pct}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all duration-500" style={{ width: `${progress.pct}%` }} />
                                </div>
                            </section>

                            {/* Order management */}
                            <section className="glass-card p-5 cursor-default">
                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-4">Manage Order</h3>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3">
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2"><UserCheck size={11} /> Assigned Analyst</div>
                                        <select value={analyst} onChange={e => setAnalyst(e.target.value)} disabled={isCancelled}
                                            className="w-full px-3 py-2 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary/20 mb-2 disabled:opacity-50">
                                            {ANALYST_OPTIONS.map(a => <option key={a.value} value={a.value} className="bg-white dark:bg-slate-900">{a.label}</option>)}
                                        </select>
                                        <button onClick={() => applyUpdate({ auto_assigned_analyst: analyst || null }, 'analyst')} disabled={saving === 'analyst' || isCancelled}
                                            className="w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-80 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                            {saving === 'analyst' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Reassign
                                        </button>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3">
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2"><CalendarClock size={11} /> Service Level</div>
                                        <select value={serviceLevel} onChange={e => setServiceLevel(e.target.value)} disabled={isCancelled}
                                            className="w-full px-3 py-2 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary/20 mb-2 disabled:opacity-50">
                                            {SERVICE_LEVEL_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-white dark:bg-slate-900">{s.label}</option>)}
                                        </select>
                                        <button onClick={() => applyUpdate({ service_level: serviceLevel }, 'service_level')} disabled={saving === 'service_level' || isCancelled}
                                            className="w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-80 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                            {saving === 'service_level' ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />} Update
                                        </button>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3 mt-3">
                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2"><PencilLine size={11} /> Internal Notes</div>
                                    <textarea value={notes} onChange={e => { setNotes(e.target.value); setNotesDirty(true) }} rows={3}
                                        placeholder="Add operational notes for this order..."
                                        className="w-full px-3 py-2 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                                    {notesDirty && (
                                        <button onClick={() => applyUpdate({ notes }, 'notes')} disabled={saving === 'notes'}
                                            className="mt-2 w-full py-2 bg-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                            {saving === 'notes' ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />} Save Notes
                                        </button>
                                    )}
                                </div>

                                {/* Cancel */}
                                {!isCancelled ? (
                                    <div className="mt-3">
                                        {!confirmCancel ? (
                                            <button onClick={() => setConfirmCancel(true)}
                                                className="w-full py-2 border border-rose-500/30 text-rose-500 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-1.5">
                                                <Ban size={12} /> Cancel Order
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button onClick={() => setConfirmCancel(false)}
                                                    className="flex-1 py-2 border border-slate-200 dark:border-white/10 rounded-lg font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">Keep</button>
                                                <button onClick={() => { setConfirmCancel(false); applyUpdate({ status: 'cancelled' }, 'cancel') }} disabled={saving === 'cancel'}
                                                    className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                                                    {saving === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : 'Confirm Cancel'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-3 text-xs font-bold text-rose-500 text-center">This order has been cancelled.</div>
                                )}
                            </section>

                            {/* Client attachments */}
                            <section className="glass-card p-5 cursor-default">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Client Submission</h3>
                                    <button onClick={handleDownload} disabled={downloading}
                                        className="py-2 px-3 bg-primary/10 text-primary rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                        {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download All
                                    </button>
                                </div>
                                {files.length === 0 ? (
                                    <p className="text-xs text-slate-400">No files were attached to this order.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map(file => (
                                            <div key={file.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><FileText size={15} /></div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{file.filename || 'Attachment'}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{file.file_type || 'file'} · {formatFileSize(file.file_size)}</p>
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-[10px] text-slate-400 pt-1">Use “Download All” to get the files plus a submission summary as a ZIP.</p>
                                    </div>
                                )}
                            </section>

                            {/* Companies */}
                            <section className="glass-card p-5 cursor-default">
                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3">Companies ({companies.length})</h3>
                                {companies.length === 0 ? (
                                    <p className="text-xs text-slate-400">No companies attached to this order.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {[...companies].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((c, i) => (
                                            <CompanyRow key={c.id} orderId={order.id} company={c} index={i} onChanged={refresh} />
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Invoice */}
                            {(allComplete || hasInvoice) && (
                                <section className="glass-card p-5 cursor-default">
                                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3">Invoice</h3>
                                    {hasInvoice ? (
                                        <button onClick={() => navigate(`/invoices/${order.invoice?.id || order.id}`)}
                                            className="w-full py-2.5 bg-purple-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-purple-700 transition-all flex items-center justify-center gap-2">
                                            <FileCheck size={13} /> View Invoice
                                        </button>
                                    ) : (
                                        <button onClick={handleGenerateInvoice} disabled={saving === 'invoice'}
                                            className="w-full py-2.5 bg-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                            {saving === 'invoice' ? <Loader2 size={13} className="animate-spin" /> : <FileCheck size={13} />} Generate Invoice
                                        </button>
                                    )}
                                </section>
                            )}

                            <button onClick={() => navigate(`/orders/${order.id}`)}
                                className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-1.5">
                                Open full batch page <ExternalLink size={13} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
