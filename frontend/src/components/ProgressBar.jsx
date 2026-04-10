import React from 'react'

export default function ProgressBar({ percent, label, color = 'blue' }) {
    const colorMap = {
        blue: 'bg-primary shadow-md shadow-primary/20',
        green: 'bg-emerald-500 shadow-md shadow-emerald-500/20',
        orange: 'bg-amber-500 shadow-md shadow-amber-500/20'
    }

    return (
        <div className="w-full space-y-2.5">
            {label && (
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                    <span className="text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="text-primary dark:text-white px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
                        {percent}%
                    </span>
                </div>
            )}
            <div className="w-full bg-[var(--color-border)] dark:bg-white/10 rounded-full h-2 overflow-hidden shadow-inner">
                <div
                    className={`${colorMap[color]} h-full rounded-full transition-all duration-1000 ease-out relative`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse-slow" />
                </div>
            </div>
        </div>
    )
}
