import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Clock, Download, Edit3, ExternalLink, FileCheck, FileText, Loader2, PlayCircle, PencilLine, RefreshCw, User, X } from 'lucide-react'
import { invoicesAPI, ordersAPI } from '../api/client'

const STATUS_LABELS = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    invoiced: 'Invoiced',
}

const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    invoiced: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
}

const SERVICE_LEVELS = {
    basic: { label: 'Basic', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700' },
    standard: { label: 'Standard', className: 'bg-primary/15 text-primary border-primary/25 dark:bg-primary/20 dark:text-primary' },
    express: { label: 'Express', className: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/40' },
    urgent: { label: 'Urgent', className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40' },
}

const COUNTRY_FLAGS = {
    sa: '🇸🇦', 'saudi arabia': '🇸🇦', 'kingdom of saudi arabia': '🇸🇦',
    ae: '🇦🇪', uae: '🇦🇪', 'united arab emirates': '🇦🇪',
    eg: '🇪🇬', egypt: '🇪🇬',
    kw: '🇰🇼', kuwait: '🇰🇼',
    qa: '🇶🇦', qatar: '🇶🇦',
    bh: '🇧🇭', bahrain: '🇧🇭',
    om: '🇴🇲', oman: '🇴🇲',
    jo: '🇯🇴', jordan: '🇯🇴',
    us: '🇺🇸', usa: '🇺🇸', 'united states': '🇺🇸',
    gb: '🇬🇧', uk: '🇬🇧', 'united kingdom': '🇬🇧',
}

function normalizeStatus(status) {
    return String(status || 'pending').toLowerCase()
}

function normalizeServiceLevel(level) {
    return String(level || 'standard').toLowerCase()
}

function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatFileSize(value) {
    const size = Number(value || 0)
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
    if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
    return `${size} B`
}

function getPortalFileUrl(file) {
    if (!file?.order_id || !file?.filename) return '#'
    return `/uploads/portal/${encodeURIComponent(file.order_id)}/${encodeURIComponent(file.filename)}`
}

function getCountryFlag(country) {
    if (!country) return '🌍'
    const key = String(country).trim().toLowerCase()
    return COUNTRY_FLAGS[key] || '🌍'
}

function getInitials(value) {
    const clean = String(value || 'Valyze')
        .replace('@valyze.com', '')
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(part => part[0])
        .join('')
        .toUpperCase()

    return clean.slice(0, 2) || 'VA'
}

function getStatusBadgeClass(status) {
    return STATUS_COLORS[normalizeStatus(status)] || STATUS_COLORS.pending
}

function getServiceLevelConfig(level) {
    return SERVICE_LEVELS[normalizeServiceLevel(level)] || SERVICE_LEVELS.standard
}

function getProgress(order) {
    const companies = order?.companies || []
    const total = order?.progress?.total || companies.length || order?.company_count || 0
    const completed = order?.progress?.completed ?? order?.completed_count ?? companies.filter(company => normalizeStatus(company.status) === 'completed').length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, completed, percentage }
}

function getInvoiceId(order) {
    return order?.invoice?.id || order?.invoice?.invoice_id || order?.invoice_id
}

function NotesModal({ order, isOpen, onClose, onSave, saving }) {
    const [notes, setNotes] = useState(order?.notes || '')

    useEffect(() => {
        if (isOpen) setNotes(order?.notes || '')
    }, [isOpen, order])

    useEffect(() => {
        if (!isOpen) return undefined

        const handleEscape = (event) => {
            if (event.key === 'Escape') onClose()
        }

        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Edit Batch Notes</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{order?.order_number || 'Order notes'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500" aria-label="Close notes modal">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Internal Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={7}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
                        placeholder="Add operational notes for this order..."
                    />
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-white/5 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave({ notes })}
                        disabled={saving}
                        className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
                        Save Notes
                    </button>
                </div>
            </div>
        </div>
    )
}

function StatusBadge({ status }) {
    const normalized = normalizeStatus(status)

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusBadgeClass(status)}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {STATUS_LABELS[normalized] || normalized}
        </span>
    )
}

function ServiceLevelBadge({ level }) {
    const config = getServiceLevelConfig(level)

    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${config.className}`}>
            {config.label}
        </span>
    )
}

function InfoItem({ label, value, icon }) {
    return (
        <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3 min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                {icon} {label}
            </div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value || '-'}</div>
        </div>
    )
}

function OrderHeaderCard({ order, onEditNotes, savingNotes }) {
    const progress = getProgress(order)
    const client = order?.client || {}
    const clientId = order?.client_id || client?.id
    const clientName = client?.client_name || order?.client_name || 'Unknown Client'
    const analyst = order?.auto_assigned_analyst || order?.analyst_assigned || 'Unassigned'

    return (
        <div className="glass-card p-6 mb-6 cursor-default">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className="font-mono text-sm font-black text-primary tracking-tight">{order.order_number || order.id}</span>
                        <StatusBadge status={order.status} />
                        <ServiceLevelBadge level={order.service_level} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300 mb-6">
                        <span className="text-sm font-medium">Client:</span>
                        {clientId ? (
                            <Link to={`/clients/${clientId}`} className="text-sm font-black text-primary hover:underline">{clientName}</Link>
                        ) : (
                            <span className="text-sm font-black text-primary">{clientName}</span>
                        )}
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <InfoItem label="Date Received" value={formatDate(order.date_received)} icon={<CalendarClock size={12} />} />
                        <InfoItem label="Due Date" value={formatDate(order.due_date)} icon={<Clock size={12} />} />
                        <InfoItem label="Assigned Analyst" value={analyst} icon={<User size={12} />} />
                        <InfoItem label="Progress" value={`${progress.completed} of ${progress.total} companies complete`} icon={<CheckCircle2 size={12} />} />
                    </div>
                </div>

                <div className="w-full xl:w-72">
                    <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-5">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                            <span>Completion</span>
                            <span>{progress.percentage}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden mb-4">
                            <div className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all duration-500" style={{ width: `${progress.percentage}%` }} />
                        </div>
                        <button
                            onClick={onEditNotes}
                            disabled={savingNotes}
                            className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
                        >
                            {savingNotes ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
                            Edit Notes
                        </button>
                        {order.notes && (
                            <div className="mt-4 p-3 bg-white/50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Notes</div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{order.notes}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function OrderFilesSection({ files }) {
    const safeFiles = Array.isArray(files) ? files : []
    if (!safeFiles.length) return null

    return (
        <section className="glass-card p-6 mb-6 cursor-default">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Client Attachments</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{safeFiles.length} file{safeFiles.length === 1 ? '' : 's'} submitted through the client portal.</p>
                </div>
            </div>

            <div className="grid gap-3">
                {safeFiles.map((file) => (
                    <a
                        key={file.id}
                        href={getPortalFileUrl(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                <FileText size={18} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-800 dark:text-white truncate">{file.filename || 'Attachment'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {file.file_type || 'file'} · {formatFileSize(file.file_size)}
                                    {file.order_company_id ? ' · linked company' : ' · order level'}
                                </p>
                            </div>
                        </div>
                        <span className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-1 flex-shrink-0">
                            Open <Download size={14} />
                        </span>
                    </a>
                ))}
            </div>
        </section>
    )
}

function CompanyCard({ orderId, company, index, onStarted, onCompleted }) {
    const navigate = useNavigate()
    const [confirmingComplete, setConfirmingComplete] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const status = normalizeStatus(company.status)
    const reportId = company.report_id

    const handleStart = async () => {
        setActionLoading(true)
        try {
            const response = await ordersAPI.startCompany(orderId, company.id)
            const nextReportId = response.data?.report_id || response.data?.redirect_url?.split('/').filter(Boolean).pop()
            onStarted(company.id, nextReportId, response.data)
            if (nextReportId) navigate(`/extractor/${nextReportId}`)
        } catch (e) {
            alert(e.message || 'Failed to start company report')
        } finally {
            setActionLoading(false)
        }
    }

    const handleComplete = async () => {
        if (!window.confirm('Mark this company report as complete?')) return

        setActionLoading(true)
        try {
            const response = await ordersAPI.completeCompany(orderId, company.id)
            onCompleted(company.id, response.data?.progress, response.data?.order_status)
        } catch (e) {
            alert(e.message || 'Failed to mark company report complete')
        } finally {
            setActionLoading(false)
            setConfirmingComplete(false)
        }
    }

    return (
        <div className="glass-card p-5 bg-white/60 dark:bg-white/5 cursor-default">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl" aria-label={`Country flag for ${company.country || 'unknown country'}`}>{getCountryFlag(company.country)}</span>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">{company.company_name || 'Unnamed Company'}</h3>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Sort Order <span className="font-mono text-slate-600 dark:text-slate-300">{company.sort_order ?? index + 1}</span>
                    </div>
                </div>
                {status === 'completed' ? (
                    <span className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40">
                        <CheckCircle2 size={12} /> Completed
                    </span>
                ) : (
                    <StatusBadge status={status} />
                )}
            </div>

            <div className="grid sm:grid-cols-4 gap-3 mb-4">
                <InfoItem label="Registration No" value={company.registration_no} icon={<FileText size={12} />} />
                <InfoItem label="VAT" value={company.vat_no} icon={<FileText size={12} />} />
                <InfoItem label="Phone" value={company.phone} icon={<FileText size={12} />} />
                <InfoItem label="Requested Limit" value={company.requested_limit} icon={<FileText size={12} />} />
            </div>

            {company.comments && (
                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-4 mb-4">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Comments</div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{company.comments}</p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                {status === 'pending' && (
                    <button
                        onClick={handleStart}
                        disabled={actionLoading}
                        className="py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                        ▶ Start Report
                    </button>
                )}

                {status === 'in_progress' && (
                    <>
                        <Link
                            to={reportId ? `/editor/${reportId}` : '#'}
                            className="py-3 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                        >
                            <PencilLine size={14} />
                            ✏ Continue in Editor
                        </Link>
                        <button
                            onClick={handleComplete}
                            disabled={actionLoading}
                            className="py-3 px-4 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                        >
                            {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            ✓ Mark Complete
                        </button>
                        {reportId && (
                            <button
                                onClick={() => navigate(`/editor/${reportId}`)}
                                className="font-mono text-xs font-bold text-primary hover:underline flex items-center gap-1"
                            >
                                Report ID: {reportId} <ExternalLink size={12} />
                            </button>
                        )}
                    </>
                )}

                {status === 'completed' && (
                    <>
                        <Link
                            to={reportId ? `/editor/${reportId}` : '#'}
                            className="py-3 px-4 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <FileCheck size={14} />
                            View Report
                        </Link>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            Completed {formatDateTime(company.updated_at)}
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}

function CompaniesSection({ orderId, companies, onStarted, onCompleted }) {
    const sortedCompanies = useMemo(() => {
        return [...companies].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }, [companies])

    return (
        <section>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Companies in this Batch</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{companies.length} companies attached to this order</p>
                </div>
            </div>

            {sortedCompanies.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">No Companies Found</h3>
                    <p className="text-slate-400 text-sm">This order does not have any company records yet.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {sortedCompanies.map((company, index) => (
                        <CompanyCard
                            key={company.id}
                            orderId={orderId}
                            company={company}
                            index={index}
                            onStarted={onStarted}
                            onCompleted={onCompleted}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

function BottomActionBar({ order, onGenerateInvoice, generating }) {
    const navigate = useNavigate()
    const companies = order?.companies || []
    const allCompaniesComplete = companies.length > 0 && companies.every(company => normalizeStatus(company.status) === 'completed')
    const hasInvoice = Boolean(order?.invoice)
    const invoiceId = getInvoiceId(order)
    const canGenerateInvoice = allCompaniesComplete && !hasInvoice && order?.status !== 'invoiced'

    if (!canGenerateInvoice && !hasInvoice) return null

    return (
        <div className="sticky bottom-4 mt-6 z-20">
            <div className="glass-card p-4 cursor-default">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white">Order Actions</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {hasInvoice ? 'Invoice is already attached to this order.' : 'All companies are complete and ready for invoice generation.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {hasInvoice ? (
                            <button
                                onClick={() => navigate(`/invoices/${invoiceId || order.id}`)}
                                className="w-full sm:w-auto py-3 px-5 bg-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <FileCheck size={14} />
                                View Invoice
                            </button>
                        ) : (
                            <button
                                onClick={onGenerateInvoice}
                                disabled={generating}
                                className="w-full sm:w-auto py-3 px-5 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {generating ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
                                Generate Invoice
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function OrderDetailPage() {
    const navigate = useNavigate()
    const { orderId } = useParams()
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [savingNotes, setSavingNotes] = useState(false)
    const [notesOpen, setNotesOpen] = useState(false)
    const [generatingInvoice, setGeneratingInvoice] = useState(false)
    const [companyActions, setCompanyActions] = useState({})

    const fetchOrder = useCallback(async () => {
        if (!orderId) return

        try {
            setLoading(true)
            setError('')
            const response = await ordersAPI.getOne(orderId)
            setOrder(response.data)
        } catch (e) {
            setError(e.message || 'Failed to load order')
        } finally {
            setLoading(false)
        }
    }, [orderId])

    useEffect(() => {
        fetchOrder()
    }, [fetchOrder])

    const updateCompany = useCallback((companyId, patch) => {
        setOrder(current => ({
            ...current,
            companies: current.companies.map(company => company.id === companyId ? { ...company, ...patch } : company),
        }))
    }, [])

    const handleCompanyStarted = useCallback((companyId, reportId) => {
        updateCompany(companyId, { report_id: reportId, status: 'in_progress' })
    }, [updateCompany])

    const handleCompanyCompleted = useCallback((companyId, progress, orderStatus) => {
        updateCompany(companyId, { status: 'completed' })
        setOrder(current => ({
            ...current,
            progress: progress || current.progress,
            status: orderStatus || current.status,
        }))
    }, [updateCompany])

    const handleSaveNotes = async (data) => {
        if (!order) return

        try {
            setSavingNotes(true)
            setError('')
            await ordersAPI.update(order.id, data)
            setOrder(current => ({ ...current, notes: data.notes }))
            setNotesOpen(false)
        } catch (e) {
            setError(e.message || 'Failed to save order notes')
        } finally {
            setSavingNotes(false)
        }
    }

    const handleGenerateInvoice = async () => {
        if (!order) return

        try {
            setGeneratingInvoice(true)
            setError('')
            const response = await invoicesAPI.generate(order.id)
            const invoiceId = response.data?.id || getInvoiceId({ invoice: response.data })
            if (!invoiceId) throw new Error('Invoice generated, but no invoice ID was returned')
            navigate(`/invoices/${invoiceId}`)
        } catch (e) {
            setError(e.message || 'Failed to generate invoice')
        } finally {
            setGeneratingInvoice(false)
        }
    }

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto pb-36">
            <button
                onClick={() => navigate('/orders')}
                className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors"
            >
                <ArrowLeft size={16} /> Back to Batches
            </button>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading order...</span>
                </div>
            ) : !order ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">Order Not Found</h3>
                    <button onClick={() => navigate('/orders')} className="mt-4 text-primary font-black uppercase tracking-widest text-xs">Return to Orders</button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Batch Detail</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage companies, reports, and invoice generation.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    const companies = order.companies || []
                                    const firstCompany = companies[0]?.company_name || 'Order'
                                    const name = order.client_ref || firstCompany
                                    const safe = name.replace(/[^\w\-\s]/g, '_').trim()
                                    const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `${safe}.json`
                                    a.click()
                                    URL.revokeObjectURL(url)
                                }}
                                className="p-3 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
                                aria-label="Download order as JSON"
                                title="Download order"
                            >
                                <Download size={18} />
                            </button>
                            <button
                                onClick={() => fetchOrder()}
                                className="p-3 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                aria-label="Refresh order"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>

                    <OrderHeaderCard order={order} onEditNotes={() => setNotesOpen(true)} savingNotes={savingNotes} />

                    <OrderFilesSection files={order.files || []} />

                    <CompaniesSection
                        orderId={order.id}
                        companies={order.companies || []}
                        onStarted={handleCompanyStarted}
                        onCompleted={handleCompanyCompleted}
                    />

                    <BottomActionBar
                        order={order}
                        onGenerateInvoice={handleGenerateInvoice}
                        generating={generatingInvoice}
                    />

                    <NotesModal
                        order={order}
                        isOpen={notesOpen}
                        onClose={() => setNotesOpen(false)}
                        onSave={handleSaveNotes}
                        saving={savingNotes}
                    />
                </>
            )}
        </div>
    )
}
