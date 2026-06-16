import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
    PlayCircle, History, FileText, ArrowRight, Upload, Database, Info, 
    PlusCircle, Zap, ArrowLeft, AlertCircle, ClipboardCheck, Sparkles, 
    Activity, Search, User, ShieldCheck, Users, Briefcase, FileSignature, 
    Coins, Loader2, Plus, CheckCircle, Clock, ChevronRight
} from 'lucide-react'
import { useReport } from '../context/ReportContext'
import { useAuth } from '../context/AuthContext'
import { reportAPI, ordersAPI, clientsAPI, invoicesAPI } from '../api/client'

// Status and Role styling maps
const ROLE_COLORS = {
    super_admin: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    admin: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    analyst: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    reviewer: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
}

const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    invoiced: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
}

const INVOICE_STATUS_COLORS = {
    paid: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    unpaid: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40',
    draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700',
    sent: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
}

// Order Summary Modal
function OrderSummaryModal({ isOpen, onClose, onSubmit, savedOrder }) {
    const [formData, setFormData] = useState({
        client_name: savedOrder?.client_name || '',
        client_reference: savedOrder?.client_reference || '',
        analyst_name: savedOrder?.analyst_name || '',
        analyst_id: savedOrder?.analyst_id || '',
        order_comment: savedOrder?.order_comment || ''
    })

    if (!isOpen) return null

    const handleSubmit = (e) => {
        e.preventDefault()
        localStorage.setItem('valyze_order_summary', JSON.stringify(formData))
        onSubmit(formData)
    }

    const inputClasses = "w-full px-5 py-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-2xl focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none transition-all duration-300 text-sm text-slate-800 dark:text-white dark:placeholder-slate-500 shadow-inner-soft"
    const labelClasses = "block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-2"

    return (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="glass-panel w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/20 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/30 rounded-full blur-3xl pointer-events-none" />
                <div className="p-10 border-b border-slate-200/30 dark:border-white/5 relative z-10">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center border border-primary/20 shadow-glow">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Order Context</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">Initialize report metadata parameters</p>
                        </div>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-10 space-y-8 relative z-10">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="group">
                            <label className={labelClasses}>Client Identity <span className="text-primary">*</span></label>
                            <input type="text" required className={inputClasses} value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} placeholder="Corporate name" />
                        </div>
                        <div className="group">
                            <label className={labelClasses}>Reference Key</label>
                            <input type="text" className={inputClasses} value={formData.client_reference} onChange={(e) => setFormData({...formData, client_reference: e.target.value})} placeholder="VCR-REF-00" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="group">
                            <label className={labelClasses}>Assigned Analyst <span className="text-primary">*</span></label>
                            <input type="text" required className={inputClasses} value={formData.analyst_name} onChange={(e) => setFormData({...formData, analyst_name: e.target.value})} placeholder="Full name" />
                        </div>
                        <div className="group">
                            <label className={labelClasses}>Analyst UUID</label>
                            <input type="text" className={inputClasses} value={formData.analyst_id} onChange={(e) => setFormData({...formData, analyst_id: e.target.value})} placeholder="ID-000" />
                        </div>
                    </div>
                    <div className="group">
                        <label className={labelClasses}>Operational Notes</label>
                        <textarea className={inputClasses} rows={3} value={formData.order_comment} onChange={(e) => setFormData({...formData, order_comment: e.target.value})} placeholder="Project specific constraints..." />
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 py-4 px-6 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all duration-300">Abort</button>
                        <button type="submit" className="flex-[2] py-4 px-6 bg-gradient-to-r from-primary to-orange-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:opacity-90 shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)] transition-all duration-300 active:scale-95 flex items-center justify-center gap-2">Initialize Report <ArrowRight size={16} /></button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Easy Way Import Modal
function EasyWayModalWithOrder({ isOpen, onClose, onImport, savedOrder, prefillJson = '' }) {
    const [localJsonInput, setLocalJsonInput] = useState(prefillJson)
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState('')
    const [showOrderForm, setShowOrderForm] = useState(false)
    const [formData, setFormData] = useState({
        client_name: savedOrder?.client_name || '',
        client_reference: savedOrder?.client_reference || '',
        analyst_name: savedOrder?.analyst_name || '',
        analyst_id: savedOrder?.analyst_id || '',
        order_comment: savedOrder?.order_comment || ''
    })

    useEffect(() => {
        if (prefillJson) {
            setLocalJsonInput(prefillJson)
        }
    }, [prefillJson])

    if (!isOpen) return null

    const handleImport = async () => {
        if (!localJsonInput.trim()) {
            setError('System requires JSON payload to proceed')
            return
        }
        setImporting(true)
        setError('')
        
        try {
            await onImport(localJsonInput, { ...savedOrder, ...formData })
        } catch (e) {
            setError(e.message || 'Data integrity verification failed')
        } finally {
            setImporting(false)
        }
    }

    const inputClasses = "w-full px-5 py-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-2xl focus:ring-4 focus:ring-cta/20 focus:border-cta outline-none transition-all duration-300 text-sm text-slate-800 dark:text-white dark:placeholder-slate-500 shadow-inner-soft"
    const labelClasses = "block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-2"

    return (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="glass-panel w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/20 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative">
                {showOrderForm ? (
                    <>
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cta/30 rounded-full blur-3xl pointer-events-none" />
                        <div className="p-10 border-b border-slate-200/30 dark:border-white/5 relative z-10">
                            <div className="flex items-center gap-4 mb-2">
                                <button onClick={() => setShowOrderForm(false)} className="w-10 h-10 rounded-2xl bg-slate-100/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all backdrop-blur-md">
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cta/20 to-cta/5 text-cta flex items-center justify-center border border-cta/20 shadow-glow-cta">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Order Context</h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">Initialize report metadata parameters</p>
                                </div>
                            </div>
                        </div>
                        
                        <form onSubmit={(e) => { e.preventDefault(); setShowOrderForm(false) }} className="p-10 space-y-8 relative z-10">
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClasses}>Client Identity *</label>
                                    <input type="text" required className={inputClasses} value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} placeholder="Corporate name" />
                                </div>
                                <div>
                                    <label className={labelClasses}>Reference Key</label>
                                    <input type="text" className={inputClasses} value={formData.client_reference} onChange={(e) => setFormData({...formData, client_reference: e.target.value})} placeholder="VCR-REF-00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className={labelClasses}>Assigned Analyst *</label>
                                    <input type="text" required className={inputClasses} value={formData.analyst_name} onChange={(e) => setFormData({...formData, analyst_name: e.target.value})} placeholder="Full name" />
                                </div>
                                <div>
                                    <label className={labelClasses}>Analyst UUID</label>
                                    <input type="text" className={inputClasses} value={formData.analyst_id} onChange={(e) => setFormData({...formData, analyst_id: e.target.value})} placeholder="ID-000" />
                                </div>
                            </div>
                            <div>
                                <label className={labelClasses}>Operational Notes</label>
                                <textarea className={inputClasses} rows={2} value={formData.order_comment} onChange={(e) => setFormData({...formData, order_comment: e.target.value})} placeholder="Project specific constraints..." />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={onClose} className="flex-1 py-4 px-6 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all duration-300">Abort</button>
                                <button type="submit" className="flex-[2] py-4 px-6 bg-gradient-to-r from-cta to-indigo-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:opacity-90 shadow-[0_0_20px_-5px_rgba(139,92,246,0.5)] transition-all duration-300 active:scale-95 flex items-center justify-center gap-2">Proceed <ArrowRight size={16} /></button>
                            </div>
                        </form>
                    </>
                ) : (
                    <>
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-cta/20 rounded-full blur-[64px] pointer-events-none" />
                        <div className="p-10 border-b border-slate-200/30 dark:border-white/5 relative z-10">
                            <div className="flex items-center gap-4 mb-2">
                                <button onClick={() => setShowOrderForm(true)} className="w-10 h-10 rounded-2xl bg-slate-100/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all backdrop-blur-md">
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cta/20 to-cta/5 text-cta flex items-center justify-center border border-cta/20 shadow-glow-cta">
                                    <Zap size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Rapid Ingestion</h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">Inject structured JSON intelligence directly into the report engine</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-10 relative z-10">
                            <div className="relative group">
                                <textarea
                                    className="w-full h-72 px-6 py-5 bg-white/50 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-3xl font-mono text-sm focus:ring-4 focus:ring-cta/20 focus:border-cta outline-none transition-all duration-300 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-inner-soft"
                                    placeholder='{\n  "company_identity": {\n    "legal_name": "..."\n  },\n  ...\n}'
                                    value={localJsonInput}
                                    onChange={(e) => setLocalJsonInput(e.target.value)}
                                />
                                <div className="absolute top-5 right-5 text-cta/30 group-focus-within:text-cta transition-colors duration-500 pointer-events-none drop-shadow-[0_0_10px_rgba(139,92,246,0.3)]">
                                    <Database size={28} />
                                </div>
                            </div>
                            {error && (
                                <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-500 text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-top-2 backdrop-blur-sm">
                                    <Info size={16} /> {error}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-10 pt-0 flex gap-4 relative z-10">
                            <button onClick={onClose} className="flex-1 py-4 px-6 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all duration-300">Abort</button>
                            <button 
                                onClick={handleImport} 
                                disabled={importing} 
                                className="flex-[2] py-4 px-8 bg-gradient-to-r from-cta to-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:opacity-90 shadow-[0_0_20px_-5px_rgba(139,92,246,0.5)] transition-all duration-300 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                            >
                                {importing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...
                                    </>
                                ) : (
                                    <>Commit Data Ingestion <ArrowRight size={16} /></>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default function HomePage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { reportId, clearReport, saveReportId } = useReport()
    
    // UI state
    const [loadingStats, setLoadingStats] = useState(true)
    const [stats, setStats] = useState({
        openOrders: 0,
        myOrdersCount: 0,
        activeClients: 0,
        totalInvoicedAmount: 0,
        pendingInvoicesCount: 0,
        totalReports: 0
    })
    
    const [assignedOrders, setAssignedOrders] = useState([])
    const [recentReports, setRecentReports] = useState([])
    const [recentInvoices, setRecentInvoices] = useState([])
    
    // Modal states
    const [showOrderSummary, setShowOrderSummary] = useState(false)
    const [pendingAction, setPendingAction] = useState(null)
    const [savedOrder, setSavedOrder] = useState(null)
    const [showEasyWay, setShowEasyWay] = useState(false)
    const [prefillJson, setPrefillJson] = useState('')

    // Fetch dashboard statistics and data
    const fetchDashboardData = useCallback(async () => {
        setLoadingStats(true)
        try {
            // Load stats in parallel
            const [ordersRes, clientsRes, invoicesRes, reportsRes] = await Promise.all([
                ordersAPI.getAll().catch(() => ({ data: [] })),
                clientsAPI.getAll().catch(() => ({ data: [] })),
                invoicesAPI.getAll().catch(() => ({ data: [] })),
                reportAPI.getAllReportsCombined(0, 10).catch(() => ({ data: { reports: [] } }))
            ])

            const ordersList = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data.orders || []
            const clientsList = Array.isArray(clientsRes.data) ? clientsRes.data : []
            const invoicesList = Array.isArray(invoicesRes.data) ? invoicesRes.data : invoicesRes.data.invoices || []
            const reportsList = reportsRes.data.reports || []

            // Calculations
            const openOrders = ordersList.filter(o => o.status === 'pending' || o.status === 'in_progress')
            
            // Filter user's assigned orders (matching by email or analyst name)
            const userEmail = user?.email?.toLowerCase() || ''
            const myOrders = ordersList.filter(o => 
                (o.analyst && String(o.analyst).toLowerCase() === userEmail) ||
                (o.analyst_email && String(o.analyst_email).toLowerCase() === userEmail)
            )

            const unpaidInvoices = invoicesList.filter(i => i.status === 'unpaid' || i.status === 'sent')
            const totalUnpaidAmount = unpaidInvoices.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)

            setStats({
                openOrders: openOrders.length,
                myOrdersCount: myOrders.length,
                activeClients: clientsList.length,
                totalInvoicedAmount: totalUnpaidAmount,
                pendingInvoicesCount: unpaidInvoices.length,
                totalReports: reportsList.length
            })

            // Set detail lists
            // If user has assigned orders, show them. Otherwise show latest pending/in progress orders
            setAssignedOrders(myOrders.length > 0 ? myOrders.slice(0, 5) : openOrders.slice(0, 5))
            setRecentReports(reportsList.slice(0, 4))
            setRecentInvoices(invoicesList.slice(0, 4))
        } catch (e) {
            console.error('[Dashboard Error] Failed to aggregate system statistics:', e)
        } finally {
            setLoadingStats(false)
        }
    }, [user])

    useEffect(() => {
        fetchDashboardData()
    }, [fetchDashboardData])

    // Load saved order from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('valyze_order_summary')
        if (saved) {
            try {
                setSavedOrder(JSON.parse(saved))
            } catch (e) {}
        }
    }, [])

    // Check for pending import from extractor
    useEffect(() => {
        const pending = localStorage.getItem('valyze_pending_import')
        if (pending) {
            try {
                const json = JSON.parse(pending)
                setPrefillJson(JSON.stringify(json, null, 2))
                setShowEasyWay(true)
                localStorage.removeItem('valyze_pending_import')
            } catch (e) {}
        }
    }, [])

    const handleStartNew = () => {
        setPendingAction('new')
        setShowOrderSummary(true)
    }

    const handleStartEasyWay = () => {
        setPendingAction('easy')
        setShowOrderSummary(true)
    }

    const handleOrderSubmit = async (orderData) => {
        setShowOrderSummary(false)
        if (pendingAction === 'new') {
            clearReport()
            navigate('/upload')
        } else if (pendingAction === 'easy') {
            setShowEasyWay(true)
        }
        setPendingAction(null)
    }

    const handleResume = (id) => {
        if (!id) return
        navigate(`/editor/${id}`)
    }

    const handleEasyWayImport = async (jsonString, orderData = null) => {
        let str = jsonString.trim()
        const match = str.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (match) str = match[1].trim()
        const objMatch = str.match(/\{[\s\S]*\}/)
        if (objMatch) str = objMatch[0]
        
        const data = JSON.parse(str)
        const savedOrder = orderData || JSON.parse(localStorage.getItem('valyze_order_summary') || '{}')
        
        const startRes = await reportAPI.startReport({
            client_name: savedOrder?.client_name || 'Easy Import',
            analyst_name: savedOrder?.analyst_name || 'System',
            client_reference: savedOrder?.client_reference || '',
            analyst_id: savedOrder?.analyst_id || '',
            order_comment: savedOrder?.order_comment || '',
            company_name_hint: data.company_identity?.legal_name || data.company_name || 'Imported Company'
        })
        const newReportId = startRes.data.report_id
        
        await reportAPI.easyWayImport(newReportId, data)
        saveReportId(newReportId)
        navigate(`/editor/${newReportId}`)
    }

    const getGreeting = () => {
        const hr = new Date().getHours()
        if (hr < 12) return 'Good morning'
        if (hr < 17) return 'Good afternoon'
        return 'Good evening'
    }

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    }

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden bg-slate-50/50 dark:bg-dark-bg/10">
            {/* Ambient Background Blobs */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-15%] left-[-15%] w-[45%] h-[45%] rounded-full bg-primary/15 dark:bg-primary/10 blur-[120px] animate-blob mix-blend-multiply dark:mix-blend-screen" />
                <div className="absolute top-[25%] right-[-10%] w-[55%] h-[55%] rounded-full bg-cta/15 dark:bg-cta/10 blur-[140px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen" />
                <div className="absolute bottom-[-15%] left-[25%] w-[50%] h-[50%] rounded-full bg-accent/15 dark:bg-accent/10 blur-[130px] animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen" />
            </div>

            <div className="relative z-10 max-w-[1550px] mx-auto px-6 lg:px-12 pt-16">
                
                {/* 1. Header & Welcome Area */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12 animate-in slide-up duration-700">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-primary bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                                Valyze Command Center
                            </span>
                            {user?.role && (
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${ROLE_COLORS[user.role] || ROLE_COLORS.analyst}`}>
                                    {user.role.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight leading-none">
                            {getGreeting()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cta">{user?.name || 'Partner'}</span>
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            Here is what's happening across the system today.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchDashboardData}
                            className="p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-500 dark:text-slate-400 shadow-sm"
                            title="Refresh Dashboard"
                        >
                            <Activity size={18} className="animate-pulse" />
                        </button>
                        <button
                            onClick={handleStartNew}
                            className="py-4 px-6 bg-gradient-to-r from-primary to-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                        >
                            <Plus size={16} /> New Intelligence Report
                        </button>
                    </div>
                </div>

                {/* 2. Operations KPI Stats Grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 animate-in slide-up duration-1000">
                    
                    {/* Stat: Open Orders */}
                    <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20">
                                <Briefcase size={22} />
                            </div>
                            {stats.myOrdersCount > 0 && (
                                <span className="text-[10px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                                    {stats.myOrdersCount} Mine
                                </span>
                            )}
                        </div>
                        <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">
                            {loadingStats ? <Loader2 className="animate-spin text-slate-300" /> : stats.openOrders}
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Open Orders</h3>
                    </div>

                    {/* Stat: Active Clients */}
                    <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cta/5 rounded-full blur-2xl group-hover:bg-cta/10 transition-colors" />
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-cta/10 text-cta rounded-xl flex items-center justify-center border border-cta/20">
                                <Users size={22} />
                            </div>
                        </div>
                        <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">
                            {loadingStats ? <Loader2 className="animate-spin text-slate-300" /> : stats.activeClients}
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Active Clients</h3>
                    </div>

                    {/* Stat: Outstanding Invoices */}
                    <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl group-hover:bg-accent/10 transition-colors" />
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-accent/10 text-accent rounded-xl flex items-center justify-center border border-accent/20">
                                <Coins size={22} />
                            </div>
                            {stats.pendingInvoicesCount > 0 && (
                                <span className="text-[10px] font-black uppercase bg-rose-500/10 text-rose-500 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                                    {stats.pendingInvoicesCount} Pending
                                </span>
                            )}
                        </div>
                        <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">
                            {loadingStats ? <Loader2 className="animate-spin text-slate-300" /> : formatCurrency(stats.totalInvoicedAmount)}
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Pending Receivables</h3>
                    </div>

                    {/* Stat: Total Reports */}
                    <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center border border-emerald-500/20">
                                <FileSignature size={22} />
                            </div>
                        </div>
                        <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">
                            {loadingStats ? <Loader2 className="animate-spin text-slate-300" /> : stats.totalReports}
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Total Reports</h3>
                    </div>

                </div>

                {/* 3. Operations Layout Core */}
                <div className="grid lg:grid-cols-3 gap-8">
                    
                    {/* Left & Middle Column: Assigned Orders & Reports */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* Section: Assigned Orders */}
                        <div className="glass-panel p-8 rounded-[2rem]">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                                        <Briefcase size={22} className="text-primary" /> 
                                        {stats.myOrdersCount > 0 ? 'My Active Orders' : 'System Active Orders'}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                        Monitor due dates and report generation progress.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => navigate('/orders')}
                                    className="text-xs font-black uppercase tracking-widest text-primary hover:text-orange-600 transition-colors flex items-center gap-1.5"
                                >
                                    View All <ChevronRight size={14} />
                                </button>
                            </div>

                            {loadingStats ? (
                                <div className="py-20 flex flex-col items-center justify-center">
                                    <Loader2 className="animate-spin text-primary mb-4" size={36} />
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Syncing order pipeline...</p>
                                </div>
                            ) : assignedOrders.length > 0 ? (
                                <div className="space-y-4">
                                    {assignedOrders.map((order) => {
                                        const total = Number(order.company_count || order.progress?.total || 1)
                                        const completed = Number(order.completed_count || order.progress?.completed || 0)
                                        const progress = Math.min(Math.round((completed / total) * 100), 100)
                                        
                                        return (
                                            <div 
                                                key={order.id}
                                                onClick={() => navigate(`/orders` /* Routing to orders lists or detail */)}
                                                className="p-5 bg-white/40 dark:bg-slate-900/30 hover:bg-white/80 dark:hover:bg-slate-900/60 rounded-2xl border border-slate-200/40 dark:border-white/5 transition-all duration-300 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-1.5">
                                                        <span className="font-mono text-xs font-black text-primary uppercase">{order.order_number || order.id.slice(0, 8)}</span>
                                                        <span className={`px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}>
                                                            {order.status?.replace('_', ' ')}
                                                        </span>
                                                        {order.service_level && (
                                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                                {order.service_level}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-black text-slate-800 dark:text-white tracking-tight group-hover:text-primary transition-colors">{order.client_name || 'Corporate client'}</h3>
                                                </div>

                                                {/* Progress Indicator */}
                                                <div className="w-full md:w-48">
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                                                        <span>Progress</span>
                                                        <span className="text-slate-600 dark:text-slate-300">{completed}/{total} Companies</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all duration-500" 
                                                            style={{ width: `${progress}%` }} 
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200/50">
                                                    <div className="text-right">
                                                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Due Date</div>
                                                        <div className="text-xs font-black text-slate-600 dark:text-slate-300">{order.due_date ? new Date(order.due_date).toLocaleDateString() : 'Unscheduled'}</div>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                                        <ArrowRight size={16} />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-14 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-white/5">
                                    <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-400 text-xs font-black uppercase tracking-wider">No active orders assigned to you</p>
                                </div>
                            )}
                        </div>

                        {/* Section: Recent Reports */}
                        <div className="glass-panel p-8 rounded-[2rem]">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                                        <FileSignature size={22} className="text-cta" /> Recent Intelligence Reports
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                                        Quickly access recently generated credit assessments and reports.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => navigate('/reports')}
                                    className="text-xs font-black uppercase tracking-widest text-cta hover:text-indigo-500 transition-colors flex items-center gap-1.5"
                                >
                                    View All <ChevronRight size={14} />
                                </button>
                            </div>

                            {loadingStats ? (
                                <div className="py-20 flex flex-col items-center justify-center">
                                    <Loader2 className="animate-spin text-cta mb-4" size={36} />
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">Loading reports database...</p>
                                </div>
                            ) : recentReports.length > 0 ? (
                                <div className="grid md:grid-cols-2 gap-4">
                                    {recentReports.map((report) => (
                                        <div 
                                            key={report.report_id || report.id}
                                            className="p-5 bg-white/40 dark:bg-slate-900/30 rounded-2xl border border-slate-200/40 dark:border-white/5 flex flex-col justify-between hover:border-cta/40 hover:shadow-lg transition-all duration-300 group"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">
                                                        {report.cr_number || 'No CR Key'}
                                                    </span>
                                                    <span className="text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full border border-slate-200/30">
                                                        {report.country || 'Global'}
                                                    </span>
                                                </div>
                                                <h3 className="font-black text-slate-800 dark:text-white tracking-tight text-lg mb-1 group-hover:text-cta transition-colors">
                                                    {report.company_name || 'Unknown Corporation'}
                                                </h3>
                                                <p className="text-[10px] text-slate-400 font-medium">
                                                    Modified: {report.updated_at ? new Date(report.updated_at).toLocaleDateString() : 'Recently'}
                                                </p>
                                            </div>

                                            <div className="flex items-center justify-between pt-6 border-t border-slate-200/30 dark:border-white/5 mt-6">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    <Clock size={12} />
                                                    <span>{report.location === 'cloud' ? 'Cloud Synced' : 'Local Draft'}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleResume(report.report_id || report.id)}
                                                    className="py-2.5 px-4 bg-cta/10 text-cta dark:bg-cta/25 dark:text-cta-soft hover:bg-cta hover:text-white dark:hover:bg-cta transition-all text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2 active:scale-95"
                                                >
                                                    Open Editor <PlayCircle size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-14 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-white/5">
                                    <FileSignature className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-400 text-xs font-black uppercase tracking-wider">No generated reports available yet</p>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Right Column: Invoices & Quick Commands */}
                    <div className="space-y-8">
                        
                        {/* Section: Quick Actions Panel */}
                        <div className="glass-panel p-8 rounded-[2rem] relative overflow-hidden">
                            <div className="absolute -right-24 -top-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                            <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2 mb-6">
                                <Sparkles size={20} className="text-primary" /> Command Console
                            </h2>

                            <div className="grid gap-3.5">
                                <button
                                    onClick={() => navigate('/extractor')}
                                    className="p-4 bg-gradient-to-r from-primary/10 to-orange-400/5 hover:from-primary hover:to-orange-500 border border-primary/20 hover:border-transparent dark:border-primary/25 rounded-2xl text-left transition-all duration-300 group flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 text-primary flex items-center justify-center shadow-md">
                                            <Zap size={20} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white group-hover:text-white">Run AI Extractor</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-white/80 font-medium">Extract from PDF/Excel</div>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-primary group-hover:text-white transition-colors" />
                                </button>

                                <button
                                    onClick={handleStartEasyWay}
                                    className="p-4 bg-gradient-to-r from-cta/10 to-indigo-500/5 hover:from-cta hover:to-indigo-600 border border-cta/20 hover:border-transparent dark:border-cta/25 rounded-2xl text-left transition-all duration-300 group flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 text-cta flex items-center justify-center shadow-md">
                                            <Database size={20} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white group-hover:text-white">Rapid JSON Import</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-white/80 font-medium">Paste parsed JSON data</div>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-cta group-hover:text-white transition-colors" />
                                </button>

                                <button
                                    onClick={() => navigate('/clients')}
                                    className="p-4 bg-white/40 dark:bg-slate-900/20 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl text-left transition-all duration-300 group flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 flex items-center justify-center shadow-md">
                                            <Users size={20} className="group-hover:text-slate-900" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white group-hover:text-white dark:group-hover:text-slate-900">Manage Clients</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-white/80 dark:group-hover:text-slate-700 font-medium">Register corporate accounts</div>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-400 group-hover:text-white dark:group-hover:text-slate-900 transition-colors" />
                                </button>

                                {['admin', 'super_admin'].includes(user?.role) && (
                                    <button
                                        onClick={() => navigate('/users')}
                                        className="p-4 bg-white/40 dark:bg-slate-900/20 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl text-left transition-all duration-300 group flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 flex items-center justify-center shadow-md">
                                                <User size={20} className="group-hover:text-slate-900" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white group-hover:text-white dark:group-hover:text-slate-900">System Users</div>
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-white/80 dark:group-hover:text-slate-700 font-medium">Manage permissions & roles</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-400 group-hover:text-white dark:group-hover:text-slate-900 transition-colors" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Section: Recent Invoices */}
                        <div className="glass-panel p-8 rounded-[2rem]">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                                        <Coins size={20} className="text-accent" /> Recent Invoices
                                    </h2>
                                </div>
                                <button 
                                    onClick={() => navigate('/invoices')}
                                    className="text-xs font-black uppercase tracking-widest text-accent hover:text-cyan-500 transition-colors flex items-center gap-1.5"
                                >
                                    View All <ChevronRight size={14} />
                                </button>
                            </div>

                            {loadingStats ? (
                                <div className="py-14 flex flex-col items-center justify-center">
                                    <Loader2 className="animate-spin text-accent mb-4" size={28} />
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Loading invoices...</p>
                                </div>
                            ) : recentInvoices.length > 0 ? (
                                <div className="space-y-3.5">
                                    {recentInvoices.map((inv) => (
                                        <div 
                                            key={inv.id}
                                            onClick={() => navigate('/invoices')}
                                            className="p-4 bg-white/40 dark:bg-slate-900/30 hover:bg-white/80 dark:hover:bg-slate-900/60 border border-slate-200/40 dark:border-white/5 rounded-2xl flex items-center justify-between transition-all duration-300 cursor-pointer group"
                                        >
                                            <div className="truncate pr-3">
                                                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{inv.invoice_number || inv.id.slice(0, 8)}</div>
                                                <h3 className="font-bold text-slate-800 dark:text-white truncate group-hover:text-accent transition-colors text-sm">{inv.client_name || 'Client'}</h3>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className="font-black text-slate-800 dark:text-white text-sm">{formatCurrency(inv.amount)}</div>
                                                <span className={`inline-block px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider mt-1.5 ${INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.unpaid}`}>
                                                    {inv.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-white/5">
                                    <Coins className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                                    <p className="text-slate-400 text-xs font-black uppercase tracking-wider">No invoice history found</p>
                                </div>
                            )}
                        </div>

                    </div>

                </div>

            </div>
            
            {/* Modals */}
            <OrderSummaryModal 
                isOpen={showOrderSummary} 
                onClose={() => { setShowOrderSummary(false); setPendingAction(null) }} 
                onSubmit={handleOrderSubmit}
                savedOrder={savedOrder}
            />
            
            {showEasyWay && (
                <EasyWayModalWithOrder 
                    isOpen={showEasyWay} 
                    onClose={() => { setShowEasyWay(false); setPrefillJson('') }} 
                    onImport={handleEasyWayImport}
                    savedOrder={savedOrder}
                    prefillJson={prefillJson}
                />
            )}
        </div>
    )
}
