import React from 'react'
import { Download, X } from 'lucide-react'

// Shown when an order is too large to download as one ZIP: one signed link per
// file (they expire after a few minutes, so the list is fetched on demand).
export default function OrderFileLinksModal({ files, onClose }) {
    if (!files) return null
    const formatSize = (n) => {
        const size = Number(n || 0)
        if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
        if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
        return `${size} B`
    }
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">Download Files</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                            This order is too large for a single ZIP. Download the files one by one — the links expire in a few minutes.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500" aria-label="Close"><X size={18} /></button>
                </div>
                <div className="p-5 grid gap-2 max-h-[60vh] overflow-y-auto">
                    {files.length === 0 && <p className="text-sm text-slate-400">No files are attached to this order.</p>}
                    {files.map((f, i) => (
                        <div key={f.id || i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{f.filename || 'Attachment'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{formatSize(f.file_size)}</p>
                            </div>
                            {f.url ? (
                                <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.filename || true}
                                    className="px-3 py-2 bg-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:opacity-90 flex items-center gap-1.5 flex-shrink-0">
                                    <Download size={12} /> Download
                                </a>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 uppercase flex-shrink-0">Unavailable</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
