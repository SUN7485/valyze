import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Zap, ArrowRight, ExternalLink, Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ExtractorPage() {
    const navigate = useNavigate()
    const { reportId } = useParams()
    const { user, loading } = useAuth()
    const token = localStorage.getItem('valyze_token') || ''

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 size={32} className="text-primary animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Checking authentication...</p>
                </div>
            </div>
        )
    }

    if (!user) {
        navigate('/login')
        return null
    }

    const extractorBase = import.meta.env.VITE_EXTRACTOR_URL || 'https://valyze-extractor.vercel.app'

    useEffect(() => {
        if (reportId) {
            const url = `${extractorBase}/reports/${reportId}?token=${encodeURIComponent(token)}`
            window.open(url, '_blank')
        }
    }, [reportId, token])

    return (
        <div className="min-h-[calc(100vh-120px)] flex items-center justify-center">
            <div className="max-w-lg w-full text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-amber-500/20">
                    <Zap className="text-white" size={40} />
                </div>
                <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">AI Document Extractor</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Extract credit intelligence from PDFs, images, and documents using Claude AI.
                </p>

                <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl p-8 mb-6 text-left">
                    <div className="flex items-center gap-3 mb-4 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Shield size={20} />
                        <span className="text-xs uppercase tracking-wider">Authenticated Access</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                        The extractor opens in a new tab. You're already authenticated — no need to log in again.
                        It requires an Anthropic API key to process documents.
                    </p>
                    <button
                        onClick={() => {
                            const url = reportId
                                ? `${extractorBase}/reports/${reportId}?token=${encodeURIComponent(token)}`
                                : extractorBase
                            window.open(url, '_blank')
                        }}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
                    >
                        <ExternalLink size={18} />
                        Open Extractor
                    </button>
                    {reportId && (
                        <p className="text-xs text-slate-400 mt-3 text-center">
                            Report: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{reportId}</span>
                        </p>
                    )}
                </div>

                <button
                    onClick={() => navigate('/')}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors font-medium"
                >
                    <ArrowRight size={16} className="rotate-180" />
                    Back to Home
                </button>
            </div>
        </div>
    )
}