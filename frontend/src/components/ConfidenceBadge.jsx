import React from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Calculator, UserRoundPen, Settings2, Sparkles } from 'lucide-react'

export default function ConfidenceBadge({ confidence, fieldSource }) {
    // Hide badge for imported fields - they already have correct values
    if (fieldSource === 'easy_way_import') return null
    
    const CONFIG = {
        high: {
            label: 'Verified',
            className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            icon: <CheckCircle2 size={10} />
        },
        medium: {
            label: 'Review',
            className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            icon: <AlertTriangle size={10} />
        },
        missing: {
            label: 'Missing',
            className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            icon: <XCircle size={10} />
        },
        calculated: {
            label: 'Calculated',
            className: 'bg-primary/10 text-primary border-primary/20',
            icon: <Calculator size={10} />
        },
        user: {
            label: 'Amended',
            className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            icon: <UserRoundPen size={10} />
        },
        system: {
            label: 'Core',
            className: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
            icon: <Settings2 size={10} />
        },
        ai: {
             label: 'AI Insights',
             className: 'bg-cta/10 text-cta border-cta/20',
             icon: <Sparkles size={10} />
        }
    }

    const config = CONFIG[confidence] || CONFIG.missing

    return (
        <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1.5 border backdrop-blur-sm transition-all duration-300 hover:scale-105 ${config.className}`}>
            {config.icon}
            <span>{config.label}</span>
        </span>
    )
}
