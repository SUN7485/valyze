import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, History, FileText, ArrowRight, Upload, Database, Info, PlusCircle, Zap, ArrowLeft, AlertCircle, ClipboardCheck, Sparkles, Activity, Search } from 'lucide-react'
import { useReport } from '../context/ReportContext'
import { reportAPI, ordersAPI } from '../api/client'

// Order Summary Modal - Premium Redesign
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
                {/* Decorative background glow */}
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

// Easy Way Import Modal - Premium Redesign
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
    const { reportId, clearReport, saveReportId } = useReport()
    const [resumeId, setResumeId] = useState('')
    
    const [showOrderSummary, setShowOrderSummary] = useState(false)
    const [pendingAction, setPendingAction] = useState(null)
    const [savedOrder, setSavedOrder] = useState(null)
    const [orderStats, setOrderStats] = useState({ pending: 0, inProgress: 0, hasUnreadPending: false, loading: true })

    useEffect(() => {
        const saved = localStorage.getItem('valyze_order_summary')
        if (saved) {
            try {
                setSavedOrder(JSON.parse(saved))
            } catch (e) {}
        }
    }, [])

    useEffect(() => {
        let mounted = true
        ordersAPI.getAll()
            .then((response) => {
                if (!mounted) return
                const data = Array.isArray(response.data) ? response.data : response.data.orders || []
                const pending = data.filter(order => order.status === 'pending').length
                const inProgress = data.filter(order => order.status === 'in_progress').length
                const hasUnreadPending = data.some(order => order.status === 'pending' && (order.unread || order.is_unread || order.read === false))
                setOrderStats({ pending, inProgress, hasUnreadPending, loading: false })
            })
            .catch(() => {
                if (mounted) setOrderStats({ pending: 0, inProgress: 0, hasUnreadPending: false, loading: false })
            })
        return () => { mounted = false }
    }, [])

    const [showEasyWay, setShowEasyWay] = useState(false)
    const [prefillJson, setPrefillJson] = useState('')

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
        const targetId = id || resumeId
        if (!targetId) return
        navigate(`/editor/${targetId}`)
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

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden">
            {/* Dynamic Background */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 dark:bg-primary/10 blur-[100px] animate-blob mix-blend-multiply dark:mix-blend-screen" />
                <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cta/20 dark:bg-cta/10 blur-[120px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen" />
                <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-accent/20 dark:bg-accent/10 blur-[150px] animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen" />
            </div>

            <div className="relative z-10 max-w-[1400px] mx-auto px-6 pt-20">
                {/* Hero Section */}
                <div className="text-center mb-28 animate-in slide-up duration-1000">
                    <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-slate-200/50 dark:border-white/10 shadow-[0_0_30px_-5px_rgba(245,158,11,0.2)] mb-10 group cursor-pointer hover:scale-105 transition-transform duration-500">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.25em]">Valyze Next-Gen Engine</span>
                    </div>
                    
                    <h1 className="text-7xl md:text-8xl lg:text-[100px] font-black mb-8 tracking-tighter leading-[1.1] dark:text-white">
                        Corporate <br className="hidden md:block"/>
                        <span className="relative inline-block">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-cta drop-shadow-sm">
                                Intelligence
                            </span>
                            <div className="absolute -bottom-4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                        </span>
                    </h1>
                    
                    <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
                        Transform raw financial data into professional credit reports 
                        with deep analysis and industrial-grade accuracy.
                    </p>
                </div>

                {/* Primary Actions Grid */}
                <div className="grid md:grid-cols-2 gap-8 mb-16 max-w-6xl mx-auto">
                    {/* Extract Data Card */}
                    <button
                        onClick={() => navigate('/extractor')}
                        className="premium-card group text-left p-12 h-full flex flex-col justify-between min-h-[320px]"
                    >
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/20 rounded-full blur-[64px] group-hover:bg-primary/30 group-hover:scale-110 transition-all duration-700" />
                        
                        <div>
                            <div className="w-20 h-20 bg-gradient-to-br from-white to-primary/5 dark:from-slate-800 dark:to-primary/10 rounded-[24px] flex items-center justify-center mb-10 shadow-lg border border-white/50 dark:border-white/10 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 relative z-10">
                                <Sparkles className="text-primary w-10 h-10 drop-shadow-md" />
                            </div>
                            <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-4 tracking-tight relative z-10">Extract Data</h2>
                            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed relative z-10 max-w-md">Launch the AI extraction tool to process documents and generate credit intelligence dynamically.</p>
                        </div>
                        
                        <div className="mt-12 inline-flex items-center gap-3 text-primary font-black uppercase tracking-widest text-sm group-hover:gap-6 transition-all duration-300 relative z-10">
                            Initialize AI Engine <ArrowRight className="w-5 h-5" />
                        </div>
                    </button>

                    {/* Rapid Import Card */}
                    <button
                        onClick={handleStartEasyWay}
                        className="premium-card group text-left p-12 h-full flex flex-col justify-between min-h-[320px]"
                    >
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-cta/20 rounded-full blur-[64px] group-hover:bg-cta/30 group-hover:scale-110 transition-all duration-700" />
                        
                        <div>
                            <div className="w-20 h-20 bg-gradient-to-br from-white to-cta/5 dark:from-slate-800 dark:to-cta/10 rounded-[24px] flex items-center justify-center mb-10 shadow-lg border border-white/50 dark:border-white/10 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500 relative z-10">
                                <Zap className="text-cta w-10 h-10 drop-shadow-md" />
                            </div>
                            <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-4 tracking-tight relative z-10">Rapid Import</h2>
                            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed relative z-10 max-w-md">Paste fully structured JSON data to instantly recreate a validated intelligence report.</p>
                        </div>
                        
                        <div className="mt-12 inline-flex items-center gap-3 text-cta font-black uppercase tracking-widest text-sm group-hover:gap-6 transition-all duration-300 relative z-10">
                            Execute Flash Import <ArrowRight className="w-5 h-5" />
                        </div>
                    </button>
                </div>

                {/* Secondary Actions Grid */}
                <div className="grid md:grid-cols-2 gap-8 mb-24 max-w-6xl mx-auto">
                    {/* Resume Card */}
                    <div className="glass-panel rounded-3xl p-10 flex flex-col relative overflow-hidden group hover:shadow-xl transition-all duration-500">
                        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-8 shadow-sm border border-slate-100 dark:border-white/5 relative z-10">
                            <History className="text-slate-500 dark:text-slate-400 w-8 h-8" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-4 tracking-tight relative z-10">Resume Session</h2>

                        {reportId ? (
                            <div className="flex-1 flex flex-col relative z-10">
                                <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium text-lg">
                                    Active Instance: <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 ml-2 border border-slate-200 dark:border-slate-700 shadow-inner">{reportId}</span>
                                </p>
                                <button
                                    onClick={() => handleResume(reportId)}
                                    className="mt-auto w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-xl shadow-slate-900/20 dark:shadow-white/10 transition-all duration-300"
                                >
                                    <PlayCircle size={20} /> Continue Processing
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 relative z-10">
                                <Activity className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-4" />
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-black uppercase tracking-widest leading-loose">
                                    No Active Processes Detected
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Manual Retrieval Card */}
                    <div className="glass-panel rounded-3xl p-10 flex flex-col relative overflow-hidden group hover:shadow-xl transition-all duration-500">
                        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-8 shadow-sm border border-slate-100 dark:border-white/5 relative z-10">
                            <Search className="text-slate-500 dark:text-slate-400 w-8 h-8" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-4 tracking-tight relative z-10">Manual Retrieval</h2>
                        <div className="flex-1 flex flex-col relative z-10">
                            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium text-lg">Inject a specific report UUID to restore state.</p>
                            <input
                                type="text"
                                placeholder="VCR-202X..."
                                className="w-full px-6 py-5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl mb-6 focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none text-base font-mono dark:text-white transition-all placeholder-slate-400 shadow-inner-soft"
                                value={resumeId}
                                onChange={(e) => setResumeId(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && resumeId && handleResume()}
                            />
                            <button
                                disabled={!resumeId}
                                onClick={() => handleResume()}
                                className="mt-auto w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-xl transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Fetch Instance <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Dashboard & Pipeline Section */}
                <div className="max-w-6xl mx-auto mb-24">
                    <div className="premium-card p-10 md:p-14">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                            <div className="flex-1">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest mb-6 text-slate-700 dark:text-slate-300">
                                    <ClipboardCheck size={16} className="text-primary" /> Operations Center
                                </div>
                                <h3 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight mb-4">Order Pipeline</h3>
                                <p className="text-lg text-slate-500 dark:text-slate-400 font-medium max-w-md">
                                    Keep pending and in-progress orders moving without losing track of deadlines.
                                </p>
                            </div>

                            <div className="flex gap-4 w-full lg:w-auto">
                                <div className="flex-1 lg:w-48 rounded-[2rem] bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 p-8 flex flex-col items-center justify-center shadow-lg shadow-amber-500/5 transition-transform hover:scale-105">
                                    <div className="text-5xl font-black text-amber-600 dark:text-amber-400 mb-2">{orderStats.loading ? '...' : orderStats.pending}</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-700/70 dark:text-amber-300/70">Pending</div>
                                </div>
                                <div className="flex-1 lg:w-48 rounded-[2rem] bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 p-8 flex flex-col items-center justify-center shadow-lg shadow-blue-500/5 transition-transform hover:scale-105">
                                    <div className="text-5xl font-black text-blue-600 dark:text-blue-400 mb-2">{orderStats.loading ? '...' : orderStats.inProgress}</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-700/70 dark:text-blue-300/70">In Progress</div>
                                </div>
                            </div>

                            <div className="flex flex-col justify-center">
                                <button
                                    onClick={() => navigate('/orders')}
                                    className="py-5 px-8 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-900/20 dark:shadow-white/10"
                                >
                                    Open Dashboard <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>

                        {orderStats.hasUnreadPending && (
                            <div className="mt-10 p-5 bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/20 rounded-2xl flex items-center gap-4 text-rose-600 dark:text-rose-400">
                                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                                    <AlertCircle size={20} className="text-rose-500" />
                                </div>
                                <div>
                                    <div className="font-black uppercase tracking-widest text-xs">Action Required</div>
                                    <p className="text-sm font-medium mt-1 text-rose-600/80 dark:text-rose-400/80">Pending orders are waiting for review in the dashboard.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Continuous Flow Visualization */}
                <div className="max-w-6xl mx-auto relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-cta/5 to-accent/5 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    <div className="glass-panel p-12 md:p-16 rounded-[3rem] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[80px] -mr-48 -mt-48 pointer-events-none" />
                        
                        <div className="flex items-center gap-4 mb-16">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                <Activity className="text-primary w-6 h-6 animate-pulse" />
                            </div>
                            <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.3em]">
                                Continuous Flow Integration
                            </h3>
                        </div>

                        <div className="relative">
                            {/* Connecting Line */}
                            <div className="absolute top-8 left-10 right-10 h-[2px] bg-slate-200 dark:bg-slate-800 hidden md:block" />
                            <div className="absolute top-8 left-10 w-1/3 h-[2px] bg-gradient-to-r from-primary to-cta hidden md:block" />

                            <div className="grid md:grid-cols-3 gap-12 relative z-10">
                                {[
                                    { step: '01', title: 'Raw Data Ingestion', desc: 'Multi-source document upload for RAG-enhanced AI extraction.' },
                                    { step: '02', title: 'Structured Review', desc: 'Manual verification across 20+ specialized intelligence modules.' },
                                    { step: '03', title: 'Final Synthesis', desc: 'Automated generation of industrial-grade PDF credit reports.' }
                                ].map((phase, i) => (
                                    <div key={i} className="relative group/phase">
                                        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 flex items-center justify-center mb-8 shadow-lg group-hover/phase:border-primary/50 group-hover/phase:shadow-glow transition-all duration-300">
                                            <span className="font-black text-xl text-primary">{phase.step}</span>
                                        </div>
                                        <h4 className="font-black text-slate-800 dark:text-white text-2xl mb-4 tracking-tight">{phase.title}</h4>
                                        <p className="text-base text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{phase.desc}</p>
                                    </div>
                                ))}
                            </div>
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
