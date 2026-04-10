import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    CheckCircle2,
    Loader2,
    Sparkles,
    BrainCircuit,
    AlertCircle,
    ArrowRight,
} from 'lucide-react'
import { reportAPI } from '../api/client'
import ProgressBar from '../components/ProgressBar'

const ALL_SECTIONS = [
    { key: 'executive_summary_text',     label: 'Executive Summary' },
    { key: 'company_history_text',        label: 'Company History' },
    { key: 'core_activities_description', label: 'Operations Review' },
    { key: 'financial_highlights',        label: 'Financial Commentary' },
    { key: 'risk_summary',                label: 'Risk Assessment' },
    { key: 'peer_comparison',             label: 'Peer Comparison' },
    { key: 'credit_conditions',           label: 'Credit Opinion' },
    { key: 'banking_notes',               label: 'Banking Analysis' },
]

// ── Status helpers ──────────────────────────────────────────────────────────

function isDoneStatus(data) {
    if (!data) return false
    return (
        data.complete === true ||
        data.status === 'complete' ||
        data.status === 'done' ||
        data.status === 'ready' ||
        data.status === 'finished' ||
        Number(data.progress_percent) >= 100
    )
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GeneratingPage() {
    const { reportId } = useParams()
    const navigate = useNavigate()

    const [progress, setProgress]             = useState(0)
    const [step, setStep]                     = useState('Initializing AI...')
    const [pageStatus, setPageStatus]         = useState('generating') // generating | done | error
    const [completedSections, setCompleted]   = useState([])
    const [showSkip, setShowSkip]             = useState(false)
    const [errorMsg, setErrorMsg]             = useState('')

    const pollRef      = useRef(null)
    const redirectedRef = useRef(false)

    // ── Redirect helper (call once) ─────────────────────────────────────────
    const goToEditor = useCallback(() => {
        if (redirectedRef.current) return
        redirectedRef.current = true
        if (pollRef.current) clearInterval(pollRef.current)
        navigate(`/editor/${reportId}`)
    }, [navigate, reportId])

    // ── Show skip button after 20 s ─────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setShowSkip(true), 20_000)
        return () => clearTimeout(t)
    }, [])

    // ── Hard timeout — always redirect after 5 minutes ─────────────────────
    useEffect(() => {
        const t = setTimeout(() => {
            console.warn('[GeneratingPage] Hard timeout — forcing redirect')
            goToEditor()
        }, 300_000)
        return () => clearTimeout(t)
    }, [goToEditor])

    // ── Polling ─────────────────────────────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current)

        pollRef.current = setInterval(async () => {
            try {
                const res  = await reportAPI.getGenerationProgress(reportId)
                const data = res?.data ?? {}

                const pct      = Number(data.progress_percent ?? 0)
                const current  = data.current_step ?? 'Writing narratives...'
                const sections = Array.isArray(data.completed_sections)
                    ? data.completed_sections
                    : []

                setProgress(pct)
                setStep(current)
                setCompleted(sections)

                if (isDoneStatus(data)) {
                    clearInterval(pollRef.current)
                    setProgress(100)
                    setStep('Report Finalized!')
                    setPageStatus('done')
                    setTimeout(goToEditor, 1_500)
                }
            } catch (err) {
                console.error('[GeneratingPage] Poll error:', err)
            }
        }, 2_000)
    }, [reportId, goToEditor])

    // ── Kick off generation ─────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false

        const run = async () => {
            try {
                // Check if already done (e.g. user navigated back)
                try {
                    const check = await reportAPI.getGenerationProgress(reportId)
                    if (isDoneStatus(check?.data)) {
                        goToEditor()
                        return
                    }
                } catch (_) { /* ignore */ }

                // FIX: Check if report was imported via Easy Way Import
                // If so, skip AI generation and go directly to editor
                try {
                    const reportRes = await reportAPI.getReport(reportId)
                    const reportData = reportRes?.data
                    
                    // Check if any critical field has source === "easy_way_import"
                    const fields = reportData?.fields || {}
                    const hasEasyWayImport = Object.values(fields).some(
                        (field) => field?.source === "easy_way_import"
                    )
                    
                    if (hasEasyWayImport) {
                        console.log("[GeneratingPage] Report imported via Easy Way - skipping AI generation")
                        goToEditor()
                        return
                    }
                } catch (_) {
                    // If we can't check, proceed with generation
                    console.log("[GeneratingPage] Could not check import status, proceeding with generation")
                }

                await reportAPI.generateNarratives(reportId)
                if (!cancelled) startPolling()
            } catch (err) {
                console.error('[GeneratingPage] Generation start error:', err)

                if (cancelled) return

                // Timeout errors — the server may still be working; start polling
                if (
                    err?.message?.toLowerCase().includes('timeout') ||
                    err?.code === 'ECONNABORTED'
                ) {
                    console.warn('[GeneratingPage] Timeout — starting poll anyway')
                    startPolling()
                    return
                }

                setErrorMsg(err?.response?.data?.detail ?? err.message ?? 'Unknown error')
                setPageStatus('error')
            }
        }

        run()
        return () => {
            cancelled = true
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [reportId, startPolling, goToEditor])

    // ── Section status helpers ───────────────────────────────────────────────
    const sectionDone    = (key) => completedSections.includes(key) || progress >= 100
    const sectionCurrent = (key, idx) => {
        const threshold = Math.max(0, (idx / ALL_SECTIONS.length) * 100 - 5)
        return !sectionDone(key) && progress > threshold
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
            <div className="max-w-xl w-full">
                <div className="card-solid p-8 relative overflow-hidden">

                    {/* Background decoration */}
                    <Sparkles
                        className="absolute -top-4 -right-4 text-primary/5 opacity-10"
                        size={160}
                    />

                    {/* ── Header ── */}
                    <div className="text-center mb-6 relative z-10">
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg
                            ${pageStatus === 'error'
                                ? 'bg-rose-500 shadow-rose-200 dark:shadow-rose-500/10'
                                : pageStatus === 'done'
                                ? 'bg-emerald-500 shadow-emerald-200 dark:shadow-emerald-500/10'
                                : 'bg-primary shadow-primary/20 dark:shadow-primary/10 animate-bounce'}`}
                        >
                            {pageStatus === 'error' ? (
                                <AlertCircle size={40} className="text-white" />
                            ) : pageStatus === 'done' ? (
                                <CheckCircle2 size={40} className="text-white" />
                            ) : (
                                <BrainCircuit size={40} className="text-white" />
                            )}
                        </div>

                        <h2 className="text-2xl font-bold text-[var(--color-text)] mb-1.5 tracking-tight">
                            {pageStatus === 'error'
                                ? 'Generation Failed'
                                : pageStatus === 'done'
                                ? 'Intelligence Ready!'
                                : 'Generating Intelligence'}
                        </h2>
                        <p className="text-[var(--color-text-secondary)] font-medium text-sm">
                            {pageStatus === 'error'
                                ? 'An error occurred. You can still view the report.'
                                : pageStatus === 'done'
                                ? 'Redirecting to editor...'
                                : 'AI is writing professional narratives based on your data.'}
                        </p>
                    </div>

                    {/* ── Error box ── */}
                    {pageStatus === 'error' && errorMsg && (
                        <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-sm text-rose-700 dark:text-rose-400">
                            {errorMsg}
                        </div>
                    )}

                    {/* ── Progress bar ── */}
                    {pageStatus !== 'error' && (
                        <div className="mb-6 relative z-10">
                            <ProgressBar percent={progress} label={step} color="blue" />
                        </div>
                    )}

                    {/* ── Section checklist ── */}
                    <div className="space-y-2.5 relative z-10">
                        <h4 className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-3">
                            Content Production
                        </h4>

                        {ALL_SECTIONS.map(({ key, label }, idx) => {
                            const done    = sectionDone(key)
                            const current = sectionCurrent(key, idx)

                            return (
                                <div
                                    key={key}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all
                                        ${done
                                            ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-500/10'
                                            : current
                                            ? 'bg-primary/5 dark:bg-primary/5 border-primary/10 dark:border-primary/10 ring-1 ring-primary/10'
                                            : 'bg-[var(--color-background)]/50 border-[var(--color-border-soft)] opacity-40'}`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        {done ? (
                                            <CheckCircle2 className="text-emerald-500 shrink-0" size={16} />
                                        ) : current ? (
                                            <Loader2 className="text-primary animate-spin shrink-0" size={16} />
                                        ) : (
                                            <div className="w-[16px] h-[16px] border-2 border-[var(--color-border)] rounded-full shrink-0" />
                                        )}
                                        <span className={`text-sm font-semibold
                                            ${done ? 'text-emerald-800 dark:text-emerald-400' : current ? 'text-primary dark:text-primary-soft' : 'text-[var(--color-text-muted)]'}`}>
                                            {label}
                                        </span>
                                    </div>
                                    {current && (
                                        <span className="text-[9px] font-bold animate-pulse text-primary uppercase">
                                            Generating…
                                        </span>
                                    )}
                                    {done && (
                                        <span className="text-[9px] font-bold text-emerald-500 uppercase">
                                            Ready
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* ── Footer note ── */}
                    {pageStatus === 'generating' && (
                        <p className="mt-6 text-center text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider leading-relaxed">
                            Generating custom commentary using{' '}
                            <span className="text-primary">LM Studio Qwen 2.5</span>{' '}
                            • This might take 2–5 minutes
                        </p>
                    )}

                    {/* ── Completed buttons ── */}
                    {pageStatus === 'done' && (
                        <div className="mt-5 space-y-3">
                            <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-center text-sm">
                                Generation Complete — redirecting…
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={goToEditor}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-white
                                               rounded-lg hover:brightness-110 font-semibold transition-colors"
                                >
                                    Open Editor <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Skip / Return buttons ── */}
                    <div className="mt-5 flex flex-col items-center gap-2.5">
                        {showSkip && pageStatus === 'generating' && (
                            <button
                                onClick={goToEditor}
                                className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white
                                           rounded-lg hover:bg-amber-600 font-semibold transition-colors"
                            >
                                Skip to Editor <ArrowRight size={14} />
                            </button>
                        )}

                        {pageStatus === 'error' && (
                            <button
                                onClick={goToEditor}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white
                                           rounded-lg hover:brightness-110 font-semibold transition-colors"
                            >
                                Go to Editor Anyway <ArrowRight size={14} />
                            </button>
                        )}

                        {pageStatus === 'generating' && !showSkip && (
                            <button
                                onClick={goToEditor}
                                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline transition-colors"
                            >
                                ← Return to Editor
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}