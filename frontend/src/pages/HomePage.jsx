import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, History, FileText, ArrowRight, Upload, Database, Info, PlusCircle, Zap, ArrowLeft } from 'lucide-react'
import { useReport } from '../context/ReportContext'
import { reportAPI } from '../api/client'

// Order Summary Modal - appears before starting new report
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

    const inputClasses = "w-full px-5 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none transition-all duration-300 text-sm dark:text-white dark:placeholder-slate-500"
    const labelClasses = "block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1"

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="glass-card bg-white dark:bg-slate-900 border-none shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <FileText size={18} />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Order Parameters</h2>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium ml-11">Initialize report metadata context</p>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Client Identity *</label>
                            <input type="text" required className={inputClasses} value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} placeholder="Corporate name" />
                        </div>
                        <div>
                            <label className={labelClasses}>Reference Key</label>
                            <input type="text" className={inputClasses} value={formData.client_reference} onChange={(e) => setFormData({...formData, client_reference: e.target.value})} placeholder="VCR-REF-00" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
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
                        <button type="button" onClick={onClose} className="flex-1 py-4 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Abort</button>
                        <button type="submit" className="flex-1 py-4 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-95">Initialize Report →</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Easy Way Import Modal with Order Summary
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

    // Update when prefillJson changes
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

    const inputClasses = "w-full px-5 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none transition-all duration-300 text-sm dark:text-white dark:placeholder-slate-500"
    const labelClasses = "block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1"

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="glass-card bg-white dark:bg-slate-900 border-none shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Order Form - Before JSON Paste */}
                {showOrderForm ? (
                    <>
                        <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                            <div className="flex items-center gap-3 mb-1">
                                <button onClick={() => setShowOrderForm(false)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/20 transition-all">
                                    <ArrowLeft size={16} />
                                </button>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <FileText size={18} />
                                </div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Order Parameters</h2>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium ml-11">Initialize report metadata context</p>
                        </div>
                        
                        <form onSubmit={(e) => { e.preventDefault(); setShowOrderForm(false) }} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClasses}>Client Identity *</label>
                                    <input type="text" required className={inputClasses} value={formData.client_name} onChange={(e) => setFormData({...formData, client_name: e.target.value})} placeholder="Corporate name" />
                                </div>
                                <div>
                                    <label className={labelClasses}>Reference Key</label>
                                    <input type="text" className={inputClasses} value={formData.client_reference} onChange={(e) => setFormData({...formData, client_reference: e.target.value})} placeholder="VCR-REF-00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
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
                                <button type="button" onClick={onClose} className="flex-1 py-4 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Abort</button>
                                <button type="submit" className="flex-1 py-4 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-95">Proceed →</button>
                            </div>
                        </form>
                    </>
                ) : (
                    <>
                        <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                            <div className="flex items-center gap-3 mb-1">
                                <button onClick={() => setShowOrderForm(true)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/20 transition-all">
                                    <ArrowLeft size={16} />
                                </button>
                                <div className="w-8 h-8 rounded-lg bg-cta/10 text-cta flex items-center justify-center">
                                    <Zap size={18} />
                                </div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Rapid Ingestion</h2>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium ml-11">Inject structured JSON intelligence directly into the report engine</p>
                        </div>
                        
                        <div className="p-8">
                            <div className="relative group">
                                <textarea
                                    className="w-full h-72 px-5 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl font-mono text-xs focus:ring-4 focus:ring-cta/10 focus:border-cta outline-none transition-all duration-300 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                                    placeholder='{ "company_identity": { "legal_name": "..." }, ... }'
                                    value={localJsonInput}
                                    onChange={(e) => setLocalJsonInput(e.target.value)}
                                />
                                <div className="absolute top-4 right-4 text-cta/20 group-focus-within:text-cta/40 transition-colors pointer-events-none">
                                    <Database size={24} />
                                </div>
                            </div>
                            {error && (
                                <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-[10px] font-black uppercase tracking-widest animate-in slide-in-from-top-2">
                                    <Info size={14} /> {error}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-8 pt-0 flex gap-4">
                            <button onClick={onClose} className="flex-1 py-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Abort</button>
                            <button 
                                onClick={handleImport} 
                                disabled={importing} 
                                className="flex-2 py-4 px-8 bg-cta text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-cta/20 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {importing ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...
                                    </>
                                ) : (
                                    <>Commit Data Ingestion <ArrowRight size={14} /></>
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
    
    // Order Summary state
    const [showOrderSummary, setShowOrderSummary] = useState(false)
    const [pendingAction, setPendingAction] = useState(null) // 'new' or 'easy'
    const [savedOrder, setSavedOrder] = useState(null)

    // Load saved order from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('valyze_order_summary')
        if (saved) {
            try {
                setSavedOrder(JSON.parse(saved))
            } catch (e) {}
        }
    }, [])

    // Easy Way Import state
    const [showEasyWay, setShowEasyWay] = useState(false)
    const [prefillJson, setPrefillJson] = useState('')

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
            // Start new report with order data
            clearReport()
            navigate('/upload')
        } else if (pendingAction === 'easy') {
            // For easy way, we'll show the modal after order
            setShowEasyWay(true)
        }
        setPendingAction(null)
    }

    const handleResume = (id) => {
        const targetId = id || resumeId
        if (!targetId) return
        navigate(`/editor/${targetId}`)
    }
    
    // Easy Way Import handler - parses JSON and calls API
    const handleEasyWayImport = async (jsonString, orderData = null) => {
        // Parse the JSON
        let str = jsonString.trim()
        
        // Handle code blocks
        const match = str.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (match) str = match[1].trim()
        
        // Extract JSON object
        const objMatch = str.match(/\{[\s\S]*\}/)
        if (objMatch) str = objMatch[0]
        
        const data = JSON.parse(str)
        
        // Get order data from localStorage if not passed
        const savedOrder = orderData || JSON.parse(localStorage.getItem('valyze_order_summary') || '{}')
        
        // Create a new report with order data
        const startRes = await reportAPI.startReport({
            client_name: savedOrder?.client_name || 'Easy Import',
            analyst_name: savedOrder?.analyst_name || 'System',
            client_reference: savedOrder?.client_reference || '',
            analyst_id: savedOrder?.analyst_id || '',
            order_comment: savedOrder?.order_comment || '',
            company_name_hint: data.company_identity?.legal_name || data.company_name || 'Imported Company'
        })
        const newReportId = startRes.data.report_id
        
        // Send to easy way import endpoint
        await reportAPI.easyWayImport(newReportId, data)
        
        // Navigate to editor
        saveReportId(newReportId)
        navigate(`/editor/${newReportId}`)
    }

    return (
        <div className="py-12 px-6 max-w-4xl mx-auto">
            <div className="text-center mb-20 animate-in fade-in zoom-in duration-1000">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 text-xs font-black text-primary uppercase tracking-[0.2em] mb-8">
                    <Zap size={14} /> AI-Powered Credit Intelligence
                </div>
                <h1 className="text-6xl md:text-7xl font-black mb-6 tracking-tighter leading-tight dark:text-white">
                    Corporate <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-cta">Intelligence</span>
                </h1>
                <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
                    Transform raw financial data into professional credit reports 
                    with deep analysis and industrial-grade accuracy.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-20">
                {/* Extract Your Data Card */}
                <button
                    onClick={() => window.open(window.location.origin, '_blank')}
                    className="group glass-card p-10 text-left relative overflow-hidden"
                >
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">
                        <Zap size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">Extract Your Data</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">Launch the AI extraction tool to process documents and generate credit intelligence.</p>
                    <div className="inline-flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs group-hover:gap-4 transition-all duration-300">
                        Launch Extractor <ArrowRight size={18} />
                    </div>
                </button>

                {/* Easy Way Import Card */}
                <button
                    onClick={handleStartEasyWay}
                    className="group glass-card p-10 text-left relative overflow-hidden"
                >
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-cta/10 rounded-full blur-2xl group-hover:bg-cta/20 transition-all duration-500" />
                    <div className="w-16 h-16 bg-cta/10 text-cta rounded-2xl flex items-center justify-center mb-8 bg-white dark:bg-white/5 shadow-xl shadow-cta/10 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500">
                        <PlusCircle size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">Rapid Import</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">Paste parsed JSON data to instantly recreate a validated report.</p>
                    <div className="inline-flex items-center gap-2 text-cta font-black uppercase tracking-widest text-xs group-hover:gap-4 transition-all duration-300">
                        Execute Flash Import <ArrowRight size={18} />
                    </div>
                </button>

                {/* Resume Card - Active Report */}
                <div className="glass-card p-10 flex flex-col bg-white/40 dark:bg-white/5 border-slate-200/50 dark:border-white/5">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-2xl flex items-center justify-center mb-8 shadow-sm">
                        <History size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">Resume Session</h2>

                    {reportId ? (
                        <div className="flex-1 flex flex-col">
                            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">
                                Active Instance: <span className="font-mono text-[10px] bg-slate-100 dark:bg-white/10 px-3 py-1 rounded-full text-slate-600 dark:text-slate-300 ml-1">{reportId}</span>
                            </p>
                            <button
                                onClick={() => handleResume(reportId)}
                                className="mt-auto w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-2xl shadow-slate-900/20 transition-all duration-300 cursor-pointer"
                            >
                                <PlayCircle size={20} /> Continue Processing
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                            <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-300 dark:text-white/10 mb-4">
                                <FileText size={24} />
                            </div>
                            <p className="text-slate-400 dark:text-slate-600 text-xs font-black uppercase tracking-widest leading-loose">
                                No Active Processes Detected<br />
                                Enter ID manualy below
                            </p>
                        </div>
                    )}
                </div>

                {/* Custom Report ID Entry Card */}
                <div className="glass-card p-10 flex flex-col border-2 border-dashed border-slate-200 dark:border-white/10 bg-transparent hover:bg-white/40 dark:hover:bg-white/5">
                    <div className="w-16 h-16 bg-white dark:bg-white/5 text-slate-400 rounded-2xl flex items-center justify-center mb-8 shadow-sm">
                        <Upload size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">Manual Retrieval</h2>
                    <div className="flex-1 flex flex-col">
                        <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">Inject a specific report UUID to restore analysis state.</p>
                        <input
                            type="text"
                            placeholder="VCR-202X..."
                            className="w-full px-5 py-4 bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl mb-6 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm font-mono dark:text-white transition-all placeholder-slate-400"
                            value={resumeId}
                            onChange={(e) => setResumeId(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && resumeId && handleResume()}
                        />
                        <button
                            disabled={!resumeId}
                            onClick={() => handleResume()}
                            className="mt-auto w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <ArrowRight size={20} /> Fetch Instance
                        </button>
                    </div>
                </div>
            </div>

            <div className="glass dark:bg-white/5 border-slate-200/50 dark:border-white/5 p-10 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-primary/10 transition-colors duration-1000" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-10 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Continuous Flow Integration
                </h3>
                <div className="grid md:grid-cols-3 gap-12 relative">
                    <div className="relative z-10">
                        <div className="text-[10px] font-black text-primary mb-3 tracking-widest uppercase">Phase 01</div>
                        <h4 className="font-black text-slate-800 dark:text-white text-lg mb-3 tracking-tight">Raw Data Ingestion</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Multi-source document upload for RAG-enhanced AI extraction.</p>
                    </div>
                    <div className="relative z-10">
                        <div className="text-[10px] font-black text-primary mb-3 tracking-widest uppercase">Phase 02</div>
                        <h4 className="font-black text-slate-800 dark:text-white text-lg mb-3 tracking-tight">Structured Review</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Manual verification across 20+ specialized intelligence modules.</p>
                    </div>
                    <div className="relative z-10">
                        <div className="text-[10px] font-black text-primary mb-3 tracking-widest uppercase">Phase 03</div>
                        <h4 className="font-black text-slate-800 dark:text-white text-lg mb-3 tracking-tight">Final Synthesis</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Automated generation of industrial-grade PDF credit reports.</p>
                    </div>
                </div>
            </div>
            
            {/* Order Summary Modal */}
            <OrderSummaryModal 
                isOpen={showOrderSummary} 
                onClose={() => { setShowOrderSummary(false); setPendingAction(null) }} 
                onSubmit={handleOrderSubmit}
                savedOrder={savedOrder}
            />
            
            {/* Easy Way Import Modal */}
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
