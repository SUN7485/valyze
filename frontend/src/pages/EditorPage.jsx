import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReport } from '../context/ReportContext'
import { FileText, Eye, Wand2, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import SideNav from '../components/SideNav'
import EasyWayImport from '../components/EasyWayImport'
import {
    P01_CoverPage, P02_OrderSummary,
    P03_ExecutiveSummary, P04_Dashboard,
    P05_CompanyProfile, P06_Ownership,
    P07_RelatedConcerns, P08_Operations,
    P09_Banking, P10_FinancialAnalysis,
    P11_FinancialRatios, P12_RiskAssessment,
    P13_LegalStatus, P14_News,
    P15_IndustryAnalysis, P16_CreditRecommendation,
    P17_Monitoring, P18_Appendices,
    P19_BackCover
} from '../editor-pages'
import { reportAPI } from '../api/client'

const PAGE_COMPONENTS = {
    1: P01_CoverPage,
    2: P02_OrderSummary,
    3: P03_ExecutiveSummary,  // Dashboard content (scores, etc)
    4: P04_Dashboard,          // Executive Summary text content
    5: P05_CompanyProfile,
    6: P06_Ownership,
    7: P07_RelatedConcerns,
    8: P08_Operations,
    9: P09_Banking,
    10: P10_FinancialAnalysis,
    11: P11_FinancialRatios,
    12: P12_RiskAssessment,
    13: P13_LegalStatus,
    14: P14_News,
    15: P15_IndustryAnalysis,
    16: P16_CreditRecommendation,
    17: P17_Monitoring,
    18: P18_Appendices,
    19: P19_BackCover
}

export default function EditorPage() {
    const { reportId } = useParams()
    const navigate = useNavigate()
    const {
        report,
        loading,
        error,
        loadReport,
        saveReportId,
        getFieldValue,
        getFieldCounts,
        getCompletionPercentage,
        updateField,
        deletePage
    } = useReport()

    const [currentPage, setCurrentPage]   = useState(1)
    const [generatingPDF, setGeneratingPDF] = useState(false)
    const [showEasyWay, setShowEasyWay]   = useState(false)
    const [pdfError, setPdfError]         = useState('')
    const [pdfSuccess, setPdfSuccess]     = useState(false)
    const [exportingFormat, setExportingFormat] = useState('')
    const [exportSuccess, setExportSuccess] = useState({})
    const [exportError, setExportError]   = useState({})

    useEffect(() => {
        if (reportId) {
            saveReportId(reportId)
            loadReport(reportId)
        }
    }, [reportId])

    if (loading && !report) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12
                                    border-b-2 border-primary mx-auto mb-4" />
                    <p className="text-[var(--color-text-secondary)]">Loading report...</p>
                </div>
            </div>
        )
    }

    if (error && !report) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center bg-white dark:bg-white/5 p-8 max-w-sm rounded-2xl border border-slate-200 dark:border-white/10">
                    <p className="text-rose-600 text-lg mb-4 font-semibold">
                        Failed to load report
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{error}</p>
                    <button
                        onClick={() => navigate('/upload')}
                        className="px-4 py-2 bg-primary text-white
                                   rounded-lg hover:brightness-110 font-semibold"
                    >
                        Start New Report
                    </button>
                </div>
            </div>
        )
    }

    if (!report) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <p className="text-[var(--color-text-secondary)]">No report data found</p>
                    <button
                        onClick={() => navigate('/upload')}
                        className="mt-4 px-4 py-2 bg-primary text-white
                                   rounded-lg hover:brightness-110 font-semibold"
                    >
                        Start New Report
                    </button>
                </div>
            </div>
        )
    }

    const CurrentPageComponent = PAGE_COMPONENTS[currentPage]
    const companyName = getFieldValue('company_name') ||
                        getFieldValue('legal_name')   ||
                        'Untitled Report'

    const completion  = getCompletionPercentage()

    const hasData = !!(
        getFieldValue('company_name') ||
        getFieldValue('legal_name')   ||
        getFieldValue('cr_number')
    )

    const handleGenerateAI = () => {
        if (window.confirm(
            'This will generate AI narratives (executive summary, ' +
            'SWOT, recommendations etc).\n\n' +
            'Make sure you have reviewed all fields first.'
        )) {
            navigate(`/generating/${reportId}`)
        }
    }

    const handleGeneratePDF = async () => {
        setPdfError('')
        setPdfSuccess(false)

        if (!hasData) {
            setPdfError(
                'No company data found. ' +
                'Please use Easy Way Import first.'
            )
            return
        }

        try {
            setGeneratingPDF(true)

            const res = await reportAPI.generatePDF(reportId)

            if (res.data?.success) {
                setPdfSuccess(true)

                setTimeout(() => {
                    const downloadUrl = reportAPI.getDownloadURL(reportId)
                    const link        = document.createElement('a')
                    link.href         = downloadUrl
                    link.download     = `CreditReport_${companyName.replace(/\s+/g, '_').slice(0,30)}.pdf`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    setPdfSuccess(false)
                }, 500)
            }

        } catch (err) {
            const msg = err.message || 'PDF generation failed'
            setPdfError(msg)
            console.error('[PDF] Generation error:', err)
        } finally {
            setGeneratingPDF(false)
        }
    }

    const handlePreview = () => {
        const url = reportAPI.getPreviewURL(reportId)
        window.open(url, '_blank')
    }

    const handleExport = async (format) => {
        if (!hasData) {
            setExportError(prev => ({ ...prev, [format]: 'No company data found. Please use Easy Way Import first.' }))
            return
        }

        setExportError(prev => ({ ...prev, [format]: '' }))
        setExportingFormat(format)

        try {
            const exportAPI = {
                json: reportAPI.exportJSON,
                xml: reportAPI.exportXML,
                xlsx: reportAPI.exportExcel,
                csv: reportAPI.exportCSV,
                docx: reportAPI.exportWord,
            }[format]

            const res = await exportAPI(reportId)

            if (res.data?.success) {
                setExportSuccess(prev => ({ ...prev, [format]: true }))

                setTimeout(() => {
                    const downloadUrl = reportAPI.getExportDownloadURL(reportId, format)
                    const link = document.createElement('a')
                    link.href = downloadUrl
                    link.download = `CreditReport_${companyName.replace(/\s+/g, '_').slice(0,30)}.${format}`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    setExportSuccess(prev => ({ ...prev, [format]: false }))
                }, 500)
            }
        } catch (err) {
            const msg = err.message || `${format.toUpperCase()} export failed`
            setExportError(prev => ({ ...prev, [format]: msg }))
            console.error(`[Export] ${format} error:`, err)
        } finally {
            setExportingFormat('')
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-65px)]">

            {/* Sidebar */}
            <SideNav
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                report={report}
                onDeletePage={deletePage}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-white dark:bg-dark-bg/50">

                {/* Editor Header */}
                <header className="glass border-b border-slate-200 dark:border-white/5
                                   px-6 py-4 sticky top-[68px] z-40
                                   flex items-center justify-between
                                   shadow-sm bg-white/70 dark:bg-[#0F172A]/70">

                    {/* Left: Title */}
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary-soft rounded-xl
                                        flex items-center justify-center
                                        text-white shadow-md
                                        shadow-primary/20">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-white
                                           leading-none tracking-tight truncate max-w-md">
                                {companyName}
                            </h1>
                            <div className="flex items-center gap-3
                                            text-[9px] font-semibold
                                            text-slate-500 dark:text-slate-500 uppercase
                                            tracking-wider mt-1.5">
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-slate-600 dark:text-slate-400">Section {currentPage}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                {report.fields && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                        <span className={
                                            completion > 80
                                                ? 'text-emerald-500'
                                                : completion > 50
                                                    ? 'text-amber-500'
                                                    : 'text-rose-500'
                                        }>
                                            {completion}% Intelligence Ingested
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-3">

                        {/* Page Inclusion Toggle */}
                        <label className="flex items-center gap-2.5 px-3 py-2 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-all duration-200" title="Exclude this entire page from the final PDF">
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                                PDF Include
                            </span>
                            <div className={`relative w-8 h-4 rounded-full transition-all ${!getFieldValue('exclude_page_' + currentPage) ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={!getFieldValue('exclude_page_' + currentPage)}
                                    onChange={(e) => updateField('exclude_page_' + currentPage, !e.target.checked)}
                                />
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${!getFieldValue('exclude_page_' + currentPage) ? 'translate-x-4' : ''}`} />
                            </div>
                        </label>

                        {/* Preview */}
                        <button
                            onClick={handlePreview}
                            className="flex items-center gap-2 px-4 py-2
                                       text-slate-600 dark:text-slate-300 font-semibold text-[9px] uppercase tracking-wider
                                       bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg
                                       hover:bg-slate-200 dark:hover:bg-white/10 transition-all duration-200
                                       shadow-sm group cursor-pointer"
                        >
                            <Eye size={14} className="text-primary group-hover:scale-110 transition-transform" /> Quick View
                        </button>

                        {/* Export Dropdown */}
                        <div className="relative group">
                            <button
                                className={`flex items-center gap-2
                                            px-5 py-2 text-[9px] font-semibold uppercase tracking-wider rounded-lg
                                            transition-all duration-200 shadow-md cursor-pointer
                                            ${!hasData ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none' : 
                                              'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-900/20'}`}
                                disabled={!hasData}
                                title={!hasData ? 'Import data first using Easy Way Import' : 'Export in various formats'}
                            >
                                Export
                            </button>
                            
                            {/* Export Options Dropdown */}
                            <div className="absolute right-0 top-full mt-2 w-48
                                            bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10
                                            shadow-xl overflow-hidden hidden group-hover:block z-50">
                                <div className="py-2">
                                    {/* PDF */}
                                    <button
                                        onClick={handleGeneratePDF}
                                        disabled={!hasData || generatingPDF}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-red-500 text-xs">PDF</span>
                                        {generatingPDF ? 'Generating...' : 'PDF Document'}
                                    </button>

                                    {/* JSON */}
                                    <button
                                        onClick={() => handleExport('json')}
                                        disabled={!hasData || exportingFormat === 'json'}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-orange-500 text-xs">JSON</span>
                                        {exportingFormat === 'json' ? 'Exporting...' : 'JSON Data'}
                                    </button>

                                    {/* XML */}
                                    <button
                                        onClick={() => handleExport('xml')}
                                        disabled={!hasData || exportingFormat === 'xml'}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-blue-500 text-xs">XML</span>
                                        {exportingFormat === 'xml' ? 'Exporting...' : 'XML Document'}
                                    </button>

                                    {/* Excel */}
                                    <button
                                        onClick={() => handleExport('xlsx')}
                                        disabled={!hasData || exportingFormat === 'xlsx'}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-green-600 text-xs">XLSX</span>
                                        {exportingFormat === 'xlsx' ? 'Exporting...' : 'Excel Workbook'}
                                    </button>

                                    {/* CSV */}
                                    <button
                                        onClick={() => handleExport('csv')}
                                        disabled={!hasData || exportingFormat === 'csv'}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-teal-500 text-xs">CSV</span>
                                        {exportingFormat === 'csv' ? 'Exporting...' : 'CSV File'}
                                    </button>

                                    {/* Word */}
                                    <button
                                        onClick={() => handleExport('docx')}
                                        disabled={!hasData || exportingFormat === 'docx'}
                                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                    >
                                        <span className="w-8 text-blue-700 text-xs">DOCX</span>
                                        {exportingFormat === 'docx' ? 'Exporting...' : 'Word Document'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Error display */}
                        {(pdfError || Object.keys(exportError).some(k => exportError[k])) && (
                            <div className="absolute right-0 top-full
                                            mt-3 w-72 bg-rose-600
                                            text-white text-[9px] uppercase tracking-wider font-semibold
                                            rounded-xl p-4 z-50
                                            shadow-xl animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-start gap-2.5">
                                    <div className="w-5 h-5 bg-white/20 rounded-md flex items-center justify-center shrink-0">
                                        <Info size={12} />
                                    </div>
                                    <div>
                                        <div className="mb-1 font-bold">
                                            Export Error
                                        </div>
                                        <div className="opacity-80 normal-case font-medium">
                                            {pdfError || Object.values(exportError).find(e => e)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setPdfError(''); setExportError({}); }}
                                        className="ml-auto opacity-70 hover:opacity-100 text-lg leading-none"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/5">
                    <div className="max-w-5xl mx-auto p-8">
                        <div className="bg-white dark:bg-white/5 p-10 min-h-[600px] relative
                                        overflow-hidden group/page border border-slate-200 dark:border-white/10 shadow-md">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover/page:bg-primary/8 transition-colors duration-1000" />
                            
                            {CurrentPageComponent
                                ? (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <CurrentPageComponent />
                                    </div>
                                )
                                : (
                                    <div className="p-12 text-center text-[var(--color-text-muted)] italic">
                                        Module Architecture Pending...
                                    </div>
                                )
                            }
                        </div>

                        {/* Pagination Footer */}
                        <div className="mt-12 flex justify-between items-center px-6 mb-24">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="flex items-center gap-3 font-semibold transition-all
                                           text-[var(--color-text-muted)] hover:text-[var(--color-text)] dark:hover:text-white
                                           disabled:opacity-20 disabled:cursor-not-allowed group text-xs tracking-wider"
                            >
                                <div className="w-10 h-10 rounded-xl border-2 border-[var(--color-border)] dark:border-white/10
                                                flex items-center justify-center
                                                group-hover:border-primary group-hover:-translate-x-1
                                                transition-all duration-300">
                                    <ChevronLeft size={18} />
                                </div>
                                PREVIOUS
                            </button>

                            <div className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5
                                            rounded-xl text-[9px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider
                                            shadow-sm">
                                SECTION {currentPage} <span className="text-slate-300 dark:text-slate-700 mx-2">/</span> 19
                            </div>

                            <button
                                disabled={currentPage === 19}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="flex items-center gap-3 font-semibold transition-all
                                           text-primary hover:text-orange-600
                                           disabled:opacity-20 disabled:cursor-not-allowed group text-xs tracking-wider"
                            >
                                NEXT
                                <div className="w-10 h-10 rounded-xl border-2 border-primary/20
                                                flex items-center justify-center
                                                group-hover:bg-primary group-hover:text-white group-hover:translate-x-1
                                                transition-all duration-300">
                                    <ChevronRight size={18} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Easy Way Import Modal */}
            {showEasyWay && (
                <EasyWayImport
                    reportId={reportId}
                    onComplete={() => {
                        setShowEasyWay(false)
                        loadReport(reportId)
                    }}
                    onClose={() => setShowEasyWay(false)}
                />
            )}
        </div>
    )
}
