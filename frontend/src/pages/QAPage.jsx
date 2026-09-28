// ============ QAPage.jsx ============
// AI quality review over one report, presented in the same shell as the Extractor:
// gradient header, staged progress with a live clock, tabbed results.
//
// The model is given the report JSON and asked to find contradictions, impossible
// values and formatting breaks, and to return machine-applyable corrections.
// Applying a finding writes exactly ONE field through ReportContext — never a
// wholesale report replacement.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReport } from '../context/ReportContext'
import { deliveryAPI } from '../api/client'
import { MODEL_QA, ANTHROPIC_VERSION, MAX_TOKENS_QA, EFFORT_QA } from '../config/ai'
import { runToCompletion, parseJsonResult } from '../lib/claudeTurns'

const PROXY_URL = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}/api/proxy`

const STAGES = ['Reading report', 'Claude reviewing', 'Parsing findings', 'Done']

const QA_SYSTEM_PROMPT = `You are a QA reviewer for Valyze credit reports. You are given one report as JSON.
Check it against itself and against the source documents referenced inside it. Report ONLY
problems you can point at with evidence from the data you were given. Never invent a fact.

Check for:
- internal contradictions (a date, number, name or status stated two different ways)
- impossible values (expiry before issue, percentages not summing to 100, future dates in
  the past tense, negative capital)
- missing fields that the rest of the report proves must exist
- formatting that breaks the report's own conventions (date format, CR number shape, currency)
- narrative text that contradicts the structured fields

Severity means impact on a lending decision, not effort to fix:
- critical: could change a credit decision (wrong CR number, wrong owner, wrong financials)
- major: materially misleading but not decision-changing (contradictory dates, wrong address)
- minor: cosmetic or formatting only

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "verdict": "pass" | "fail",
  "checked_at": "<ISO 8601>",
  "findings": [
    {
      "field": "<exact field key from the report>",
      "severity": "critical" | "major" | "minor",
      "problem": "<one sentence: what is wrong>",
      "evidence": "<what in the data proves it>",
      "current_value": "<the exact current value, verbatim>",
      "suggested_value": "<the corrected value, or null if you cannot determine it>"
    }
  ]
}

