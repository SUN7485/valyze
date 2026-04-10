// ============ P15_IndustryAnalysis.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'

export default function P15_IndustryAnalysis() {
    const { getFieldValue, updateField } = useReport()
    const showSector = getFieldValue('show_sector_overview') !== false

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Industry & Market Analysis
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Market context, sector overview table, and SWOT is managed on the Risk Assessment page.
                </p>
            </div>

            {/* Industry Overview */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Industry Overview
                </h3>
                <div className="grid grid-cols-3 gap-6">
                    <FieldInput
                        label="General Industry"
                        fieldName="industry"
                        type="text"
                        placeholder="e.g. Food & Beverage"
                    />
                    <FieldInput
                        label="Specialized Industry Name"
                        fieldName="industry_name"
                        type="text"
                        placeholder="e.g. Dairy Distribution"
                    />
                    <FieldInput
                        label="Market Size"
                        fieldName="market_size"
                        type="text"
                        placeholder="e.g. SAR 24 Billion"
                    />
                    <FieldInput
                        label="Industry Growth Rate %"
                        fieldName="industry_growth_rate"
                        type="text"
                        placeholder="e.g. 4.5"
                    />
                    <FieldInput
                        label="Company Size Category"
                        fieldName="company_size"
                        type="text"
                        placeholder="e.g. Small, Medium, Large"
                    />
                    <FieldInput
                        label="Annual Revenue"
                        fieldName="annual_revenue"
                        type="text"
                        placeholder="e.g. SAR 50M"
                        helpText="Carried from financial data."
                    />
                </div>
            </div>

            {/* Country & Sector Overview Toggle */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                            Country & Sector Overview Table
                        </h3>
                        <p className="text-xs text-gray-400 dark:text-slate-500 italic mt-1">
                            Renders as a structured table in the PDF below Industry Overview.
                        </p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`relative w-11 h-6 rounded-full transition-all
              ${showSector ? 'bg-[#1a5f7a] dark:bg-blue-600' : 'bg-gray-200 dark:bg-white/10'}`}
                        >
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={showSector}
                                onChange={e => updateField('show_sector_overview', e.target.checked)}
                            />
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow
                transition-transform ${showSector ? 'translate-x-5' : ''}`}
                            />
                        </div>
                        <span className="text-sm font-bold text-gray-600 dark:text-slate-400">Include in report</span>
                    </label>
                </div>

                {!showSector ? (
                    <div className="text-center py-10 bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed
                          border-gray-200 dark:border-white/10 text-gray-400 dark:text-slate-500 text-sm">
                        Country & Sector Overview table is <strong>hidden</strong> from the PDF.
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Header fields */}
                        <div className="grid grid-cols-3 gap-6">
                            <FieldInput
                                label="Sector Label"
                                fieldName="sector_country_label"
                                type="text"
                                placeholder="e.g. Food & Dairy (KSA)"
                            />
                            <FieldInput
                                label="Data Year"
                                fieldName="sector_year"
                                type="text"
                                placeholder="e.g. 2024"
                            />
                            <FieldInput
                                label="Forecast Period"
                                fieldName="sector_forecast_period"
                                type="text"
                                placeholder="e.g. 2025–2033"
                            />
                        </div>

                        {/* Table Rows */}
                        <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                            {/* Market Size Row */}
                            <div className="grid grid-cols-[1fr_1fr_2fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Market Size
                                </div>
                                <FieldInput
                                    label="Value"
                                    fieldName="sector_market_size"
                                    type="text"
                                    placeholder="e.g. SAR 24bn"
                                />
                                <FieldInput
                                    label="Comment"
                                    fieldName="sector_market_size_comment"
                                    type="textarea"
                                    rows={2}
                                />
                            </div>

                            {/* Growth Row */}
                            <div className="grid grid-cols-[1fr_1fr_2fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Forecast Growth
                                </div>
                                <FieldInput
                                    label="Value"
                                    fieldName="sector_growth_forecast"
                                    type="text"
                                    placeholder="e.g. 4–5% CAGR"
                                />
                                <FieldInput
                                    label="Comment"
                                    fieldName="sector_growth_comment"
                                    type="textarea"
                                    rows={2}
                                />
                            </div>

                            {/* Local Production Row */}
                            <div className="grid grid-cols-[1fr_1fr_2fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Local Production Share
                                </div>
                                <FieldInput
                                    label="Value"
                                    fieldName="sector_local_share"
                                    type="text"
                                    placeholder="e.g. ≈70%"
                                />
                                <FieldInput
                                    label="Comment"
                                    fieldName="sector_local_comment"
                                    type="textarea"
                                    rows={2}
                                />
                            </div>

                            {/* Trade Flow Row */}
                            <div className="grid grid-cols-[1fr_1fr_2fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Regional Trade Flow
                                </div>
                                <FieldInput
                                    label="Value"
                                    fieldName="sector_trade_flow"
                                    type="text"
                                    placeholder="e.g. High GCC integration"
                                />
                                <FieldInput
                                    label="Comment"
                                    fieldName="sector_trade_comment"
                                    type="textarea"
                                    rows={2}
                                />
                            </div>

                            {/* Risks Row */}
                            <div className="grid grid-cols-[1fr_3fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Key Risks
                                </div>
                                <FieldInput
                                    label=""
                                    fieldName="sector_risks"
                                    type="textarea"
                                    rows={2}
                                    placeholder="e.g. Raw material costs, FX volatility, import dependency..."
                                />
                            </div>

                            {/* Drivers Row */}
                            <div className="grid grid-cols-[1fr_3fr] gap-4 p-4 border-b border-gray-100 dark:border-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Key Drivers
                                </div>
                                <FieldInput
                                    label=""
                                    fieldName="sector_drivers"
                                    type="textarea"
                                    rows={2}
                                    placeholder="e.g. Vision 2030, food security focus, health-conscious trends..."
                                />
                            </div>

                            {/* Major Players Row */}
                            <div className="grid grid-cols-[1fr_3fr] gap-4 p-4 bg-gray-50/50 dark:bg-white/5">
                                <div className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest pt-2">
                                    Major Players
                                </div>
                                <FieldInput
                                    label=""
                                    fieldName="sector_major_players"
                                    type="textarea"
                                    rows={2}
                                    placeholder="e.g. Almarai, NADEC, Al Safi Danone..."
                                />
                            </div>
                        </div>

                        {/* Sector Summary */}
                        <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-5 border border-blue-100 dark:border-blue-500/20">
                            <div className="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest mb-3">
                                📌 Sector Summary (shown as info box in PDF)
                            </div>
                            <FieldInput
                                label=""
                                fieldName="sector_summary_text"
                                type="textarea"
                                rows={3}
                                placeholder="e.g. Dairy demand is stable and expanding under Vision 2030 initiatives; competition remains intense but brand reputation protects market share..."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Industry Codes */}
            <div className="bg-[#1a5f7a] rounded-2xl p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 text-white">
                    <svg width="160" height="160" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2
              15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                </div>
                <h3 className="text-xs font-black text-blue-200 uppercase tracking-[0.2em] mb-6">
                    International Classification Codes
                </h3>
                <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white/10 rounded-xl p-5 border border-white/10">
                        <div className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-3">
                            SIC Codes (Global)
                        </div>
                        <FieldInput
                            label=""
                            fieldName="sic_codes"
                            type="text"
                            placeholder="e.g. 5411"
                        />
                    </div>
                    <div className="bg-white/10 rounded-xl p-5 border border-white/10">
                        <div className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-3">
                            NACE Codes (EU/GCC)
                        </div>
                        <FieldInput label="" fieldName="nace_codes" type="text" placeholder="e.g. 46.71" />
                        <FieldInput label="" fieldName="nace_description" type="text" placeholder="Sector description..." />
                    </div>
                    <div className="bg-white/10 rounded-xl p-5 border border-white/10">
                        <div className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-3">
                            HS Codes (Customs)
                        </div>
                        <FieldInput label="" fieldName="hs_codes" type="text" placeholder="e.g. 7308.90" />
                        <FieldInput label="" fieldName="hs_description" type="text" placeholder="Product categories..." />
                    </div>
                </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-500/20">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                    💡 <strong>SWOT Note:</strong> Strengths, Weaknesses, Opportunities, and Threats
                    are managed on the <strong>Risk Assessment page</strong> and render as a 2×2 grid
                    at the bottom of this PDF page.
                </p>
            </div>
        </div>
    )
}