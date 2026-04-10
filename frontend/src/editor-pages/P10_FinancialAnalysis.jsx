// ============ P10_FinancialHighlights.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import { FileText, TrendingUp, TrendingDown, DollarSign, Info } from 'lucide-react'

const INCOME_ROWS = [
    { label: 'Revenue / Sales', base: 'revenue' },
    { label: 'Cost of Goods Sold', base: 'cogs' },
    { label: 'Gross Profit', base: 'gross_profit', highlight: true },
    { label: 'Operating Expenses', base: 'opex' },
    { label: 'EBITDA', base: 'ebitda', highlight: true },
    { label: 'Net Income', base: 'net_income', highlight: true },
]

const BALANCE_ROWS = [
    { label: '── ASSETS ──', header: true },
    { label: 'Cash & Equivalents', base: 'cash' },
    { label: 'Accounts Receivable', base: 'ar' },
    { label: 'Inventory', base: 'inventory' },
    { label: 'Current Assets', base: 'current_assets', highlight: true },
    { label: 'Total Assets', base: 'total_assets', highlight: true },
    { label: '── LIABILITIES & EQUITY ──', header: true },
    { label: 'Current Liabilities', base: 'current_liabilities' },
    { label: 'Long-Term Debt', base: 'ltd' },
    { label: 'Total Liabilities', base: 'total_liabilities', highlight: true },
    { label: "Shareholders' Equity", base: 'equity', highlight: true },
]

const CASH_FLOW_ROWS = [
    { label: '── OPERATING ACTIVITIES ──', header: true },
    { label: 'Net Cash Flow from Operating Activities', base: 'cash_flow_operating', fallbackBase: 'cfo', highlight: true },
    { label: '── INVESTING ACTIVITIES ──', header: true },
    { label: 'Net Cash Flow from Investing Activities', base: 'cash_flow_investing', fallbackBase: 'cfi', highlight: true },
    { label: '── FINANCING ACTIVITIES ──', header: true },
    { label: 'Net Cash Flow from Financing Activities', base: 'cash_flow_financing', fallbackBase: 'cff', highlight: true },
    { label: '── CASH POSITION ──', header: true },
    { label: 'Cash at End of Period', base: 'cash_end', highlight: true },
]

