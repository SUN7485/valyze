import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { reportAPI } from '../api/client'
import { printHtml } from '../lib/htmlDocument'
import { useReport } from '../context/ReportContext'

export default function DonePage() {
    const { reportId } = useParams()
    const navigate = useNavigate()
    const { report, loadReport, getFieldValue } = useReport()

    const [loading, setLoading] = useState(true)
    const [pdfStatus, setPdfStatus] = useState(null)
    const [generating, setGenerating] = useState(false)
    const [actionError, setActionError] = useState('')

    useEffect(() => {
        if (!reportId) return
        let cancelled = false
        setLoading(true)
        Promise.all([
            loadReport(reportId),
            reportAPI.getPDFStatus(reportId).then(res => res.data).catch(() => null),
        ]).then(([, status]) => {
            if (cancelled) return
            setPdfStatus(status)
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [reportId]) // eslint-disable-line react-hooks/exhaustive-deps

    // The PDF is produced in the browser: the server renders the report HTML and
    // the print dialog's "Save as PDF" writes the file.
    const handleGeneratePDF = async () => {
        setGenerating(true)
        setActionError('')
        try {
            const res = await reportAPI.generatePDF(reportId)
            if (!res.data?.html) throw new Error('No HTML returned')
            printHtml(res.data.html)
        } catch (err) {
            setActionError('PDF generation failed: ' + err.message)
        } finally {
            setGenerating(false)
        }
    }

    const handlePreview = async () => {
        setActionError('')
        try {
            await reportAPI.openPreview(reportId)
        } catch (err) {
            setActionError(err.message || 'Could not open the preview')
        }
    }

    const stats = {
        rating: getFieldValue('credit_rating') || 'N/A',
        limit: getFieldValue('recommended_limit') || 'N/A',
        score: getFieldValue('health_score') || 'N/A',
        risk: getFieldValue('risk_level') || 'N/A'
    }

    if (loading) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
                <p className="text-[var(--color-text-muted)] font-semibold uppercase tracking-wider text-xs">Finalizing Documents...</p>
            </div>
        )
    }

    return (
        <div className="py-12 px-6 max-w-4xl mx-auto">
            <div className="text-center mb-10">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-100 dark:shadow-emerald-500/5">
                    <CheckCircle2 size={40} />
                </div>
                <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2 tracking-tight">Intelligence Report Ready</h1>
                <p className="text-[var(--color-text-secondary)] text-base font-medium">Successfully generated for {getFieldValue('company_name')}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-10">
                {/* Summary Card */}
                <div className="card-solid p-6 flex flex-col">
                    <h3 className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
                        <ShieldCheck size={14} className="text-primary" /> Executive Insights
                    </h3>

                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <div className="p-3.5 bg-[var(--color-background)] rounded-xl border border-[var(--color-border-soft)]">
                            <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Credit Rating</p>
                            <p className="text-2xl font-bold text-[#1a5f7a]">{stats.rating}</p>
                        </div>
                        <div className="p-3.5 bg-[var(--color-background)] rounded-xl border border-[var(--color-border-soft)]">
                            <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Risk Profile</p>
                            <p className="text-xl font-bold text-[var(--color-text)]">{stats.risk}</p>
                        </div>
                        <div className="p-3.5 bg-[var(--color-background)] rounded-xl border border-[var(--color-border-soft)]">
                            <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Health Score</p>
                            <p className="text-xl font-bold text-[var(--color-text)]">{stats.score}<span className="text-xs font-semibold text-[var(--color-text-muted)]">/100</span></p>
                        </div>
                        <div className="p-3.5 bg-[var(--color-background)] rounded-xl border border-[var(--color-border-soft)]">
                            <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Rec. Limit</p>
                            <p className="text-sm font-bold text-[var(--color-text)] truncate">{stats.limit === 'N/A' ? 'Not Computed' : stats.limit}</p>
                        </div>
                    </div>
                </div>

                {/* Actions Card */}
                <div className="card-solid p-5 mb-4">
                    <h2 className="text-base font-semibold mb-3 text-[var(--color-text)]">PDF Report</h2>
                    
                    {actionError && (
                        <p className="text-rose-600 dark:text-rose-400 text-sm font-medium mb-3">{actionError}</p>
                    )}
                    {pdfStatus?.can_generate ? (
                        <div className="space-y-3">
                            <p className="text-[var(--color-text-secondary)] text-sm">
                                The PDF is created in your browser — choose "Save as PDF" in the print dialog.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleGeneratePDF}
                                    disabled={generating}
                                    className="px-5 py-2.5 bg-primary text-white
                                               rounded-lg hover:brightness-110 font-semibold text-sm transition-all disabled:opacity-50"
                                >
                                    {generating ? 'Preparing PDF...' : 'Download PDF'}
                                </button>
                                <button
                                    onClick={handlePreview}
                                    className="px-5 py-2.5 border border-[var(--color-border)] 
                                               rounded-lg hover:bg-[var(--color-border-soft)] text-sm font-semibold transition-all"
                                >
                                    Preview in Browser
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[var(--color-text-muted)] text-sm">
                            {pdfStatus ? 'This report has no company data yet — extract or enter data first.' : 'Could not check the PDF status.'}
                        </p>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 justify-center mt-6">
                <button
                    onClick={() => navigate(`/editor/${reportId}`)}
                    className="px-4 py-2 border border-[var(--color-border)] rounded-lg 
                               hover:bg-[var(--color-border-soft)] text-[var(--color-text-secondary)] text-sm font-medium transition-all"
                >
                    ← Back to Editor
                </button>
                <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 border border-[var(--color-border)] rounded-lg 
                               hover:bg-[var(--color-border-soft)] text-[var(--color-text-secondary)] text-sm font-medium transition-all"
                >
                    + New Report
                </button>
                <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 border border-[var(--color-border)] rounded-lg 
                               hover:bg-[var(--color-border-soft)] text-[var(--color-text-secondary)] text-sm font-medium transition-all"
                >
                    Home
                </button>
            </div>

            <div className="mt-10 text-center text-[9px] text-[var(--color-text-muted)] font-semibold uppercase tracking-widest">
                Report ID: {reportId}
            </div>
        </div>
    )
}
