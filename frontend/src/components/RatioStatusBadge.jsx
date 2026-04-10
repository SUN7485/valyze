import React from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

export default function RatioStatusBadge({ status, label }) {
    const CONFIG = {
        low: {
            label: label || 'Optimal',
            className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            icon: <CheckCircle2 size={10} />
        },
        medium: {
            label: label || 'Moderate',
            className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            icon: <AlertTriangle size={10} />
        },
        high: {
            label: label || 'Concerns',
            className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            icon: <XCircle size={10} />
        }
    }

    const config = CONFIG[status] || CONFIG.medium

    return (
        <span className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-widest flex items-center gap-1.5 border backdrop-blur-sm transition-all duration-300 ${config.className}`}>
            {config.icon}
            <span>{config.label}</span>
        </span>
    )
}