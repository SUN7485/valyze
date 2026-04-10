import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, Search, Cpu, Database, Calculator } from 'lucide-react'
import { reportAPI } from '../api/client'
import ProgressBar from '../components/ProgressBar'

export default function ProcessingPage() {
    const { reportId } = useParams()
    const navigate = useNavigate()

    const [progress, setProgress] = useState(0)
    const [step, setStep] = useState('Initializing...')
    const [status, setStatus] = useState('processing')
    const [error, setError] = useState(null)
    const [stats, setStats] = useState({
        high: 0,
        ai: 0,
        calc: 0,
        missing: 0
    })

    const pollRef = useRef(null)
    const extractionStartedRef = useRef(false)

    useEffect(() => {
        // Prevent duplicate extraction calls (React StrictMode in dev calls useEffect twice)
        if (extractionStartedRef.current) {
            return
        }
        extractionStartedRef.current = true
        
        startExtraction()
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [reportId])

    const startExtraction = async () => {
        try {
            await reportAPI.startExtraction(reportId)
            pollProgress()
        } catch (err) {
            setError(err.message || 'Failed to start extraction')
            setStatus('error')
        }
    }

    const pollProgress = () => {
        pollRef.current = setInterval(async () => {
            try {
                const res = await reportAPI.getExtractionProgress(reportId)
                const data = res.data

                setProgress(data.progress_percent || 0)
                setStep(data.current_step || 'Processing documents...')

                if (data.extraction_stats) {
                    setStats({
                        high: data.extraction_stats.high_confidence || 0,
                        ai: data.extraction_stats.ai_filled || 0,
                        calc: data.extraction_stats.calculated || 0,
                        missing: data.extraction_stats.missing || 0
                    })
                }

                if (data.status === 'ready') {
                    clearInterval(pollRef.current)
                    setStep('Complete! Redirecting...')
                    setTimeout(() => navigate(`/editor/${reportId}`), 1500)
                } else if (data.status === 'error') {
                    clearInterval(pollRef.current)
                    setError(data.error || 'Extraction failed')
                    setStatus('error')
                }
            } catch (err) {
                console.error('Polling failed:', err)
            }
        }, 2000)
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
            <div className="max-w-xl w-full">
                {status === 'error' ? (
                    <div className="card-solid p-8 text-center">
                        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-5">
                            <AlertCircle size={40} />
                        </div>
                        <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Extraction Failed</h2>
                        <p className="text-[var(--color-text-secondary)] mb-6 text-sm">{error}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => navigate('/upload')}
                                className="flex-1 py-3 bg-[var(--color-border-soft)] text-[var(--color-text-secondary)] rounded-lg font-semibold hover:bg-[var(--color-border)] transition-all"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 py-3 bg-[#1a5f7a] text-white rounded-lg font-semibold hover:bg-[#134e64] transition-all"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="card-solid p-8">
                        <div className="text-center mb-8">
                            <div className="relative inline-block mb-5">
                                <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center animate-pulse">
                                    <Search size={36} />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-[var(--color-surface)] border-3 border-[var(--color-surface)] rounded-full flex items-center justify-center shadow-md">
                                    <Loader2 className="text-primary animate-spin" size={18} />
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-1.5">Analyzing Intelligence</h2>
                            <p className="text-[var(--color-text-secondary)] font-medium text-sm">We're parsing your documents and extracting financial data.</p>
                        </div>

                        <div className="mb-8">
                            <ProgressBar percent={progress} label={step} color="blue" />
                            <p className="mt-3 text-[10px] text-center text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
                                This process usually takes 1-3 minutes
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[var(--color-background)] p-3.5 rounded-xl border border-[var(--color-border-soft)]">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                                    <CheckCircle2 size={14} />
                                    <span className="text-[9px] font-semibold uppercase tracking-tight">Verified</span>
                                </div>
                                <div className="text-xl font-bold text-[var(--color-text)]">{stats.high}</div>
                                <div className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase">Field Points</div>
                            </div>

                            <div className="bg-[var(--color-background)] p-3.5 rounded-xl border border-[var(--color-border-soft)]">
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                                    <Cpu size={14} />
                                    <span className="text-[9px] font-semibold uppercase tracking-tight">AI Reasoning</span>
                                </div>
                                <div className="text-xl font-bold text-[var(--color-text)]">{stats.ai}</div>
                                <div className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase">Smart Extractions</div>
                            </div>

                            <div className="bg-[var(--color-background)] p-3.5 rounded-xl border border-[var(--color-border-soft)]">
                                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                                    <Calculator size={14} />
                                    <span className="text-[9px] font-semibold uppercase tracking-tight">Calculated</span>
                                </div>
                                <div className="text-xl font-bold text-[var(--color-text)]">{stats.calc}</div>
                                <div className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase">Financial Ratios</div>
                            </div>

                            <div className="bg-[var(--color-background)] p-3.5 rounded-xl border border-[var(--color-border-soft)]">
                                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                                    <Database size={14} />
                                    <span className="text-[9px] font-semibold uppercase tracking-tight">Structure</span>
                                </div>
                                <div className="text-xl font-bold text-[var(--color-text)]">{stats.missing}</div>
                                <div className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase">Remaining Info</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
