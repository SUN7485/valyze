import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Eye, Loader2, RefreshCw, FileText, X } from 'lucide-react'
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
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${className}`}>
            {normalized || 'Unknown'}
        </span>
    )
}

function formatCurrency(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '-'
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
        month: 'short',
        day: 'numeric',
    })
}

function getInvoiceNumber(invoice) {
    return invoice.invoice_number || invoice.number || invoice.id || '-'
}

function getClientName(invoice) {
    return invoice.client_name
        || invoice.client?.client_name
        || invoice.client?.name
        || invoice.client_id
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

function getCompanies(invoice) {
    return invoice.company_count
        ?? invoice.companies_count
        ?? invoice.companies?.length
        ?? '-'
}

function getUnitPrice(invoice) {
    return invoice.unit_price
        ?? invoice.price_per_company
        ?? invoice.unit_price_usd
        ?? ''
}

function getDiscount(invoice) {
    return invoice.discount_amount
        ?? invoice.volume_discount_amount
        ?? invoice.discount
        ?? ''
}

function getTotal(invoice) {
    return invoice.total_amount
        ?? invoice.total
        ?? invoice.grand_total
        ?? ''
}

function extractHtml(response) {
    if (typeof response.data === 'string') return response.data
    if (typeof response.data?.html === 'string') return response.data.html
    if (response.data?.invoice_html) return response.data.invoice_html
    return ''
}

function openHtmlWindow(loadingMessage) {
    const popup = window.open('', '_blank')
    if (!popup) {
        return null
    }

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

export default function InvoicesPage() {
    const navigate = useNavigate()
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [downloading, setDownloading] = useState({})
    const [updating, setUpdating] = useState({})

    const sortedInvoices = useMemo(() => {
        return [...invoices].sort((a, b) => {
            const aDate = new Date(getInvoiceDate(a)).getTime() || 0
            const bDate = new Date(getInvoiceDate(b)).getTime() || 0
            return bDate - aDate
        })
    }, [invoices])

    const fetchInvoices = async () => {
        try {
            setLoading(true)
            setError('')
            const response = await invoicesAPI.getAll()
            setInvoices(Array.isArray(response.data) ? response.data : response.data.invoices || [])
        } catch (e) {
            setError(e.message || 'Failed to load invoices')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchInvoices()
    }, [])

    const handleDownloadPdf = async (invoice) => {
        const invoiceNumber = getInvoiceNumber(invoice)
        const filename = `Valyze-Invoice-${String(invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf`
        const popup = openHtmlWindow('Preparing invoice PDF...')

        try {
            setDownloading(prev => ({ ...prev, [invoice.id]: true }))
            setError('')
            const response = await invoicesAPI.getHtml(invoice.id)
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
            setDownloading(prev => ({ ...prev, [invoice.id]: false }))
        }
    }

    const handleUpdateStatus = async (invoice, status) => {
        try {
            setUpdating(prev => ({ ...prev, [invoice.id]: true }))
            setError('')
            await invoicesAPI.updateStatus(invoice.id, status)
            setInvoices(prev => prev.map(item => (
                item.id === invoice.id ? { ...item, status } : item
            )))
        } catch (e) {
            setError(`Failed to update invoice status: ${e.message}`)
        } finally {
            setUpdating(prev => ({ ...prev, [invoice.id]: false }))
        }
    }

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Invoices</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        View, export, and update invoice status.
                    </p>
                </div>
                <button
                    onClick={fetchInvoices}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
                    aria-label="Refresh invoices"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading invoices...</span>
                </div>
            ) : invoices.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">No Invoices Found</h3>
                    <p className="text-slate-400 text-sm">Invoices will appear here after they are generated.</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse min-w-[1180px]">
                            <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                                <tr className="border-b border-slate-200 dark:border-white/10">
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Invoice #</th>
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Client</th>
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Order #</th>
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Companies</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Unit Price</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Discount</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Total</th>
                                    <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {sortedInvoices.map((invoice) => {
                                    const invoiceNumber = getInvoiceNumber(invoice)
                                    const status = String(invoice.status || '').toLowerCase()
                                    const busy = downloading[invoice.id] || updating[invoice.id]

                                    return (
                                        <tr key={invoice.id} className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all duration-200">
                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                                                    className="font-bold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors text-left text-sm"
                                                >
                                                    {invoiceNumber}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                                {getClientName(invoice)}
                                            </td>
                                            <td className="px-4 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">
                                                {getOrderNumber(invoice)}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                {formatDate(getInvoiceDate(invoice))}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                                                {getCompanies(invoice)}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                {formatCurrency(getUnitPrice(invoice))}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                {formatCurrency(getDiscount(invoice))}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-right font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                {formatCurrency(getTotal(invoice))}
                                            </td>
                                            <td className="px-4 py-4">
                                                <StatusBadge status={status} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                                                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
                                                        aria-label={`View invoice ${invoiceNumber}`}
                                                        title="View"
                                                    >
                                                        {busy ? <Loader2 size={18} className="animate-spin" /> : <Eye size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadPdf(invoice)}
                                                        disabled={downloading[invoice.id]}
                                                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-50"
                                                        aria-label={`Download PDF for invoice ${invoiceNumber}`}
                                                        title="Download PDF"
                                                    >
                                                        {downloading[invoice.id] ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(invoice, 'sent')}
                                                        disabled={status !== 'draft' || updating[invoice.id]}
                                                        className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        aria-label={`Mark invoice ${invoiceNumber} as sent`}
                                                        title="Mark as Sent"
                                                    >
                                                        {updating[invoice.id] ? 'Updating' : 'Mark Sent'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(invoice, 'paid')}
                                                        disabled={status !== 'sent' || updating[invoice.id]}
                                                        className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        aria-label={`Mark invoice ${invoiceNumber} as paid`}
                                                        title="Mark as Paid"
                                                    >
                                                        {updating[invoice.id] ? 'Updating' : 'Mark Paid'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
