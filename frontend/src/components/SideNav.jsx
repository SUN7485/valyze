import React from 'react'
import { useReport } from '../context/ReportContext'
import { CheckCircle, Circle, AlertCircle, Trash2, LayoutDashboard, FileText, Settings, Database, ShieldCheck, Activity, Search, Bell, Paperclip, User, Globe, Newspaper, Scale, AlertTriangle, Landmark, PiggyBank, Briefcase, Users, Building, ClipboardCheck } from 'lucide-react'

const PAGES = [
    { id: 1, label: "Cover Page", icon: <FileText size={18} /> },
    { id: 2, label: "Order Summary", icon: <ClipboardCheck size={18} /> },
    { id: 3, label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { id: 4, label: "Executive Summary", icon: <Activity size={18} /> },
    { id: 5, label: "Company Profile", icon: <Building size={18} /> },
    { id: 6, label: "Ownership", icon: <Users size={18} /> },
    { id: 7, label: "Related Concerns", icon: <Globe size={18} /> },
    { id: 8, label: "Operations", icon: <Briefcase size={18} /> },
    { id: 9, label: "Banking", icon: <Landmark size={18} /> },
    { id: 10, label: "Financial Highlights", icon: <PiggyBank size={18} /> },
    { id: 11, label: "Financial Ratios", icon: <Search size={18} /> },
    { id: 12, label: "Risk & Alerts", icon: <AlertTriangle size={18} /> },
    { id: 13, label: "Legal Status", icon: <Scale size={18} /> },
    { id: 14, label: "News", icon: <Newspaper size={18} /> },
    { id: 15, label: "Industry Analysis", icon: <Database size={18} /> },
    { id: 16, label: "Credit Rec.", icon: <ShieldCheck size={18} /> },
    { id: 17, label: "Monitoring", icon: <Bell size={18} /> },
    { id: 18, label: "Appendices", icon: <Paperclip size={18} /> },
    { id: 19, label: "Back Cover", icon: <FileText size={18} /> },
]

const PAGE_FIELDS = {
    1: ['company_name', 'report_date', 'credit_rating', 'client_name'],
    2: ['client_name', 'client_reference', 'analyst_name', 'company_name'],
    3: ['credit_rating', 'risk_level', 'health_score', 'recommended_credit_limit', 'maximum_exposure', 'company_size', 'annual_revenue', 'payment_risk', 'paydex_score'],
    4: ['executive_summary_text', 'company_history_text', 'employee_count', 'employee_location', 'capital', 'annual_turnover', 'risk_mitigations'],
    5: ['company_name', 'cr_number', 'unified_number', 'company_type', 'company_status', 'phone', 'email', 'country', 'phone_numbers'],
    6: ['capital'],
    7: ['parent_company'],
    8: ['industry', 'employee_count', 'employee_location', 'facilities_count', 'main_facility_location', 'markets_count', 'markets_regions', 'main_suppliers', 'key_customers'],
    9: ['primary_bank'],
    10: ['revenue_1', 'cogs_1', 'total_assets_1', 'equity_1'],
    11: [],
    12: ['viability_meaning', 'delinquency_meaning'],
    13: ['license_status', 'tax_status', 'lawsuit_count'],
    14: [],
    15: ['industry', 'industry_name'],
    16: ['credit_opinion_text', 'recommended_payment_terms'],
    17: ['review_frequency', 'next_review_date'],
    18: [],
    19: [],
}

// Fields that make a page "required" - cannot be deleted if these have values
const CRITICAL_FIELDS = {
    1: ['company_name'],
    2: ['client_name', 'company_name'],
    3: [],
    4: [],
    5: ['company_name', 'cr_number'],
    6: [],
    7: [],
    8: [],
    9: [],
    10: [],
    11: [],
    12: [],
    13: [],
    14: [],
    15: [],
    16: [],
    17: [],
    18: [],
    19: [],
}

export default function SideNav({ currentPage, onPageChange, report, onDeletePage }) {
    const { getCompletionPercentage } = useReport()
    const completion = getCompletionPercentage()
    const getPageStatus = (id) => {
        const fields = PAGE_FIELDS[id] || []
        if (fields.length === 0) return 'done' // Calculated/Decorative pages

        const fieldData = report?.fields || {}
        let filledCount = 0
        let missingRequired = false

        fields.forEach(f => {
            const data = fieldData[f]
            if (data && data.value && String(data.value).trim() !== '') {
                filledCount++
            } else if (['company_name', 'client_name', 'analyst_name'].includes(f)) {
                missingRequired = true
            }
        })

        if (missingRequired && filledCount < fields.length) return 'error'
        if (filledCount === fields.length) return 'done'
        if (filledCount > 0) return 'partial'
        return 'none'
    }

    // Check if page can be deleted (has no critical data)
    const canDeletePage = (id) => {
        const critical = CRITICAL_FIELDS[id] || []
        const fieldData = report?.fields || {}
        
        // Can delete if no critical fields have values
        for (const f of critical) {
            const data = fieldData[f]
            if (data && data.value && String(data.value).trim() !== '') {
                return false
            }
        }
        return true
    }


    return (
        <div className="w-72 bg-slate-50 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800 h-[calc(100vh-68px)] overflow-y-auto sticky top-[68px] z-30 flex flex-col shadow-lg">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <h3 className="text-[9px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Intelligence Modules
                </h3>
            </div>
            
            <nav className="p-2.5 space-y-1 flex-1 scrollbar-hide">
                {PAGES.map((page) => {
                    const active = currentPage === page.id
                    const status = getPageStatus(page.id)

                    return (
                        <div key={page.id} className="group relative">
                            <button
                                onClick={() => onPageChange(page.id)}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200
                                    ${active
                                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`transition-transform duration-300 ${active ? 'scale-105' : 'group-hover:scale-110'}`}>
                                        {page.icon}
                                    </span>
                                    <span className="uppercase tracking-wide leading-none text-[10px]">{page.label}</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {status === 'done' && <CheckCircle size={13} className={active ? 'text-white' : 'text-emerald-500'} />}
                                    {status === 'partial' && <Circle size={13} className={active ? 'text-white/50' : 'text-amber-500 opacity-50'} />}
                                    {status === 'error' && <AlertCircle size={13} className={active ? 'text-white' : 'text-rose-500'} />}
                                    
                                    {status === 'none' && canDeletePage(page.id) && onDeletePage && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (window.confirm(`Delete module "${page.label}"?`)) {
                                                    onDeletePage(page.id)
                                                }
                                            }}
                                            className="p-1 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded text-slate-400 dark:text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete empty module"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </div>
                            </button>
                        </div>
                    )
                })}
            </nav>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-3">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                    <span className="text-slate-500 dark:text-slate-500">Analysis Progress</span>
                    <span className="text-primary">{completion}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden shadow-inner">
                    <div
                        className="bg-primary h-full rounded-full shadow-md shadow-primary/20 transition-all duration-1000 ease-out"
                        style={{ width: `${completion}%` }}
                    />
                </div>
                <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600 italic">
                    <Activity size={9} className="animate-pulse" />
                    {completion === 100 ? 'Analysis Validated' : 'Heuristic Review Active'}
                </div>
            </div>
        </div>
    )
}