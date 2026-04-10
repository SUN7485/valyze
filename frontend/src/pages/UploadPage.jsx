import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, File, X, Info, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react'
import { reportAPI } from '../api/client'
import { useReport } from '../context/ReportContext'

export default function UploadPage() {
    const navigate = useNavigate()
    const { saveReportId } = useReport()

    const [clientName, setClientName] = useState('')
    const [analystName, setAnalystName] = useState('')
    const [companyHint, setCompanyHint] = useState('')
    const [files, setFiles] = useState([])
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState(null)

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files)
        addFiles(selectedFiles)
    }

    const addFiles = (selectedFiles) => {
        const validExtensions = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.tiff']
        const filtered = selectedFiles.filter(file => {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
            return validExtensions.includes(ext)
        })

        setFiles(prev => [...prev, ...filtered])
    }

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        addFiles(Array.from(e.dataTransfer.files))
    }, [])

    const handleStartAnalysis = async () => {
        if (!clientName || !analystName || files.length === 0) return

        setUploading(true)
        setError(null)

        try {
            // 1. Start report record
            const startRes = await reportAPI.startReport({
                client_name: clientName,
                analyst_name: analystName,
                company_name_hint: companyHint
            })
            const reportId = startRes.data.report_id

            // 2. Upload files
            await reportAPI.uploadFiles(reportId, files)

            // 3. Save to context and navigate
            saveReportId(reportId)
            navigate(`/processing/${reportId}`)
        } catch (err) {
            setError(err.message || 'Failed to start analysis')
        } finally {
            setUploading(false)
        }
    }

    const isFormValid = clientName && analystName && files.length > 0

    return (
        <div className="py-10 px-6 max-w-5xl mx-auto">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2 tracking-tight">New Credit Analysis</h1>
                <p className="text-[var(--color-text-secondary)] font-medium">Configure basic info and upload documents to begin.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                {/* Left Column: Form */}
                <div className="md:col-span-1 space-y-6">
                    <div className="card-solid p-6">
                        <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6">Basic Information</h3>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Client Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Saudi National Bank"
                                    className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Analyst Name *</label>
                                <input
                                    type="text"
                                    placeholder="Your full name"
                                    className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    value={analystName}
                                    onChange={(e) => setAnalystName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Company Name Hint</label>
                                <input
                                    type="text"
                                    placeholder="Approx. merchant name"
                                    className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    value={companyHint}
                                    onChange={(e) => setCompanyHint(e.target.value)}
                                />
                                <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)] leading-tight">Helping AI identify documents faster.</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-cyan-50 dark:bg-cyan-900/20 p-5 rounded-xl border border-cyan-100 dark:border-cyan-800/30">
                        <div className="flex gap-3">
                            <Info className="text-cyan-500 flex-shrink-0" size={18} />
                            <div>
                                <h4 className="font-semibold text-cyan-900 dark:text-cyan-300 text-sm mb-1">Language Support</h4>
                                <p className="text-xs text-cyan-700 dark:text-cyan-400 font-medium leading-relaxed">System supports Arabic and English documents. Mixed language documents are handled automatically.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Upload */}
                <div className="md:col-span-2 space-y-6">
                    <div
                        className={`card-solid border-2 border-dashed ${files.length > 0 ? 'border-primary/30 dark:border-primary/20' : 'border-[var(--color-border)]'} rounded-2xl p-10 text-center transition-all hover:border-primary/50 group relative cursor-pointer`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Upload size={32} />
                            </div>
                            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">Drop documents here</h3>
                            <p className="text-[var(--color-text-secondary)] font-medium mb-6 text-sm">or click to browse from your computer</p>

                            <input
                                type="file"
                                multiple
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={handleFileChange}
                            />

                            <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold tracking-wider bg-[var(--color-border-soft)] px-4 py-1.5 rounded-full">
                                PDF, WORD, IMAGE (MAX 100MB)
                            </div>
                        </div>
                    </div>

                    {files.length > 0 && (
                        <div className="card-solid overflow-hidden">
                            <div className="px-6 py-3 border-b border-[var(--color-border-soft)] bg-[var(--color-border-soft)] flex justify-between items-center">
                                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Selected Files ({files.length})</h3>
                                <button onClick={() => setFiles([])} className="text-xs text-rose-500 font-semibold hover:underline">Clear all</button>
                            </div>
                            <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border-soft)]">
                                {files.map((file, idx) => (
                                    <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-[var(--color-border-soft)]/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-[var(--color-border-soft)] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]">
                                                {file.type.includes('image') ? <FileText size={18} /> : <File size={18} />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-[var(--color-text)] truncate max-w-[200px]">{file.name}</p>
                                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.name.split('.').pop()}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => removeFile(idx)} className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-full transition-all">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4 rounded-xl flex gap-3">
                            <AlertTriangle className="text-rose-500 flex-shrink-0" size={18} />
                            <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</p>
                        </div>
                    )}

                    <button
                        disabled={!isFormValid || uploading}
                        onClick={handleStartAnalysis}
                        className={`w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-all shadow-md
              ${!isFormValid || uploading
                                 ? 'bg-[var(--color-border-soft)] text-[var(--color-text-muted)] cursor-not-allowed shadow-none'
                                 : 'bg-[#1a5f7a] text-white hover:bg-[#134e64] shadow-[#1a5f7a]/15 border-b-3 border-black/15 active:translate-y-0.5 active:border-b-1'
                             }`}
                    >
                        {uploading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Analyzing Data...
                            </>
                        ) : (
                            <>
                                Start Analysis <CheckCircle2 size={22} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
