// ============ P11_FinancialRatios.jsx ============
import React, { useState } from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import RatioStatusBadge from '../components/RatioStatusBadge'
import { Info, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_OPTIONS = [
    { value: 'success', label: '🟢 Good' },
    { value: 'warning', label: '🟠 Moderate' },
    { value: 'danger', label: '🔴 Concern' },
]

const RATIO_GROUPS = [
    {
        id: 'liquidity',
        title: '💧 Liquidity Ratios',
        ratios: [
            { label: 'Current Ratio', base: 'current_ratio', unit: '' },
            { label: 'Quick Ratio', base: 'quick_ratio', unit: '' },
            { label: 'Cash Ratio', base: 'cash_ratio', unit: '' },
        ],
    },
    {
        id: 'profitability',
        title: '📈 Profitability Ratios',
        ratios: [
            { label: 'Gross Margin', base: 'gross_margin', unit: '%' },
            { label: 'EBITDA Margin', base: 'ebitda_margin', unit: '%' },
            { label: 'Net Margin', base: 'net_margin', unit: '%' },
            { label: 'ROA', base: 'roa', unit: '%' },
            { label: 'ROE', base: 'roe', unit: '%' },
        ],
    },
    {
        id: 'leverage',
        title: '🏦 Leverage & Solvency',
        ratios: [
            { label: 'Debt / Equity', base: 'debt_equity', unit: '' },
            { label: 'Debt / Assets', base: 'debt_assets', unit: '' },
            { label: 'Equity Ratio', base: 'equity_ratio', unit: '%' },
            { label: 'Interest Coverage', base: 'interest_coverage', unit: 'x' },
        ],
    },
    {
        id: 'efficiency',
        title: '⚙️ Efficiency Ratios',
        ratios: [
            { label: 'Asset Turnover', base: 'asset_turnover', unit: 'x' },
            { label: 'Inventory Days (DIO)', base: 'dio', unit: 'days' },
            { label: 'Receivables Days (DSO)', base: 'dso', unit: 'days' },
            { label: 'Payables Days (DPO)', base: 'dpo', unit: 'days' },
            { label: 'Cash Conversion Cycle', base: 'ccc', unit: 'days' },
        ],
    },
]

function RatioGroup({ group }) {
    const { getFieldValue } = useReport()
    const y1 = getFieldValue('year_1') || 'Latest'
    const y2 = getFieldValue('year_2') || 'Previous'
    const [open, setOpen] = useState(true)

    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-8 py-5
                   hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
                <h3 className="text-sm font-black text-gray-700 dark:text-slate-300 tracking-wide">{group.title}</h3>
                {open
                    ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-slate-500" />}
            </button>

            {open && (
                <div className="px-8 pb-8">
                    {/* Column Headers */}
                    <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_1fr_2fr] gap-3 mb-3 px-2">
                        {['Ratio', y1, y2, 'Ind. Avg', 'Status', 'Interpretation'].map(h => (
                            <div key={h} className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                                {h}
                            </div>
                        ))}
                    </div>

                    {/* Ratio Rows */}
                    {group.ratios.map(ratio => (
                        <div key={ratio.base} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_1fr_2fr] gap-3 items-center px-2 py-3 border-t border-gray-50 dark:border-white/5">
                            <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{ratio.label}</span>
                            <FieldInput fieldName={ratio.base} type="text" placeholder="—" />
                            <FieldInput fieldName={`${ratio.base}_prev`} type="text" placeholder="—" />
                            <FieldInput fieldName={`${ratio.base}_industry`} type="text" placeholder="—" />
                            <FieldInput fieldName={`${ratio.base}_status`} type="select" options={STATUS_OPTIONS} />
                            <FieldInput fieldName={`${ratio.base}_interpretation`} type="text" placeholder="Notes..." />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function P11_FinancialRatios() {
    const { getFieldValue } = useReport()

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Financial Ratios</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Liquidity, profitability, leverage, and efficiency benchmarks.
                    All ratios based on full fiscal year data only.
                </p>
            </div>

            {/* Guidance Banner */}
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-500/20 flex items-start gap-4">
                <div className="p-2 bg-blue-600 dark:bg-blue-600/80 rounded-lg text-white shrink-0">
                    <Info size={18} />
                </div>
                <div>
                    <h4 className="text-xs font-black text-blue-900 dark:text-blue-300 uppercase tracking-widest mb-1">
                        Ratio Calculation Policy
                    </h4>
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                        Ratios must be calculated on <strong>full fiscal year data only</strong>.
                        Interim figures are excluded. Basis: <strong>{getFieldValue('fin_ratio_basis') || 'set on Financial Highlights page'}</strong>.
                        The label column in the PDF uses the Status field below.
                    </p>
                </div>
            </div>

            {/* Ratio Groups */}
            {RATIO_GROUPS.map(g => <RatioGroup key={g.id} group={g} />)}

            {/* Label fields — needed for PDF badges */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Badge Label Text (shown in PDF)
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-4">
                    The Status field above sets the badge color. These fields set the badge text.
                </p>
                <div className="grid grid-cols-4 gap-4">
                    {[
                        'current_ratio', 'quick_ratio', 'cash_ratio',
                        'gross_margin', 'ebitda_margin', 'net_margin', 'roa', 'roe',
                        'debt_equity', 'debt_assets', 'equity_ratio', 'interest_coverage',
                        'asset_turnover', 'dio', 'dso', 'dpo', 'ccc',
                    ].map(base => (
                        <FieldInput
                            key={base}
                            label={base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            fieldName={`${base}_label`}
                            type="text"
                            placeholder="e.g. Good / Low / High"
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}