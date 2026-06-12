import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, RefreshCw, Shield, X } from 'lucide-react'
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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(number)
}

function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

function parseLineItems(invoice) {
    const rawItems = invoice?.line_items
    if (Array.isArray(rawItems)) return rawItems
    if (typeof rawItems === 'string' && rawItems.trim()) {
        try {
            const parsed = JSON.parse(rawItems)
            return Array.isArray(parsed) ? parsed : []
        } catch (e) {
            return []
        }
    }
    return []
}

function getLineQty(item) {
    return Number(item.qty ?? item.quantity ?? item.units ?? 1) || 1
}

function getLineUnitPrice(item) {
    return Number(item.unit_price ?? item.price ?? item.unit_price_usd ?? 0) || 0
}

function getLineTotal(item) {
    const parsedTotal = Number(item.total ?? item.line_total ?? item.amount ?? NaN)
    if (Number.isFinite(parsedTotal)) return parsedTotal
    return getLineQty(item) * getLineUnitPrice(item)
}

function getInvoiceNumber(invoice) {
    return invoice?.invoice_number || invoice?.number || invoice?.id || 'Invoice'
}

function getClientName(invoice) {
    return invoice.client_name
        || invoice.client?.client_name
        || invoice.client?.name
        || invoice.client_id
        || '-'
}

function getValyzeId(invoice) {
    return invoice.valyze_id
        || invoice.client?.valyze_id
        || invoice.client_id
        || '-'
}

function getCountry(invoice) {
    return invoice.country
        || invoice.client?.country
        || '-'
}

function getOrderNumber(invoice) {
    return invoice.order_number
        || invoice.order?.order_number
        || invoice.order_id
        || '-'
}

function getInvoiceDate(invoice) {
    return invoice.invoice_date
        || invoice.date
        || invoice.created_at
        || invoice.updated_at
        || '-'
}

function getDiscountPct(invoice, subtotal, discountAmount) {
    const explicitPct = Number(
        invoice?.volume_discount_pct
        ?? invoice?.discount_pct
        ?? invoice?.discount_percentage
        ?? NaN
    )
    if (Number.isFinite(explicitPct)) return explicitPct
    if (Number.isFinite(discountAmount) && subtotal > 0) return Number(((discountAmount / subtotal) * 100).toFixed(2))
    return 0
}

function getTotals(invoice, lineItems) {
    const subtotalFromLines = lineItems.reduce((sum, item) => sum + getLineTotal(item), 0)
    const subtotal = Number(invoice?.subtotal ?? subtotalFromLines) || subtotalFromLines
    const total = Number(invoice?.total_amount ?? invoice?.total ?? invoice?.grand_total ?? subtotal) || 0
    const explicitDiscount = Number(invoice?.discount_amount ?? invoice?.volume_discount_amount ?? invoice?.discount ?? NaN)
    const discountAmount = Number.isFinite(explicitDiscount)
        ? explicitDiscount
        : Math.max(0, subtotal - total)

    return {
        subtotal,
        discountAmount,
        discountPct: getDiscountPct(invoice, subtotal, discountAmount),
        total,
    }
}

function extractHtml(response) {
    if (typeof response.data === 'string') return response.data
    if (typeof response.data?.html === 'string') return response.data.html
    if (response.data?.invoice_html) return response.data.invoice_html
    return ''
}

function openHtmlWindow(loadingMessage) {
    const popup = window.open('', '_blank')
    if (!popup) return null

    popup.document.open()
    popup.document.write(`<!doctype html><html><body style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;background:#f8fafc;color:#334155;">${loadingMessage}</body></html>`)
    popup.document.close()
    return popup
}

function writeHtmlWindow(popup, html) {
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
}

function writeErrorWindow(popup, message) {
    popup.document.open()
    popup.document.body.textContent = message
    popup.document.close()
}

