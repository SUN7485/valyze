import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { companiesAPI } from '../api/client'
import {
    Boxes, Search, Loader2, FileText, ClipboardList, MapPin,
    Hash, AlertCircle, Building2, Clock, ArrowRight,
} from 'lucide-react'

function fmtDate(v) {
    if (!v) return '—'
    try { return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return String(v).slice(0, 10) }
}

function StatCount({ icon, n, label }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-secondary)]">
            {icon}{n} <span className="font-medium text-[var(--color-text-muted)]">{label}</span>
        </span>
    )
}

function CompanyRow({ company, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-[var(--color-border-soft)] bg-[var(--color-background)] hover:border-primary/40 hover:bg-primary/5'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bold text-sm text-[var(--color-text)] truncate">{company.canonical_name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {company.cr_numbers?.[0] && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-text-muted)]">
                                <Hash size={10} />{company.cr_numbers[0]}
                            </span>
                        )}
                        {company.countries?.[0] && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-text-muted)]">
                                <MapPin size={10} />{company.countries[0]}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                        {company.report_count > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                {company.report_count} report{company.report_count > 1 ? 's' : ''}
                            </span>
                        )}
                        {company.order_count > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                {company.order_count} order{company.order_count > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <span className="text-[9px] font-medium text-[var(--color-text-muted)]">{fmtDate(company.last_seen)}</span>
                </div>
            </div>
        </button>
    )
}

function Dossier({ dossier, loading }) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
                <Loader2 className="animate-spin" size={22} />
            </div>
        )
    }
    if (!dossier) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                <Building2 size={30} className="text-[var(--color-text-muted)] mb-3" />
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Select a company</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">See every report and order we hold for it.</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">{dossier.canonical_name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                    <StatCount icon={<FileText size={13} className="text-emerald-500" />} n={dossier.report_count} label="reports" />
                    <StatCount icon={<ClipboardList size={13} className="text-primary" />} n={dossier.order_count} label="orders" />
                    {dossier.first_seen && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                            <Clock size={12} />since {fmtDate(dossier.first_seen)}
                        </span>
                    )}
                </div>
                {dossier.aliases?.length > 1 && (
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
                        Also seen as: {dossier.aliases.slice(1).join(' · ')}
                    </p>
                )}
            </div>

            {dossier.reports?.length > 0 && (
                <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Reports</h3>
                    <div className="space-y-2">
                        {dossier.reports.map((r) => (
                            <Link
                                key={r.id}
                                to={`/editor/${r.id}`}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-background)] hover:border-primary/40 hover:bg-primary/5 transition-all group"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[var(--color-text)] truncate">{r.company_name || 'Untitled report'}</p>
                                    <p className="text-[10px] text-[var(--color-text-muted)]">{r.status || 'unknown'} · {fmtDate(r.updated_at)}</p>
                                </div>
                                <ArrowRight size={14} className="text-[var(--color-text-muted)] group-hover:text-primary shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {dossier.orders?.length > 0 && (
                <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Orders</h3>
                    <div className="space-y-2">
                        {dossier.orders.map((o) => (
                            <div
                                key={o.id}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-background)]"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[var(--color-text)] truncate">{o.company_name || 'Company'}</p>
                                    <p className="text-[10px] text-[var(--color-text-muted)]">{o.status || 'pending'} · {fmtDate(o.updated_at)}</p>
                                </div>
                                {o.country && <span className="text-[10px] font-medium text-[var(--color-text-muted)] shrink-0">{o.country}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function CompaniesPage() {
    const [query, setQuery] = useState('')
    const [companies, setCompanies] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedKey, setSelectedKey] = useState(null)
    const [dossier, setDossier] = useState(null)
    const [dossierLoading, setDossierLoading] = useState(false)

    const runSearch = useCallback(async (q) => {
        setLoading(true)
        setError('')
        try {
            const res = await companiesAPI.search(q)
            setCompanies(res.data?.companies || [])
        } catch (e) {
            setError(e.message || 'Failed to load companies')
            setCompanies([])
        } finally {
            setLoading(false)
        }
    }, [])

    // Initial load + debounced search on typing.
    useEffect(() => {
        const t = setTimeout(() => runSearch(query.trim()), query ? 300 : 0)
        return () => clearTimeout(t)
    }, [query, runSearch])

    const openCompany = async (company) => {
        setSelectedKey(company.key)
        setDossierLoading(true)
        setDossier(null)
        try {
            const res = await companiesAPI.lookup({
                company_name: company.canonical_name,
                cr_number: company.cr_numbers?.[0],
                country: company.countries?.[0],
            })
            setDossier(res.data)
        } catch (e) {
            setDossier(null)
            setError(e.message || 'Failed to load company')
        } finally {
            setDossierLoading(false)
        }
    }

    return (
        <div className="py-8 px-6 max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-3 mb-1">
                <Boxes className="text-primary" size={24} />
                <h1 className="text-2xl font-bold text-[var(--color-text)]">Company Intelligence</h1>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                Every company you've ever reported on or taken an order for — de-duplicated across name variants.
            </p>

            <div className="relative mb-5 max-w-xl">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by company name or CR number…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-text)] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
            </div>

            {error && (
                <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400 text-sm">
                    <AlertCircle size={16} /> {error}
                    <button onClick={() => runSearch(query.trim())} className="ml-auto text-xs font-bold underline">Retry</button>
                </div>
            )}

            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6">
                {/* Company list */}
                <div className="space-y-2.5">
                    {loading ? (
                        <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
                            <Loader2 className="animate-spin" size={22} />
                        </div>
                    ) : companies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-6 rounded-2xl border border-dashed border-[var(--color-border)]">
                            <Boxes size={30} className="text-[var(--color-text-muted)] mb-3" />
                            <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                                {query ? 'No companies match your search' : 'No companies yet'}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {query ? 'Try a different name or CR number.' : 'They appear here as reports and orders are created.'}
                            </p>
                        </div>
                    ) : (
                        companies.map((c) => (
                            <CompanyRow key={c.key} company={c} active={c.key === selectedKey} onClick={() => openCompany(c)} />
                        ))
                    )}
                </div>

                {/* Dossier panel */}
                <div className="card-solid p-6 rounded-2xl lg:sticky lg:top-24 self-start min-h-[16rem]">
                    <Dossier dossier={dossier} loading={dossierLoading} />
                </div>
            </div>
        </div>
    )
}
