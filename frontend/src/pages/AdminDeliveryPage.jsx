// ============ AdminDeliveryPage.jsx ============
// The last gate before a report reaches a client. Admins see every completed,
// undelivered report with its QA verdict, can read the invoice (computed by
// pricing_engine on the server — never by a model), and send.
//
// Three QA states, deliberately never collapsed into two:
//   Passed / Failed / Not checked. "Not checked" is NOT a pass and blocks sending.
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { deliveryAPI } from '../api/client'
import {
    Send, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2,
    AlertCircle, Lock, Receipt, RefreshCw,
} from 'lucide-react'

const QA_BADGE = {
    Passed: {
        icon: ShieldCheck,
        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    Failed: {
        icon: ShieldAlert,
        cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    },
    'Not checked': {
        icon: ShieldQuestion,
        cls: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    },
}

export default function AdminDeliveryPage() {
    const navigate = useNavigate()

    const [items, setItems] = useState([])
    const [sendEnabled, setSendEnabled] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [forbidden, setForbidden] = useState(false)

    const [sending, setSending] = useState(null)
    const [rowError, setRowError] = useState({})

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        setForbidden(false)
        try {
            const res = await deliveryAPI.getQueue()
            setItems(res.data?.items || [])
            setSendEnabled(Boolean(res.data?.send_enabled))
        } catch (e) {
            if (e?.response?.status === 403) setForbidden(true)
            else setError(e?.response?.data?.detail || e.message || 'Could not load the delivery queue.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const doSend = useCallback(async (item) => {
        if (!item.sendable) return
        if (!window.confirm(
            `Send the report for ${item.company_name || 'this company'} to the client?\n\nThis cannot be undone.`
        )) return

        setSending(item.report_id)
        setRowError(prev => ({ ...prev, [item.report_id]: '' }))
        try {
            await deliveryAPI.send(item.report_id)
            await load()
        } catch (e) {
            setRowError(prev => ({
                ...prev,
                [item.report_id]: e?.response?.data?.detail || e.message || 'Send failed.',
            }))
        } finally {
            setSending(null)
        }
    }, [load])

    if (forbidden) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="p-10 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
                    <Lock size={30} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Admins only</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        This page sends finished reports to clients. Ask an administrator if you need access.
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Delivery</h1>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Completed reports awaiting delivery to the client.
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 text-[9px] font-semibold uppercase tracking-wider rounded-lg
                               text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5
                               border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-white/10
                               transition-all disabled:opacity-50"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
                </button>
            </div>

            {!sendEnabled && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <div>
                        <strong>Sending is switched off.</strong> No email transport has been wired yet.
                        Set <code className="font-mono">DELIVERY_SEND_ENABLED=true</code> once one is configured and tested.
                        Everything else on this page works.
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 break-words">{error}</div>
                    <button onClick={load} className="text-[10px] font-bold uppercase tracking-wider underline">Retry</button>
                </div>
            )}

            {loading && (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Loading the queue…
                </div>
            )}

            {!loading && !error && items.length === 0 && (
                <div className="p-10 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
                    <Send size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Nothing waiting</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Every completed report has already been delivered.
                    </div>
                </div>
            )}

            {!loading && items.map(item => {
                const badge = QA_BADGE[item.qa?.label] || QA_BADGE['Not checked']
                const Icon = badge.icon
                return (
                    <div key={item.report_id} className="rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden">
                        <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                    {item.company_name || 'Untitled report'}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                    {[item.cr_number, item.country, item.analyst, item.client_reference]
                                        .filter(Boolean).join(' · ') || 'No further details'}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${badge.cls}`}>
                                    <Icon size={12} /> {item.qa?.label || 'Not checked'}
                                    {typeof item.qa?.finding_count === 'number' && item.qa.finding_count > 0
                                        ? ` · ${item.qa.finding_count}` : ''}
                                </span>

                                <button
                                    onClick={() => navigate(`/qa/${item.report_id}`)}
                                    className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider rounded-lg
                                               text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5
                                               hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                                >
                                    Open QA
                                </button>

                                <button
                                    onClick={() => navigate(`/admin/delivery/${item.report_id}`)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider rounded-lg
                                               bg-primary text-white hover:opacity-90 transition-all"
                                >
                                    <Receipt size={12} /> Review &amp; Send
                                </button>

                                <button
                                    onClick={() => doSend(item)}
                                    disabled={!item.sendable || !sendEnabled || sending === item.report_id}
                                    title={
                                        !item.sendable
                                            ? `Blocked: QA is "${item.qa?.label || 'Not checked'}". Only a passed report can be sent.`
                                            : !sendEnabled
                                                ? 'Sending is switched off server-side.'
                                                : 'Send this report to the client'
                                    }
                                    className={`flex items-center gap-1.5 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider rounded-lg transition-all
                                        ${item.sendable && sendEnabled
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}
                                >
                                    {sending === item.report_id
                                        ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                                        : <><Send size={12} /> Send</>}
                                </button>
                            </div>
                        </div>

                        {rowError[item.report_id] && (
                            <div className="px-4 pb-3 -mt-1 text-xs text-rose-600 dark:text-rose-400 break-words">
                                {rowError[item.report_id]}
                            </div>
                        )}

                    </div>
                )
            })}
        </div>
    )
}

