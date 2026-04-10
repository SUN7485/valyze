import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { reportAPI } from '../api/client'
import { useReport } from '../context/ReportContext'

export default function DonePage() {
    const { reportId } = useParams()
    const navigate = useNavigate()
    const { report, loadReport, clearReport, getFieldValue } = useReport()

    const [loading, setLoading] = useState(true)
    const [pdfStatus, setPdfStatus] = useState(null)
    const [generating, setGenerating] = useState(false)

    useEffect(() => {
        if (reportId) {
            loadReport(reportId)
            checkPDF()
        }
    }, [reportId])

    const checkPDF = async () => {
        try {
            const res = await reportAPI.getPDFStatus(reportId)
            setPdfStatus(res.data)
        } catch {}
    }

    const handleGeneratePDF = async () => {
        setGenerating(true)
        try {
            await reportAPI.generatePDF(reportId)
            await checkPDF()
        } catch (err) {
            alert('PDF generation failed: ' + err.message)
        } finally {
            setGenerating(false)
        }
    }

    const handleDownload = () => {
        window.location.href = reportAPI.getDownloadURL(reportId)
    }

    const handlePreview = () => {
        window.open(reportAPI.getPreviewURL(reportId), '_blank')
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
                    
                    {pdfStatus?.pdf_exists ? (
                        <div className="space-y-3">
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                                PDF ready ({pdfStatus.pdf_size_kb} KB)
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => window.open(
                                        reportAPI.getDownloadURL(reportId)
                                    )}
                                    className="px-5 py-2.5 bg-primary text-white 
                                               rounded-lg hover:brightness-110 font-semibold text-sm transition-all"
                                >
                                    Download PDF
                                </button>
                                <button
                                    onClick={() => window.open(
                                        reportAPI.getPreviewURL(reportId), '_blank'
                                    )}
                                    className="px-5 py-2.5 border border-[var(--color-border)] 
                                               rounded-lg hover:bg-[var(--color-border-soft)] text-sm font-semibold transition-all"
                                >
                                    Preview in Browser
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[var(--color-text-muted)] text-sm">
                                PDF not yet generated
                            </p>
                            <button
                                onClick={handleGeneratePDF}
                                disabled={generating}
                                className="px-5 py-2.5 bg-emerald-600 text-white 
                                           rounded-lg hover:bg-emerald-700 font-semibold text-sm transition-all
                                           disabled:opacity-50"
                            >
                                {generating ? 'Generating PDF...' : 'Generate PDF Now'}
                            </button>
                        </div>
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
                    onClick={() => navigate('/upload')}
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