function downloadHtmlFallback(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename.replace(/\.pdf$/i, '.html')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export default function InvoiceDetailPage() {
    const { invoiceId } = useParams()
    const navigate = useNavigate()
    const [invoice, setInvoice] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [downloading, setDownloading] = useState(false)
    const [updating, setUpdating] = useState(false)

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

    useEffect(() => {
        fetchInvoice()
    }, [invoiceId])

    const handleDownloadPdf = async () => {
        const filename = `Valyze-Invoice-${String(invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf`
        const popup = openHtmlWindow('Preparing invoice PDF...')

        try {
            setDownloading(true)
            setError('')
            const response = await invoicesAPI.getHtml(invoiceId)
            const html = extractHtml(response)

            if (!html) {
                throw new Error('Invoice HTML was empty')
            }

            if (popup) {
                writeHtmlWindow(popup, html)
            } else {
                downloadHtmlFallback(html, filename)
            }
        } catch (e) {
            if (popup) {
                writeErrorWindow(popup, `Failed to download PDF: ${e.message}`)
            }
            setError(`Failed to download PDF: ${e.message}`)
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
            setError(`Failed to update invoice status: ${e.message}`)
        } finally {
            setUpdating(false)
        }
    }

    return (
        <div className="py-8 px-4 md:px-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-6">
                <button
                    onClick={() => navigate('/invoices')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-all"
                    aria-label="Back to invoices"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchInvoice}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50"
                        aria-label="Refresh invoice"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        disabled={downloading || loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
                        aria-label={`Download PDF for invoice ${invoiceNumber}`}
                    >
                        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Download PDF
                    </button>
                    <button
                        onClick={() => handleUpdateStatus('sent')}
                        disabled={status !== 'draft' || updating || loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-blue-100 hover:text-blue-700 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Mark invoice as sent"
                    >
                        {updating ? <Loader2 size={16} className="animate-spin" /> : null}
                        Mark as Sent
                    </button>
                    <button
                        onClick={() => handleUpdateStatus('paid')}
                        disabled={status !== 'sent' || updating || loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-emerald-100 hover:text-emerald-700 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Mark invoice as paid"
                    >
                        {updating ? <Loader2 size={16} className="animate-spin" /> : null}
                        Mark as Paid
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading invoice...</span>
                </div>
            ) : !invoice ? (
                <div className="glass-card p-12 text-center">
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">Invoice Not Found</h3>
                    <p className="text-slate-400 text-sm">The requested invoice could not be loaded.</p>
                </div>
            ) : (
                <div className="glass-card p-6 md:p-10">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
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
                                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{invoice.service_level || invoice.order?.service_level || '-'}</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Report Type</div>
                                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{invoice.report_type || invoice.order?.report_type || '-'}</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Due Date</div>
                                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{formatDate(invoice.due_date || invoice.order?.due_date)}</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3 col-span-2">
                                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Date Received</div>
                                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{formatDate(invoice.date_received || invoice.order?.date_received)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

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
                                        {lineItems.length > 0 ? lineItems.map((item, index) => (
                                            <tr key={`${getLineUnitPrice(item)}-${index}`} className="bg-white dark:bg-slate-950">
                                                <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{index + 1}</td>
                                                <td className="px-4 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                    {item.description || item.service || item.name || '-'}
                                                </td>
                                                <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400">{getLineQty(item)}</td>
                                                <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400">{formatCurrency(getLineUnitPrice(item))}</td>
                                                <td className="px-4 py-4 text-sm text-right font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(getLineTotal(item))}</td>
                                            </tr>
                                        )) : (
                                            <tr className="bg-white dark:bg-slate-950">
                                                <td colSpan="5" className="px-4 py-8 text-center text-sm text-slate-400">No line items available.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end mt-6">
                                <div className="w-full md:w-80 space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 dark:text-slate-400 font-semibold">Subtotal</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(totals.subtotal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 dark:text-slate-400 font-semibold">Volume Discount ({totals.discountPct}%)</span>
                                        <span className="font-bold text-rose-500">-{formatCurrency(totals.discountAmount)}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-4 text-base">
                                        <span className="text-slate-800 dark:text-white font-black">TOTAL</span>
                                        <span className="font-black text-slate-900 dark:text-white">{formatCurrency(totals.total)} USD</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-white/5 p-8 border-t border-slate-200 dark:border-white/10">
                            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Payment Terms: Net 15 days</div>
                            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">For questions: billing@valyze.com</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