"verdict" is "fail" if there is any critical or major finding, otherwise "pass".
If you find nothing, return an empty findings array and verdict "pass".`

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 }

const SEVERITY_STYLE = {
    critical: { badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', edge: 'border-l-rose-500', dot: '🔴' },
    major: { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', edge: 'border-l-amber-500', dot: '🟠' },
    minor: { badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-400', edge: 'border-l-slate-400', dot: '⚪' },
}

const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const sessionIsExpired = () => {
    const token = localStorage.getItem('valyze_token') || ''
    if (!token) return true
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (!payload?.exp) return false
        return payload.exp * 1000 <= Date.now()
    } catch { return true }
}

// Two error shapes arrive from the proxy: FastAPI's {detail} and Anthropic's {error:{message}}.
const readProxyError = async (res) => {
    try {
        const body = await res.json()
        return `[${res.status}] ${body?.error?.message || body?.detail || JSON.stringify(body)}`
    } catch {
        return `[${res.status}] HTTP ${res.status}`
    }
}

/* A QA result is only usable if it has the shape we apply from. Anything else is
   an error the analyst sees — never a partially-applied report. */
const validateQaResult = (obj) => {
    if (!obj || typeof obj !== 'object') return 'Not a JSON object.'
    if (!Array.isArray(obj.findings)) return 'Missing a "findings" array.'
    for (const [i, f] of obj.findings.entries()) {
        if (!f || typeof f !== 'object') return `Finding ${i + 1} is not an object.`
        if (!f.field || typeof f.field !== 'string') return `Finding ${i + 1} has no "field".`
        if (!['critical', 'major', 'minor'].includes(f.severity)) {
            return `Finding ${i + 1} has an unknown severity "${f.severity}".`
        }
    }
    return null
}

const keyOf = (finding, index) => `${index}:${finding.field}`

export default function QAPage() {
    const { reportId } = useParams()
    const navigate = useNavigate()
    const { report, loadReport, saveReportId, updateField, getFieldValue } = useReport()

    const [status, setStatus] = useState('idle')   // idle | loading | done | error
    const [stage, setStage] = useState(0)
    const [logMsg, setLogMsg] = useState('')
    const [elapsed, setElapsed] = useState(0)
    const [error, setError] = useState('')
    const [qa, setQa] = useState(null)
    const [applied, setApplied] = useState({})
    const [tab, setTab] = useState('findings')
    const [importText, setImportText] = useState('')
    // null = not attempted, true = stored on the report, false = local only
    const [verdictSaved, setVerdictSaved] = useState(null)
    // Same key the Extractor stores — one key, entered or changed from either page.
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('valyze_api_key') || '')
    const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem('valyze_api_key'))

    const clockRef = useRef(null)
    const abortRef = useRef(null)
    const storageKey = `valyze_qa_${reportId}`

    useEffect(() => {
        if (!reportId) return
        saveReportId(reportId)
        loadReport(reportId)
    }, [reportId, saveReportId, loadReport])

    useEffect(() => () => clearInterval(clockRef.current), [])

    // Restore the last QA run for this report so a refresh does not lose it.
    useEffect(() => {
        if (!reportId) return
        try {
            const raw = sessionStorage.getItem(storageKey)
            if (!raw) return
            const parsed = JSON.parse(raw)
            if (!validateQaResult(parsed.qa)) {
                setQa(parsed.qa)
                setApplied(parsed.applied || {})
                setStatus('done')
            }
        } catch { /* a corrupt cache is not worth an error banner */ }
    }, [reportId, storageKey])

    const persist = useCallback((nextQa, nextApplied) => {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify({ qa: nextQa, applied: nextApplied }))
        } catch { /* private mode / quota — the UI still works for this session */ }
    }, [storageKey])

    const companyName = getFieldValue('company_name') || 'Untitled report'

    const findings = useMemo(() => {
        const list = qa?.findings || []
        return [...list].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    }, [qa])

    const counts = useMemo(() => ({
        critical: findings.filter(f => f.severity === 'critical').length,
        major: findings.filter(f => f.severity === 'major').length,
        minor: findings.filter(f => f.severity === 'minor').length,
    }), [findings])

    const applyableCount = findings.filter(
        (f, i) => f.suggested_value !== null && f.suggested_value !== undefined && !applied[keyOf(f, i)]
    ).length

    const cancel = useCallback(() => {
        abortRef.current?.abort()
        clearInterval(clockRef.current)
        setStatus('idle'); setStage(0); setLogMsg(''); setElapsed(0)
    }, [])

    const runCheck = useCallback(async () => {
        if (!report) { setError('Report has not loaded yet.'); setStatus('error'); return }
        if (!apiKey) { setError('Add your Anthropic API key above, then run the review.'); setShowKeyInput(true); setStatus('error'); return }
        if (sessionIsExpired()) { setError('Your Valyze session has expired. Sign in again, then re-run the check.'); setStatus('error'); return }

        setStatus('loading'); setStage(0); setError(''); setElapsed(0); setLogMsg('Reading report…')
        clockRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
        abortRef.current = new AbortController()

        try {
            setStage(1); setLogMsg('Claude is reviewing the report…')

            // Cut-off findings lists, refusals and non-JSON replies are handled — and
            // tested — in lib/claudeTurns.js, shared with the Extractor.
            const send = async (body) => {
                const res = await fetch(PROXY_URL, {
                    method: 'POST',
                    signal: abortRef.current.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': ANTHROPIC_VERSION,
                        ...(localStorage.getItem('valyze_token')
                            ? { Authorization: `Bearer ${localStorage.getItem('valyze_token')}` }
                            : {}),
                    },
                    body: JSON.stringify(body),
                })
                if (!res.ok) throw new Error(await readProxyError(res))
                return res.json()
            }

            let parsed
            try {
                const run = await runToCompletion({
                    send,
                    onProgress: setLogMsg,
                    request: {
                        model: MODEL_QA,
                        max_tokens: MAX_TOKENS_QA,
                        output_config: { effort: EFFORT_QA },
                        system: QA_SYSTEM_PROMPT,
                        messages: [{
                            role: 'user',
                            content: [{
                                type: 'text',
                                text: `Review this Valyze credit report and return the QA JSON.\n\n${JSON.stringify(report, null, 2)}`,
                            }],
                        }],
                    },
                })
                setStage(2); setLogMsg('Parsing findings…')
                parsed = parseJsonResult(run)
            } catch (e) {
                // The shared messages talk about documents; a QA run needs QA advice.
                if (e.code === 'TRUNCATED') {
                    throw new Error(
                        'Claude ran out of output room before it finished the QA JSON.\n\n'
                        + 'The findings list is longer than one response can hold:\n'
                        + '• Re-run the check — it often fits on a second attempt\n'
                        + '• Fix the clearest problems in the Editor first, then re-run: fewer findings means a shorter reply'
                    )
                }
                if (e.code === 'REFUSAL') {
                    throw new Error(e.message.replace('complete this request', 'review this report')
                        .replace('• If it repeats, send the documents in smaller batches',
                            '• If it repeats, review the report by hand and record the verdict manually'))
                }
                throw e
            }
            const invalid = validateQaResult(parsed)
            if (invalid) throw new Error(`QA result rejected — ${invalid}`)
            if (!parsed.checked_at) parsed.checked_at = new Date().toISOString()

            setQa(parsed); setApplied({}); persist(parsed, {})
            setStage(3); setLogMsg('Done!'); setStatus('done'); setTab('findings')

            /* Persist the verdict on the report so the admin delivery page and the
               team KPI page can see it — sessionStorage above is per-browser.
               Needs migration 011; if it has not been applied the API replies
               {saved:false} and we say so rather than implying it is shared. */
            try {
                const list = parsed.findings || []
                const bySeverity = s => list.filter(f => f.severity === s).length
                const saveRes = await deliveryAPI.saveQaVerdict(reportId, {
                    verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
                    finding_count: list.length,
                    critical_count: bySeverity('critical'),
                    major_count: bySeverity('major'),
                    minor_count: bySeverity('minor'),
                    findings: list,
                })
                setVerdictSaved(saveRes?.data?.saved === true)
            } catch { setVerdictSaved(false) }
        } catch (e) {
            if (e.name === 'AbortError') return
            setError(e.message || String(e)); setStatus('error')
        } finally {
            clearInterval(clockRef.current)
        }
    }, [report, persist, reportId, apiKey])

    const applyOne = useCallback(async (finding, index) => {
        const k = keyOf(finding, index)
        if (applied[k]) return
        try {
            await updateField(finding.field, finding.suggested_value)
            const next = { ...applied, [k]: true }
            setApplied(next); persist(qa, next)
        } catch (e) {
            setError(`Could not apply "${finding.field}": ${e.message || e}`)
        }
    }, [applied, updateField, qa, persist])

    const applyAll = useCallback(async () => {
        const pending = findings.map((f, i) => ({ f, i }))
            .filter(({ f, i }) => f.suggested_value !== null && f.suggested_value !== undefined && !applied[keyOf(f, i)])
        if (!pending.length) return
        if (!window.confirm(`Apply ${pending.length} correction${pending.length > 1 ? 's' : ''}? This overwrites those fields in the report.`)) return

        const next = { ...applied }
        for (const { f, i } of pending) {
            try {
                await updateField(f.field, f.suggested_value)
                next[keyOf(f, i)] = true
            } catch (e) {
                setError(`Stopped at "${f.field}": ${e.message || e}`)
                break
            }
        }
        setApplied(next); persist(qa, next)
    }, [findings, applied, updateField, qa, persist])

    const importJson = useCallback(() => {
        try {
            const parsed = JSON.parse(importText)
            const invalid = validateQaResult(parsed)
            if (invalid) { setError(`Import rejected — ${invalid}`); return }
            if (!parsed.checked_at) parsed.checked_at = new Date().toISOString()
            setQa(parsed); setApplied({}); persist(parsed, {})
            setImportText(''); setError(''); setStatus('done'); setTab('findings')
        } catch (e) {
            setError(`Import rejected — could not parse JSON: ${e.message || e}`)
        }
    }, [importText, persist])

    const TABS = ['findings', 'json', 'import']
    const passed = qa?.verdict === 'pass'

    return (
        <div className="min-h-[calc(100vh-96px)] w-full p-4 md:p-6">
            <div className="bg-[var(--color-surface)] dark:bg-white/5 border border-[var(--color-border)] rounded-3xl shadow-sm overflow-hidden max-w-5xl mx-auto">

                {/* Header — same shell as the Extractor */}
                <div className="border-b border-[var(--color-border)] p-5 md:p-6 flex items-center justify-between gap-4 bg-white/70 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-500/20 flex-shrink-0">🛡️</div>
                        <div className="min-w-0">
                            <div className="text-base md:text-lg font-black text-[var(--color-text)] truncate">{companyName}</div>
                            <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">Valyze AI Quality Review · Claude Opus 5</div>
                            {reportId && <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono truncate">Report: {reportId}</div>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {!showKeyInput && status !== 'loading' && (
                            <button
                                onClick={() => setShowKeyInput(true)}
                                className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 transition-all text-xs font-bold"
                            >
                                🔑 Change Key
                            </button>
                        )}
                        <button
                            onClick={() => navigate(`/editor/${reportId}`)}
                            className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50 transition-all text-xs font-bold"
                        >
                            ← Editor
                        </button>
                    </div>
                </div>

                {(showKeyInput || !apiKey) && status !== 'loading' && (
                    <div className="border-b border-[var(--color-border)] p-5 md:p-6 bg-white/60 dark:bg-white/[0.02]">
                        <div className="flex flex-col md:flex-row gap-4 md:items-center">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                                    🔐 Anthropic API Key
                                </div>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-ant-api03-..."
                                    className="input-field font-mono"
                                />
                                <div className="text-[11px] text-[var(--color-text-muted)] mt-2">
                                    Shared with the Extractor — saving here changes it in both.
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 md:w-44">
                                <button
                                    onClick={() => {
                                        if (apiKey.startsWith('sk-ant-')) {
                                            localStorage.setItem('valyze_api_key', apiKey)
                                            setShowKeyInput(false)
                                            setError('')
                                        }
                                    }}
                                    disabled={!apiKey.startsWith('sk-ant-')}
                                    className="px-4 py-3 rounded-xl border border-transparent bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)] hover:bg-emerald-600 transition-all"
                                >
                                    ✓ Save Key
                                </button>
                                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                                   className="text-[11px] text-[var(--color-text-muted)] hover:text-primary text-center">
                                    Get API Key →
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-5 md:p-6">
                    {/* Running */}
                    {status === 'loading' && (
                        <div className="bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-3xl p-8 text-center mb-4">
                            <div className="text-4xl mb-2">🛡️</div>
                            <div className="text-primary text-3xl font-black font-mono mb-2">{fmtTime(elapsed)}</div>
                            <div className="text-sm text-[var(--color-text-secondary)] mb-5 min-h-5">{logMsg}</div>
                            <div className="flex gap-2 justify-center flex-wrap mb-5">
                                {STAGES.map((s, i) => (
                                    <div key={i} className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/70 dark:bg-white/5 text-[var(--color-text-muted)] border border-[var(--color-border)]">
                                        {i < stage ? '✓' : i === stage ? '◐' : '○'} {s}
                                    </div>
                                ))}
                            </div>
                            <button onClick={cancel} className="px-5 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100">✕ Cancel</button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-4 mb-4 text-rose-700 dark:text-rose-300 text-sm whitespace-pre-line">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Run button */}
                    {status !== 'loading' && (
                        <button
                            onClick={runCheck}
                            disabled={!report}
                            className="w-full py-4 rounded-2xl border border-transparent bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-emerald-500/20 transition-all mb-4"
                        >
                            {qa ? '🔄 Re-run Quality Review' : '🛡️ Run Quality Review'}
                        </button>
                    )}

                    {/* Verdict banner */}
                    {qa && status !== 'loading' && (
                        <div className={`rounded-2xl p-5 mb-4 border ${passed
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                            : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'}`}>
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <div className={`text-2xl font-black ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {passed ? '✓ Passed' : '✕ Failed'}
                                    </div>
                                    <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                                        {findings.length} finding{findings.length === 1 ? '' : 's'}
                                        {qa.checked_at ? ` · ${new Date(qa.checked_at).toLocaleString()}` : ''}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    {counts.critical > 0 && <Pill tone="rose" n={counts.critical} label="Critical" />}
                                    {counts.major > 0 && <Pill tone="amber" n={counts.major} label="Major" />}
                                    {counts.minor > 0 && <Pill tone="slate" n={counts.minor} label="Minor" />}
                                    {applyableCount > 0 && (
                                        <button onClick={applyAll}
                                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 transition-all">
                                            Apply all ({applyableCount})
                                        </button>
                                    )}
                                </div>
                            </div>
                            {verdictSaved === false && (
                                <div className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
                                    Saved in this browser only — apply <span className="font-mono">supabase/migrations/011_report_qa_verdict.sql</span> so
                                    the Delivery and Team pages can see this verdict.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs */}
                    {status !== 'loading' && (
                        <div className="flex gap-2 flex-wrap mb-4">
                            {TABS.map(t => (
                                <button key={t} onClick={() => setTab(t)}
                                    className={`px-3 py-2 rounded-xl border border-transparent text-xs font-black uppercase tracking-wide transition-all ${tab === t
                                        ? 'bg-primary text-white'
                                        : 'bg-white/70 dark:bg-white/5 text-[var(--color-text-secondary)] hover:text-primary hover:border-primary/50'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Findings */}
                    {status !== 'loading' && tab === 'findings' && (
                        <>
                            {!qa && (
                                <Empty icon="🛡️" title="No review yet"
                                    body="Run the review to have Claude read this report against its own data." />
                            )}
                            {qa && findings.length === 0 && (
                                <Empty icon="✨" title="No issues found"
                                    body="The reviewer found nothing to flag in this report." />
                            )}
                            <div className="space-y-3">
                                {findings.map((f, i) => {
                                    const k = keyOf(f, i)
                                    const style = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.minor
                                    const canApply = f.suggested_value !== null && f.suggested_value !== undefined
                                    const isApplied = Boolean(applied[k])
                                    return (
                                        <div key={k} className={`bg-white/70 dark:bg-white/5 border border-[var(--color-border)] border-l-4 ${style.edge} rounded-2xl p-4`}>
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span>{style.dot}</span>
                                                    <span className="font-mono text-xs font-bold text-[var(--color-text)] truncate">{f.field}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${style.badge}`}>{f.severity}</span>
                                                </div>
                                                {canApply && (
                                                    <button onClick={() => applyOne(f, i)} disabled={isApplied}
                                                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${isApplied
                                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 cursor-default'
                                                            : 'bg-primary text-white hover:opacity-90'}`}>
                                                        {isApplied ? '✓ Applied' : 'Apply'}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="text-sm text-[var(--color-text)] mt-2">{f.problem}</div>
                                            {f.evidence && <div className="text-xs text-[var(--color-text-secondary)] mt-1">{f.evidence}</div>}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                                <div className="p-2.5 rounded-xl bg-[var(--color-surface)] dark:bg-black/20">
                                                    <div className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Current</div>
                                                    <div className="text-xs text-[var(--color-text)] break-words mt-0.5">
                                                        {String(f.current_value ?? '') || <span className="italic text-[var(--color-text-muted)]">empty</span>}
                                                    </div>
                                                </div>
                                                <div className="p-2.5 rounded-xl bg-emerald-500/10">
                                                    <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Suggested</div>
                                                    <div className="text-xs text-[var(--color-text)] break-words mt-0.5">
                                                        {canApply ? String(f.suggested_value)
                                                            : <span className="italic text-[var(--color-text-muted)]">no correction proposed — fix by hand</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {/* Raw JSON */}
                    {status !== 'loading' && tab === 'json' && (
                        qa ? (
                            <>
                                <pre className="bg-[var(--color-surface)] dark:bg-black/30 border border-[var(--color-border)] rounded-2xl p-4 text-[11px] font-mono text-[var(--color-text)] overflow-auto max-h-[60vh]">
                                    {JSON.stringify(qa, null, 2)}
                                </pre>
                                <button
                                    onClick={() => navigator.clipboard?.writeText(JSON.stringify(qa, null, 2))}
                                    className="mt-2 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/25 transition-all">
                                    Copy JSON
                                </button>
                            </>
                        ) : <Empty icon="{ }" title="Nothing to show" body="Run the review first." />
                    )}

                    {/* Import */}
                    {status !== 'loading' && tab === 'import' && (
                        <div className="space-y-3">
                            <div className="text-xs text-[var(--color-text-secondary)]">
                                Paste a QA result produced elsewhere. It must match the same shape — a malformed
                                file is rejected and changes nothing.
                            </div>
                            <textarea
                                value={importText}
                                onChange={e => setImportText(e.target.value)}
                                rows={12}
                                placeholder='{"verdict":"fail","findings":[...]}'
                                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] dark:bg-black/20 p-3 text-xs font-mono text-[var(--color-text)] resize-y"
                            />
                            <button
                                onClick={importJson}
                                disabled={!importText.trim()}
                                className="px-5 py-2.5 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all">
                                Load findings
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Pill({ tone, n, label }) {
    const tones = {
        rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    }
    return (
        <span className={`px-3 py-1 rounded-lg text-xs font-black ${tones[tone]}`}>
            {n} {label}
        </span>
    )
}

function Empty({ icon, title, body }) {
    return (
        <div className="bg-white/70 dark:bg-white/5 border border-[var(--color-border)] rounded-3xl p-10 text-center">
            <div className="text-3xl mb-3">{icon}</div>
            <div className="text-sm font-black text-[var(--color-text)]">{title}</div>
            <div className="text-xs text-[var(--color-text-secondary)] mt-1">{body}</div>
        </div>
    )
}
