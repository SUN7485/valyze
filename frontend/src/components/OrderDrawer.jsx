import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Ban, CalendarClock, CheckCircle2, ChevronDown, Clock, Download, Edit3,
    ExternalLink, FileText, Loader2, PencilLine, PlayCircle, RefreshCw,
    Sparkles, User, UserCheck, X,
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

const STATUS_STYLE = {
    pending: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
    in_progress: 'bg-blue-400/15 text-blue-300 ring-blue-400/30',
    completed: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
    invoiced: 'bg-purple-400/15 text-purple-300 ring-purple-400/30',
    cancelled: 'bg-rose-400/15 text-rose-300 ring-rose-400/30',
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

function getProgress(order) {
    const companies = order?.companies || []
    const total = order?.progress?.total || companies.length || order?.company_count || 0
    const completed = order?.progress?.completed ?? order?.completed_count
        ?? companies.filter(c => norm(c.status) === 'completed').length
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

/* The single most relevant company to act on next. */
function focusCompany(companies) {
    const sorted = [...(companies || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return sorted.find(c => norm(c.status) === 'in_progress')
        || sorted.find(c => norm(c.status) === 'pending')
        || sorted.find(c => norm(c.status) === 'completed')
        || null
}

function StatusPill({ status }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ring-1 ${STATUS_STYLE[norm(status)] || STATUS_STYLE.pending}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> {titleCase(status)}
        </span>
    )
}

function Stat({ label, value, icon }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{icon} {label}</div>
            <div className="text-sm font-bold text-white truncate">{value || '-'}</div>
        </div>
    )
}

function SectionLabel({ children, action }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{children}</h3>
            {action}
        </div>
    )
}

function CompanyRow({ orderId, company, onChanged, isFocus }) {
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
        <div className={`rounded-2xl p-4 transition-colors ${isFocus ? 'bg-primary/[0.07] ring-1 ring-primary/25' : 'bg-white/[0.03] ring-1 ring-white/[0.06]'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{getFlag(company.country)}</span>
                        <h4 className="text-sm font-black text-white truncate">{company.company_name || 'Unnamed Company'}</h4>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{[company.country, company.registration_no].filter(Boolean).join(' · ') || 'No details provided'}</div>
                </div>
                <StatusPill status={status} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {status === 'pending' && (
                    <button onClick={start} disabled={loading}
                        className="flex-1 min-w-[140px] py-2.5 px-4 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />} Start Report
                    </button>
                )}
                {status === 'in_progress' && (
                    <>
                        <button onClick={() => reportId && navigate(`/editor/${reportId}`)} disabled={!reportId}
                            className="flex-1 min-w-[140px] py-2.5 px-4 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                            <PencilLine size={14} /> Continue in Editor
                        </button>
                        <button onClick={complete} disabled={loading}
                            className="py-2.5 px-4 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Complete
                        </button>
                    </>
                )}
                {status === 'completed' && (
                    <button onClick={() => reportId && navigate(`/editor/${reportId}`)} disabled={!reportId}
                        className="flex-1 min-w-[140px] py-2.5 px-4 bg-white/[0.06] text-white ring-1 ring-white/10 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
                        <FileText size={14} /> View Report
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
    const [manageOpen, setManageOpen] = useState(false)
    const [startingFocus, setStartingFocus] = useState(false)

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

    useEffect(() => { if (open && orderId) { setManageOpen(false); setConfirmCancel(false); fetchOrder() } }, [open, orderId, fetchOrder])

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
    const sortedCompanies = useMemo(() => [...companies].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [companies])
    const focus = useMemo(() => focusCompany(companies), [companies])
    const files = order?.files || []
    const isCancelled = order?.status === 'cancelled'
    const allComplete = companies.length > 0 && companies.every(c => norm(c.status) === 'completed')
    const hasInvoice = Boolean(order?.invoice)

    // The one big primary action at the top, driven by the focus company.
    const startFocus = async () => {
        if (!focus) return
        const status = norm(focus.status)
        if (status === 'completed') { if (focus.report_id) navigate(`/editor/${focus.report_id}`); return }
        if (status === 'in_progress') { if (focus.report_id) navigate(`/editor/${focus.report_id}`); return }
        setStartingFocus(true)
        try {
            const res = await ordersAPI.startCompany(order.id, focus.id)
            const rid = res.data?.report_id
            onChanged?.()
            if (rid) navigate(`/extractor/${rid}`)
            else await fetchOrder()
        } catch (e) { setError(e.message || 'Failed to start report') } finally { setStartingFocus(false) }
    }

    const primary = useMemo(() => {
        if (!focus || isCancelled) return null
        const s = norm(focus.status)
        if (s === 'pending') return { label: 'Start Report', icon: PlayCircle }
        if (s === 'in_progress') return { label: 'Continue in Editor', icon: PencilLine, disabled: !focus.report_id }
        if (s === 'completed' && companies.length === 1) return { label: 'View Report', icon: FileText, subtle: true, disabled: !focus.report_id }
        return null
    }, [focus, isCancelled, companies.length])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
            <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-slate-950 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-6 h-16 border-b border-white/[0.07] flex-shrink-0">
                    <div className="min-w-0">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Order Management</div>
                        <div className="font-mono text-lg font-black text-white truncate">{order?.order_number || orderId}</div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={handleDownload} disabled={downloading || !order} title="Download submission (ZIP)"
                            className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all disabled:opacity-30">
                            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        </button>
                        <button onClick={() => fetchOrder()} disabled={loading} title="Refresh"
                            className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all disabled:opacity-30">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={onClose} title="Close" className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {error && (
                        <div className="mx-6 mt-5 p-3 bg-rose-500/10 ring-1 ring-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                            <X size={14} /> {error}
                        </div>
                    )}

                    {loading && !order ? (
                        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="text-primary animate-spin" /></div>
                    ) : !order ? (
                        <div className="text-center py-24 text-slate-500 text-sm font-bold">Order not found.</div>
                    ) : (
                        <div className="px-6 py-6 space-y-7">
                            {/* Hero: status, client, primary action */}
                            <section>
                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    <StatusPill status={order.status} />
                                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-white/[0.06] text-slate-300 ring-1 ring-white/10">{order.service_level || 'standard'}</span>
                                    <button onClick={() => order.client_id && navigate(`/clients/${order.client_id}`)}
                                        className="ml-auto text-sm text-slate-400 hover:text-primary transition-colors">
                                        <span className="text-slate-500">Client · </span><span className="font-black text-white">{order.client?.client_name || order.client_name || 'Unknown'}</span>
                                    </button>
                                </div>

                                {primary ? (
                                    <button onClick={startFocus} disabled={startingFocus || primary.disabled}
                                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2.5 ${primary.subtle ? 'bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/10' : 'bg-primary text-white shadow-lg shadow-primary/25 hover:opacity-90'}`}>
                                        {startingFocus ? <Loader2 size={17} className="animate-spin" /> : <primary.icon size={17} />}
                                        {primary.label}
                                        {focus && companies.length > 1 && <span className="opacity-70 normal-case tracking-normal font-bold">· {focus.company_name}</span>}
                                    </button>
                                ) : (
                                    <div className="w-full py-4 rounded-2xl bg-emerald-500/[0.08] ring-1 ring-emerald-400/20 text-emerald-300 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2.5">
                                        <Sparkles size={16} /> {isCancelled ? 'Order Cancelled' : 'All Reports Complete'}
                                    </div>
                                )}
                            </section>

                            {/* Facts + progress */}
                            <section className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-5">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-5 mb-5">
                                    <Stat label="Date Received" value={formatDate(order.date_received)} icon={<CalendarClock size={11} />} />
                                    <Stat label="Due Date" value={formatDate(order.due_date)} icon={<Clock size={11} />} />
                                    <Stat label="Analyst" value={ANALYST_OPTIONS.find(a => a.value === (order.auto_assigned_analyst || ''))?.label || order.auto_assigned_analyst} icon={<User size={11} />} />
                                    <Stat label="Progress" value={`${progress.completed} / ${progress.total} complete`} icon={<CheckCircle2 size={11} />} />
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                    <span>Completion</span><span className="text-slate-300">{progress.pct}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all duration-500" style={{ width: `${progress.pct}%` }} />
                                </div>
                            </section>

                            {/* Companies — the actual work */}
                            <section>
                                <SectionLabel>Companies · {companies.length}</SectionLabel>
                                {companies.length === 0 ? (
                                    <p className="text-xs text-slate-500">No companies attached to this order.</p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {sortedCompanies.map(c => (
                                            <CompanyRow key={c.id} orderId={order.id} company={c} onChanged={refresh} isFocus={focus?.id === c.id && companies.length > 1} />
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Client submission */}
                            <section>
                                <SectionLabel action={
                                    <button onClick={handleDownload} disabled={downloading}
                                        className="py-1.5 px-3 bg-primary/15 text-primary rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-primary/25 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                        {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download All
                                    </button>
                                }>Client Submission</SectionLabel>
                                {files.length === 0 ? (
                                    <p className="text-xs text-slate-500">No files were attached to this order.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {files.map(file => (
                                            <div key={file.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0"><FileText size={15} /></div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-white truncate">{file.filename || 'Attachment'}</p>
                                                    <p className="text-[10px] text-slate-500">{file.file_type || 'file'} · {formatFileSize(file.file_size)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Invoice */}
                            {(allComplete || hasInvoice) && (
                                <section>
                                    <SectionLabel>Invoice</SectionLabel>
                                    {hasInvoice ? (
                                        <button onClick={() => navigate(`/invoices/${order.invoice?.id || order.id}`)}
                                            className="w-full py-3 bg-purple-500/15 text-purple-300 ring-1 ring-purple-400/30 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-500/25 transition-all flex items-center justify-center gap-2">
                                            <FileText size={14} /> View Invoice
                                        </button>
                                    ) : (
                                        <button onClick={handleGenerateInvoice} disabled={saving === 'invoice'}
                                            className="w-full py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                            {saving === 'invoice' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Generate Invoice
                                        </button>
                                    )}
                                </section>
                            )}

                            {/* Manage (admin) — collapsible to keep the surface calm */}
                            <section className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] overflow-hidden">
                                <button onClick={() => setManageOpen(o => !o)}
                                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
                                    <div className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest"><Edit3 size={13} /> Manage Order</div>
                                    <ChevronDown size={16} className={`text-slate-500 transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {manageOpen && (
                                    <div className="px-5 pb-5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div>
                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2"><UserCheck size={11} /> Assigned Analyst</div>
                                                <select value={analyst} onChange={e => setAnalyst(e.target.value)} disabled={isCancelled}
                                                    className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-primary/30 mb-2 disabled:opacity-50">
                                                    {ANALYST_OPTIONS.map(a => <option key={a.value} value={a.value} className="bg-slate-900">{a.label}</option>)}
                                                </select>
                                                <button onClick={() => applyUpdate({ auto_assigned_analyst: analyst || null }, 'analyst')} disabled={saving === 'analyst' || isCancelled}
                                                    className="w-full py-2 bg-white/[0.06] text-white ring-1 ring-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                                    {saving === 'analyst' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Reassign
                                                </button>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2"><CalendarClock size={11} /> Service Level</div>
                                                <select value={serviceLevel} onChange={e => setServiceLevel(e.target.value)} disabled={isCancelled}
                                                    className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-primary/30 mb-2 disabled:opacity-50">
                                                    {SERVICE_LEVEL_OPTIONS.map(s => <option key={s.value} value={s.value} className="bg-slate-900">{s.label}</option>)}
                                                </select>
                                                <button onClick={() => applyUpdate({ service_level: serviceLevel }, 'service_level')} disabled={saving === 'service_level' || isCancelled}
                                                    className="w-full py-2 bg-white/[0.06] text-white ring-1 ring-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                                    {saving === 'service_level' ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />} Update
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2"><PencilLine size={11} /> Internal Notes</div>
                                            <textarea value={notes} onChange={e => { setNotes(e.target.value); setNotesDirty(true) }} rows={3}
                                                placeholder="Add operational notes for this order..."
                                                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder-slate-600" />
                                            {notesDirty && (
                                                <button onClick={() => applyUpdate({ notes }, 'notes')} disabled={saving === 'notes'}
                                                    className="mt-2 w-full py-2 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                                                    {saving === 'notes' ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />} Save Notes
                                                </button>
                                            )}
                                        </div>

                                        {!isCancelled ? (
                                            !confirmCancel ? (
                                                <button onClick={() => setConfirmCancel(true)}
                                                    className="w-full py-2 text-rose-400 ring-1 ring-rose-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/10 transition-all flex items-center justify-center gap-1.5">
                                                    <Ban size={12} /> Cancel Order
                                                </button>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button onClick={() => setConfirmCancel(false)}
                                                        className="flex-1 py-2 ring-1 ring-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-white/5 transition-all">Keep</button>
                                                    <button onClick={() => { setConfirmCancel(false); applyUpdate({ status: 'cancelled' }, 'cancel') }} disabled={saving === 'cancel'}
                                                        className="flex-1 py-2 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                                                        {saving === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : 'Confirm Cancel'}
                                                    </button>
                                                </div>
                                            )
                                        ) : (
                                            <div className="text-xs font-bold text-rose-400 text-center py-1">This order has been cancelled.</div>
                                        )}
                                    </div>
                                )}
                            </section>

                            <button onClick={() => navigate(`/orders/${order.id}`)}
                                className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-1.5">
                                Open full batch page <ExternalLink size={12} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
