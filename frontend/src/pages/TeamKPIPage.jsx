// ============ TeamKPIPage.jsx ============
// Team performance for admins. Every number is counted from report rows — nothing
// is estimated, and no model is consulted.
//
// The one design rule this page follows: reports that were never QA'd are shown
// as their own column, never folded into "passed". A coverage figure sits next to
// every quality number so nobody reads a score built on three reviewed reports as
// if it described thirty.
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { deliveryAPI } from '../api/client'
import {
    TrendingUp, AlertCircle, Loader2, Lock, RefreshCw,
    ShieldCheck, ShieldAlert, ShieldQuestion, FileText,
} from 'lucide-react'

const PERIODS = [
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
    { days: 365, label: '1 year' },
]

// Score bands. Deliberately generous at the top: a credit report with zero
// critical findings is genuinely good work, and a scoreboard nobody can win is a
// scoreboard nobody reads.
const scoreTone = (score) => {
    if (score === null || score === undefined) return 'text-slate-400 dark:text-slate-500'
    if (score >= 90) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 70) return 'text-amber-600 dark:text-amber-400'
    return 'text-rose-600 dark:text-rose-400'
}

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`)
const num = (v) => (v === null || v === undefined ? '—' : String(v))

export default function TeamKPIPage() {
    const navigate = useNavigate()
    const [days, setDays] = useState(30)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [forbidden, setForbidden] = useState(false)

    const load = useCallback(async (period) => {
        setLoading(true)
        setError('')
        setForbidden(false)
        try {
            const res = await deliveryAPI.getKpi(period)
            setData(res.data)
        } catch (e) {
            if (e?.response?.status === 403) setForbidden(true)
            else setError(e?.response?.data?.detail || e.message || 'Could not load team metrics.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load(days) }, [load, days])

    if (forbidden) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="p-10 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
                    <Lock size={30} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Admins only</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Team metrics are visible to administrators.
                    </div>
                </div>
            </div>
        )
    }

    const team = data?.team
    const analysts = data?.analysts || []
    const weights = data?.severity_weights || {}

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <TrendingUp size={22} className="text-primary" /> Team Performance
                    </h1>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Output and QA quality per analyst, counted from report records.
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-white/10">
                        {PERIODS.map(p => (
                            <button
                                key={p.days}
                                onClick={() => setDays(p.days)}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all
                                    ${days === p.days
                                        ? 'bg-primary text-white'
                                        : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => load(days)}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg
                                   text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5
                                   hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 break-words">{error}</div>
                    <button onClick={() => load(days)} className="text-[10px] font-bold uppercase tracking-wider underline">Retry</button>
                </div>
            )}

            {loading && !data && (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Loading metrics…
                </div>
            )}

            {team && (
                <>
                    {/* Coverage warning — a quality score built on a thin sample is a
                        guess wearing a number, so say so before showing it. */}
                    {team.qa_unchecked > 0 && (
                        <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-400/30 text-slate-600 dark:text-slate-300 text-xs flex items-start gap-2">
                            <ShieldQuestion size={15} className="flex-shrink-0 mt-0.5" />
                            <div>
                                <strong>{team.qa_unchecked}</strong> of {team.reports} report{team.reports === 1 ? '' : 's'} in
                                this window were never QA-checked ({pct(team.qa_coverage)} coverage).
                                Quality scores below describe only the {team.qa_checked} that were reviewed.
                            </div>
                        </div>
                    )}

                    {/* Team headline */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Stat label="Reports" value={num(team.reports)} icon={FileText} />
                        <Stat label="QA Passed" value={num(team.qa_passed)} icon={ShieldCheck} tone="text-emerald-600 dark:text-emerald-400" />
                        <Stat label="QA Failed" value={num(team.qa_failed)} icon={ShieldAlert} tone="text-rose-600 dark:text-rose-400" />
                        <Stat label="Not Checked" value={num(team.qa_unchecked)} icon={ShieldQuestion} tone="text-slate-500 dark:text-slate-400" />
                        <Stat label="Quality Score" value={num(team.quality_score)} tone={scoreTone(team.quality_score)} />
                    </div>

                    {/* Mistake mix */}
                    <div className="p-4 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                            Findings by severity · {team.findings} total
                        </div>
                        <SeverityBar critical={team.critical} major={team.major} minor={team.minor} />
                        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                            <Legend color="bg-rose-500" label="Critical" n={team.critical} w={weights.critical} />
                            <Legend color="bg-amber-500" label="Major" n={team.major} w={weights.major} />
                            <Legend color="bg-slate-400" label="Minor" n={team.minor} w={weights.minor} />
                        </div>
                    </div>

                    {/* Per-analyst */}
                    <div className="rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            By analyst
                        </div>

                        {analysts.length === 0 && (
                            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                <div className="font-bold text-slate-700 dark:text-slate-200">
                                    No reports in the last {days} days.
                                </div>
                                <div className="text-xs mt-1">
                                    This page counts reports by their <code className="font-mono">updated_at</code>.
                                    Try a longer window above — if a year is also empty, no reports have been
                                    touched since the QA columns were added.
                                </div>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            {analysts.length > 0 && (
                                <table className="w-full text-xs min-w-[720px]">
                                    <thead>
                                        <tr className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-white/10">
                                            <Th align="left">Analyst</Th>
                                            <Th>Reports</Th>
                                            <Th>Reviewed</Th>
                                            <Th>Critical</Th>
                                            <Th>Major</Th>
                                            <Th>Minor</Th>
                                            <Th>Per report</Th>
                                            <Th>Pass rate</Th>
                                            <Th>Score</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysts.map(a => (
                                            <tr key={a.analyst} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                                                <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                                    {a.analyst}
                                                </td>
                                                <Td>{a.reports}</Td>
                                                <Td>
                                                    {a.qa_checked}
                                                    {a.qa_unchecked > 0 && (
                                                        <span className="text-slate-400 dark:text-slate-500"> /{a.reports}</span>
                                                    )}
                                                </Td>
                                                <Td tone={a.critical > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>{a.critical}</Td>
                                                <Td tone={a.major > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>{a.major}</Td>
                                                <Td tone="text-slate-500 dark:text-slate-400">{a.minor}</Td>
                                                <Td>{num(a.findings_per_report)}</Td>
                                                <Td>{pct(a.pass_rate)}</Td>
                                                <Td tone={`font-black ${scoreTone(a.quality_score)}`}>{num(a.quality_score)}</Td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                        Score = 100 − (weighted findings ÷ reviewed reports) × 10, floored at 0.
                        Weights: critical ×{weights.critical}, major ×{weights.major}, minor ×{weights.minor}.
                        An analyst with no reviewed reports scores “—”, not 100 — no evidence is not a perfect record.
                        Counts come from the last QA run on each report, so re-running QA replaces that report's contribution.
                    </div>
                </>
            )}
        </div>
    )
}

function Stat({ label, value, icon: Icon, tone = 'text-slate-900 dark:text-white' }) {
    return (
        <div className="p-4 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {Icon && <Icon size={11} />} {label}
            </div>
            <div className={`text-2xl font-black mt-1 ${tone}`}>{value}</div>
        </div>
    )
}

function SeverityBar({ critical, major, minor }) {
    const total = (critical || 0) + (major || 0) + (minor || 0)
    if (!total) {
        return (
            <div className="h-2.5 rounded-full bg-emerald-500/30 flex items-center justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    No findings
                </span>
            </div>
        )
    }
    const w = (n) => `${((n || 0) / total) * 100}%`
    return (
        <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-white/10">
            <div className="bg-rose-500 h-full" style={{ width: w(critical) }} />
            <div className="bg-amber-500 h-full" style={{ width: w(major) }} />
            <div className="bg-slate-400 h-full" style={{ width: w(minor) }} />
        </div>
    )
}

function Legend({ color, label, n, w }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            {label} <strong className="text-slate-700 dark:text-slate-200">{n}</strong>
            {w !== undefined && <span className="text-slate-400 dark:text-slate-500">×{w}</span>}
        </span>
    )
}

function Th({ children, align = 'right' }) {
    return <th className={`px-3 py-2 font-bold ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
}

function Td({ children, tone = 'text-slate-700 dark:text-slate-300' }) {
    return <td className={`px-3 py-2.5 text-right tabular-nums ${tone}`}>{children}</td>
}