function FinancialTable({ title, rows, icon: Icon, iconBg, iconColor }) {
    const { getFieldValue } = useReport()
    const y1 = getFieldValue('year_1') || 'Year 1'
    const y2 = getFieldValue('year_2') || 'Year 2'
    const y3 = getFieldValue('year_3') || 'Year 3'

    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-lg ${iconBg} dark:bg-opacity-20`}>
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">{title}</h3>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-2 mb-3 px-2">
                <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase">Line Item</div>
                {[y3, y2, y1].map(y => (
                    <div key={y} className="text-[10px] font-black text-center text-gray-400 dark:text-slate-500 uppercase">{y}</div>
                ))}
                <div className="text-[10px] font-black text-center text-gray-400 dark:text-slate-500 uppercase">Trend</div>
            </div>

            <div className="space-y-2">
                {rows.map((row, i) => {
                    if (row.header) return (
                        <div key={i} className="bg-[#e8f4f8] dark:bg-blue-500/10 text-[#1a5f7a] dark:text-blue-400 text-[9px] font-black uppercase
                                    tracking-widest px-3 py-2 rounded-lg mt-4 border border-blue-100/50 dark:border-blue-500/20">
                            {row.label}
                        </div>
                    )
                    return (
                        <div
                            key={i}
                            className={`grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-2 items-center px-2 py-1 rounded-lg
                ${row.highlight ? 'bg-red-50/40 dark:bg-rose-500/10' : ''}`}
                        >
                            <div className={`text-xs font-bold ${row.highlight ? 'text-gray-800 dark:text-rose-200' : 'text-gray-600 dark:text-slate-400'} min-w-0`}>
                                {row.label}
                            </div>
                            {[3, 2, 1].map(n => (
                                <div key={n} className="min-w-0">
                                    <FieldInput
                                        compact
                                        label=""
                                        fieldName={`${row.base}_${n}`}
                                        fallbackFields={row.fallbackBase ? [`${row.fallbackBase}_${n}`] : []}
                                        type="text"
                                        placeholder="0"
                                    />
                                </div>
                            ))}
                            <div className="min-w-0">
                                <FieldInput
                                    compact
                                    label=""
                                    fieldName={`${row.base}_trend`}
                                    fallbackFields={row.fallbackBase ? [`${row.fallbackBase}_trend`] : []}
                                    type="text"
                                    placeholder="e.g. ↑ 12%"
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default function P10_FinancialHighlights() {
    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Financial Highlights</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Income statement and balance sheet for the most recent fiscal years.
                    Ratios are calculated separately on the next page.
                </p>
            </div>

            {/* Financial Statement Status */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-green-100 dark:bg-emerald-500/10 rounded-lg">
                        <DollarSign className="w-5 h-5 text-green-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Financial Statement Status
                    </h3>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                    <FieldInput
                        label="Currency"
                        fieldName="fin_currency"
                        type="text"
                        placeholder="e.g. SAR, EGP, USD"
                    />
                    <FieldInput
                        label="Unit Scale"
                        fieldName="fin_unit_scale"
                        type="text"
                        placeholder="e.g. Ones (SAR), Thousands, Millions"
                    />
                    <FieldInput
                        label="Statement Type"
                        fieldName="fin_statement_type"
                        type="text"
                        placeholder="e.g. Audited – Qualified Opinion"
                    />
                    <FieldInput
                        label="Period End Date"
                        fieldName="fin_period_end"
                        type="text"
                        placeholder="e.g. 31/12/2024"
                    />
                    <FieldInput
                        label="Scope"
                        fieldName="fin_scope"
                        type="text"
                        placeholder="e.g. Individual Establishment – Standalone"
                    />
                    <FieldInput
                        label="Ratio Basis"
                        fieldName="fin_ratio_basis"
                        type="text"
                        placeholder="e.g. 2025 (current) vs 2024 (prior year comparatives)"
                    />
                </div>

                <FieldInput
                    label="Parent / Group Note (Optional)"
                    fieldName="fin_parent_note"
                    type="text"
                    placeholder="e.g. Parent consolidated financials included — majority control confirmed. Influence on score is indirect."
                    helpText="Leave empty to hide this warning from the PDF."
                />

                {/* Client Guidance Reminder */}
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-500/20 flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
                        <strong>Guidance:</strong> Ratios are calculated on full fiscal year data only.
                        Interim figures must be excluded from ratio calculations.
                        If only interim data is available, note this in the Parent/Group Note above.
                    </p>
                </div>
            </div>

            {/* Fiscal Year Labels */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Fiscal Year Labels
                    </h3>
                </div>
                <div className="grid grid-cols-3 gap-6 max-w-xl">
                    <FieldInput label="Most Recent Year" fieldName="year_1" type="text" placeholder="2024" />
                    <FieldInput label="Previous Year" fieldName="year_2" type="text" placeholder="2023" />
                    <FieldInput label="Year Before" fieldName="year_3" type="text" placeholder="2022" />
                </div>
            </div>

            {/* Income Statement */}
            <FinancialTable
                title="Income Statement"
                rows={INCOME_ROWS}
                icon={TrendingUp}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
            />

            {/* Balance Sheet */}
            <FinancialTable
                title="Balance Sheet"
                rows={BALANCE_ROWS}
                icon={TrendingDown}
                iconBg="bg-orange-100"
                iconColor="text-orange-600"
            />

            {/* Cash Flow Statement */}
            <FinancialTable
                title="Cash Flow Statement"
                rows={CASH_FLOW_ROWS}
                icon={DollarSign}
                iconBg="bg-green-100"
                iconColor="text-green-600"
            />
        </div>
    )
}