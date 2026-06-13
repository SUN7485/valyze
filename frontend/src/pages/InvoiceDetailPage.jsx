import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, RefreshCw, Shield, X, Edit3, Save } from 'lucide-react'
import { invoicesAPI } from '../api/client'

const STATUS_STYLES = {
    draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    sent: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    paid: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
}

function StatusBadge({ status }) {
    const normalized = String(status || '').toLowerCase()
    const className = STATUS_STYLES[normalized] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'
    return (
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${className}`}>
            {normalized || 'Unknown'}
        </span>
    )
}

function formatCurrency(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
}

function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function parseLineItems(invoice) {
    const rawItems = invoice?.line_items
    if (Array.isArray(rawItems)) return rawItems
    if (typeof rawItems === 'string' && rawItems.trim()) {
        try { const parsed = JSON.parse(rawItems); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
    }
    return []
}

function calcLineTotal(item) {
    const total = Number(item.total ?? item.line_total ?? item.amount ?? NaN)
    if (Number.isFinite(total)) return total
    const qty = Number(item.qty ?? item.quantity ?? item.units ?? 1) || 1
    const unit = Number(item.unit_price ?? item.price ?? item.unit_price_usd ?? 0) || 0
    return qty * unit
}

function getLineQty(item) { return Number(item.qty ?? item.quantity ?? item.units ?? 1) || 1 }
function getLineUnitPrice(item) { return Number(item.unit_price ?? item.price ?? item.unit_price_usd ?? 0) || 0 }

function getInvoiceNumber(invoice) { return invoice?.invoice_number || invoice?.number || invoice?.id || 'Invoice' }
function getClientName(invoice) { return invoice.client_name || invoice.client?.client_name || invoice.client?.name || invoice.client_id || '-' }
function getValyzeId(invoice) { return invoice.valyze_id || invoice.client?.valyze_id || invoice.client_id || '-' }
function getCountry(invoice) { return invoice.country || invoice.client?.country || '-' }
function getOrderNumber(invoice) { return invoice.order_number || invoice.order?.order_number || invoice.order_id || '-' }
function getOrderServiceLevel(invoice) { return invoice.service_level || invoice.order?.service_level || '-' }
function getOrderReportType(invoice) { return invoice.report_type || invoice.order?.report_type || '-' }
function getOrderDueDate(invoice) { return invoice.due_date || invoice.order?.due_date }
function getOrderDateReceived(invoice) { return invoice.date_received || invoice.order?.date_received }
function getInvoiceDate(invoice) { return invoice.invoice_date || invoice.date || invoice.created_at || invoice.updated_at || '-' }
function getDiscountPct(invoice, subtotal, discountAmount) {
    const explicitPct = Number(invoice?.volume_discount_pct ?? invoice?.discount_pct ?? invoice?.discount_percentage ?? NaN)
    if (Number.isFinite(explicitPct)) return explicitPct
    if (Number.isFinite(discountAmount) && subtotal > 0) return Number(((discountAmount / subtotal) * 100).toFixed(2))
    return 0
}
function getTotals(invoice, lineItems) {
    const subtotalFromLines = lineItems.reduce((sum, item) => sum + calcLineTotal(item), 0)
    const subtotal = Number(invoice?.subtotal ?? subtotalFromLines) || subtotalFromLines
    const total = Number(invoice?.total_amount ?? invoice?.total ?? invoice?.grand_total ?? subtotal) || 0
    const explicitDiscount = Number(invoice?.discount_amount ?? invoice?.volume_discount_amount ?? invoice?.discount ?? NaN)
    const discountAmount = Number.isFinite(explicitDiscount) ? explicitDiscount : Math.max(0, subtotal - total)
    return { subtotal, discountAmount, discountPct: getDiscountPct(invoice, subtotal, discountAmount), total }
}
function extractHtml(response) {
    if (typeof response.data === 'string') return response.data
    if (typeof response.data?.html === 'string') return response.data.html
    if (response.data?.invoice_html) return response.data.invoice_html
    return ''
}

export default function InvoiceDetailPage() {
    const { invoiceId } = useParams()
    const navigate = useNavigate()
    const [invoice, setInvoice] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [downloading, setDownloading] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editDraft, setEditDraft] = useState(null)

    const lineItems = useMemo(() => parseLineItems(invoice), [invoice])
    const totals = useMemo(() => getTotals(invoice, lineItems), [invoice, lineItems])
    const status = String(invoice?.status || '').toLowerCase()
    const invoiceNumber = getInvoiceNumber(invoice)

    const fetchInvoice = async () => {
        if (!invoiceId) return
        try {
            setLoading(true)
            setError('')
            const response = await invoicesAPI.getOne(invoiceId)
            setInvoice(response.data)
        } catch (e) {
            setError(e.message || 'Failed to load invoice')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchInvoice() }, [invoiceId])

    const startEdit = () => {
        if (!invoice) return
        setEditDraft({
            unit_price: Number(invoice.unit_price) || 0,
            subtotal: Number(invoice.subtotal) || 0,
            discount_amount: Number(invoice.discount_amount) || 0,
            total: Number(invoice.total) || 0,
            notes: invoice.notes || '',
            line_items: lineItems.map(item => ({
                description: item.description || item.service || item.name || 'Credit Report',
                qty: getLineQty(item),
                unit_price: getLineUnitPrice(item),
                total: calcLineTotal(item),
            })),
            service_level: invoice.service_level || '',
            report_type: invoice.report_type || '',
            company_count: invoice.company_count || lineItems.length || 0,
            currency: invoice.currency || 'USD',
        })
        setEditing(true)
    }

    const updateEditLine = (index, field, value) => {
        setEditDraft(prev => {
            const updated = { ...prev, line_items: [...prev.line_items] }
            updated.line_items[index] = { ...updated.line_items[index], [field]: value }
            if (field === 'qty' || field === 'unit_price') {
                const qty = Number(updated.line_items[index].qty) || 0
                const unit = Number(updated.line_items[index].unit_price) || 0
                updated.line_items[index].total = qty * unit
            }
            const newSubtotal = updated.line_items.reduce((s, it) => s + (Number(it.total) || 0), 0)
            updated.subtotal = newSubtotal
            updated.total = Math.max(0, newSubtotal - (Number(updated.discount_amount) || 0))
            return updated
        })
    }

    const handleSave = async () => {
        if (!invoice?.id || !editDraft) return
        try {
            setUpdating(true)
            setError('')
            await invoicesAPI.update(invoice.id, {
                line_items: editDraft.line_items,
                subtotal: editDraft.subtotal,
                discount_amount: editDraft.discount_amount,
                total: editDraft.total,
                notes: editDraft.notes,
                service_level: editDraft.service_level,
                report_type: editDraft.report_type,
                company_count: editDraft.company_count,
                unit_price: editDraft.unit_price,
                currency: editDraft.currency,
                status: status,
            })
            await fetchInvoice()
            setEditing(false)
            setEditDraft(null)
        } catch (e) {
            setError(`Failed to save: ${e.message}`)
        } finally {
            setUpdating(false)
        }
    }

    const handleDownloadPdf = async () => {
        const filename = `Valyze-Invoice-${String(invoiceNumber).replace(/[^\w.-]+/g, '_')}.html`
        try {
            setDownloading(true)
            setError('')
            const response = await invoicesAPI.getHtml(invoiceId)
            const rawHtml = extractHtml(response)
            if (!rawHtml) throw new Error('Invoice HTML was empty')

            // Save as HTML file (clean, printable light mode from backend now)
            const blob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (e) {
            setError(`Failed to download: ${e.message}`)
        } finally {
            setDownloading(false)
        }
    }

    const handleUpdateStatus = async (nextStatus) => {
        if (!invoice?.id) return
        try {
            setUpdating(true)
            setError('')
            await invoicesAPI.updateStatus(invoice.id, nextStatus)
            await fetchInvoice()
        } catch (e) {
            setError(`Failed to update status: ${e.message}`)
        } finally {
            setUpdating(false)
        }
    }

    if (loading) {
        return (
            <div className="py-8 px-4 md:px-6 max-w-7xl mx-auto">
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading invoice...</span>
                </div>
            </div>
        )
    }

    if (!invoice) {
        return (
            <div className="py-8 px-4 md:px-6 max-w-7xl mx-auto">
                <div className="glass-card p-12 text-center">
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">Invoice Not Found</h3>
                    <p className="text-slate-400 text-sm">The requested invoice could not be loaded.</p>
                </div>
            </div>
        )
    }

    const displayItems = editing ? editDraft.line_items : lineItems
    const displaySubtotal = editing ? editDraft.subtotal : totals.subtotal
    const displayDiscount = editing ? editDraft.discount_amount : totals.discountAmount
    const displayTotal = editing ? editDraft.total : totals.total
    const discountPct = editing ? getDiscountPct(editDraft, editDraft.subtotal, editDraft.discount_amount) : totals.discountPct

    return (
        <div className="py-8 px-4 md:px-6 max-w-7xl mx-auto">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <button
                    onClick={() => navigate('/invoices')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-all"
                >
                    <ArrowLeft size={16} /> Back
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={fetchInvoice}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    {!editing ? (
                        <button onClick={startEdit} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 shadow-md">
                            <Edit3 size={14} /> Edit
                        </button>
                    ) : (
                        <button onClick={handleSave} disabled={updating} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 shadow-md">
                            {updating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                        </button>
                    )}
                    <button
                        onClick={handleDownloadPdf}
                        disabled={downloading || loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
                    >
                        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Download PDF
                    </button>
                    {!editing && (
                        <>
                            <button
                                onClick={() => handleUpdateStatus('sent')}
                                disabled={status !== 'draft' || updating || loading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {updating ? <Loader2 size={16} className="animate-spin" /> : null} Mark as Sent
                            </button>
                            <button
                                onClick={() => handleUpdateStatus('paid')}
                                disabled={status !== 'sent' || updating || loading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {updating ? <Loader2 size={16} className="animate-spin" /> : null} Mark as Paid
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {/* Invoice card */}
            <div className="glass-card p-6 md:p-10">
                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="p-8 border-b border-slate-200 dark:border-white/10">
                        <div className="flex items-start justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                    <Shield size={32} />
                                </div>
                                <div>
                                    <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">VALYZE</div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Credit Intelligence</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">TAX INVOICE</h1>
                                <div className="flex items-center justify-end gap-3 mt-3">
                                    <StatusBadge status={status} />
                                </div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-3 gap-4 mt-8">
                            <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Invoice Number</div>
                                <div className="font-bold text-slate-800 dark:text-slate-100">{invoiceNumber}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Date</div>
                                <div className="font-bold text-slate-800 dark:text-slate-100">{formatDate(getInvoiceDate(invoice))}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</div>
                                <div className="font-bold capitalize text-slate-800 dark:text-slate-100">{status || 'Unknown'}</div>
                            </div>
                        </div>
                    </div>

                    {/* Bill To + Order Reference */}
                    <div className="grid md:grid-cols-2 gap-8 p-8 border-b border-slate-200 dark:border-white/10">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Bill To</div>
                            <div className="text-xl font-black text-slate-900 dark:text-white mb-1">{getClientName(invoice)}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">Valyze ID: {getValyzeId(invoice)}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">Country: {getCountry(invoice)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Order Reference</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Order Number</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{getOrderNumber(invoice)}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Service Level</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{getOrderServiceLevel(invoice)}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Report Type</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{getOrderReportType(invoice)}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Due Date</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{formatDate(getOrderDueDate(invoice))}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 col-span-2">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Date Received</div>
                                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{formatDate(getOrderDateReceived(invoice))}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="p-8">
                        <div className="overflow-hidden border border-slate-200 dark:border-white/10 rounded-2xl">
                            <table className="w-full border-collapse">
                                <thead className="bg-slate-50 dark:bg-white/5">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Qty</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Unit Price</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {displayItems.length > 0 ? displayItems.map((item, index) => (
                                        <tr key={index} className="bg-white dark:bg-slate-950">
                                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{index + 1}</td>
                                            <td className="px-4 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.description || 'Credit Report'}</td>
                                            {editing ? (
                                                <>
                                                    <td className="px-4 py-4 text-right">
                                                        <input type="number" min="1" value={item.qty}
                                                            onChange={e => updateEditLine(index, 'qty', Number(e.target.value) || 1)}
                                                            className="w-16 text-right text-sm border border-slate-200 dark:border-white/10 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <input type="number" min="0" step="0.01" value={item.unit_price}
                                                            onChange={e => updateEditLine(index, 'unit_price', Number(e.target.value) || 0)}
                                                            className="w-24 text-right text-sm border border-slate-200 dark:border-white/10 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
                                                    </td>
                                                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(item.total)}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400">{getLineQty(item)}</td>
                                                    <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400">{formatCurrency(getLineUnitPrice(item))}</td>
                                                    <td className="px-4 py-4 text-sm text-right font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(calcLineTotal(item))}</td>
                                                </>
                                            )}
                                        </tr>
                                    )) : (
                                        <tr className="bg-white dark:bg-slate-950">
                                            <td colSpan="5" className="px-4 py-8 text-center text-sm text-slate-400">No line items available.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end mt-6">
                            <div className="w-full md:w-80 space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Subtotal</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(displaySubtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Volume Discount ({discountPct}%)</span>
                                    <span className="font-bold text-rose-500">-{formatCurrency(displayDiscount)}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-4 text-base">
                                    <span className="text-slate-800 dark:text-white font-black">TOTAL</span>
                                    <span className="font-black text-slate-900 dark:text-white">{formatCurrency(displayTotal)} USD</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 dark:bg-white/5 p-8 border-t border-slate-200 dark:border-white/10">
                        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Payment Terms: Net 15 days</div>
                        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">For questions: billing@valyze.com</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
