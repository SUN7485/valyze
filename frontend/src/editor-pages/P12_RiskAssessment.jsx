// ============ P12_RiskAssessment.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import ArrayEditor from '../components/ArrayEditor'
import {
    ShieldCheck, ShieldAlert, TrendingDown,
    Target, Zap, Info
} from 'lucide-react'

const COLOR_PRESETS = [
    { label: '🟢 Good', value: '#27ae60' },
    { label: '🟠 Warning', value: '#e67e22' },
    { label: '🔴 Critical', value: '#c0392b' },
]

function ScoreDeepDive({ label, scoreField, levelField, colorField,
    badgeField, probField, meaningField, icon: Icon }) {
    const { getFieldValue, updateField } = useReport()
    const score = getFieldValue(scoreField) || '0'
    const color = getFieldValue(colorField) || '#e67e22'
    const level = getFieldValue(levelField) || '--'

    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl text-white" style={{ background: color }}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{label}</div>
                        <div className="text-2xl font-black text-gray-800 dark:text-white">{score}</div>
                    </div>
                </div>
                <div className="flex gap-1">
                    {COLOR_PRESETS.map(p => (
                        <button
                            key={p.value}
                            title={p.label}
                            onClick={() => updateField(colorField, p.value)}
                            className={`w-4 h-4 rounded-full border-2 transition-all
                ${color === p.value ? 'border-gray-500 dark:border-slate-400 scale-125' : 'border-transparent'}`}
                            style={{ background: p.value }}
                        />
                    ))}
                </div>
            </div>

            {/* Score bar */}
            <div className="w-full bg-gray-100 dark:bg-white/10 h-2 rounded-full mb-4 overflow-hidden">
                <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(score, 100)}%`, background: color }}
                />
            </div>

            <div className="space-y-3">
                <FieldInput label="Score (0–100)" fieldName={scoreField} type="text" placeholder="0–100" />
                <FieldInput label="Risk Level" fieldName={levelField} type="text" placeholder="e.g. Low, High" />
                <FieldInput label="Badge Class" fieldName={badgeField} type="select"
                    options={[
                        { value: 'low', label: '🟢 Green (low)' },
                        { value: 'medium', label: '🟠 Orange (medium)' },
                        { value: 'high', label: '🔴 Red (high)' },
                    ]}
                />
                <FieldInput label="Probability %" fieldName={probField} type="text" placeholder="e.g. 12" />
                <FieldInput label="Interpretation" fieldName={meaningField} type="textarea" rows={3} />
            </div>
        </div>
    )
}

function SWOTPanel({ title, arrayName, colorClass, borderClass, headerClass, icon: Icon }) {
    const { getArray, updateArray } = useReport()
    const items = getArray(arrayName)

    const handleAdd = () => updateArray(arrayName, [...items, ''])
    const handleChange = (i, val) => {
        const next = [...items]; next[i] = val; updateArray(arrayName, next)
    }
    const handleDelete = (i) => {
        updateArray(arrayName, items.filter((_, idx) => idx !== i))
    }

    return (
        <div className={`rounded-2xl border-2 overflow-hidden ${borderClass} dark:border-opacity-30`}>
            <div className={`px-5 py-3 flex items-center gap-2 ${headerClass} dark:bg-opacity-20`}>
                <Icon size={16} />
                <span className="text-sm font-black uppercase tracking-widest">{title}</span>
                <span className="ml-auto text-xs font-bold opacity-60">{items.length} items</span>
            </div>
            <div className={`p-4 space-y-2 min-h-[120px] ${colorClass} dark:bg-opacity-5`}>
                {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={typeof item === 'string' ? item : item?.text || ''}
                            onChange={e => handleChange(i, e.target.value)}
                            placeholder="Add point..."
                            className="flex-1 text-xs font-medium bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10
                         rounded-lg px-3 py-2 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/20"
                        />
                        <button
                            onClick={() => handleDelete(i)}
                            className="text-red-400 hover:text-red-600 font-black text-lg leading-none
                         transition-colors w-6 shrink-0"
                            title="Remove"
                        >
                            ✕
                        </button>
                    </div>
                ))}
                <button
                    onClick={handleAdd}
                    className="w-full text-xs font-black uppercase tracking-widest py-2 rounded-lg
                     border border-dashed border-current opacity-50 hover:opacity-80 transition-opacity"
                >
                    ＋ Add
                </button>
            </div>
        </div>
    )
}

export default function P12_RiskAssessment() {
    const { getFieldValue } = useReport()

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Risk Assessment</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Predictive scores, payment behavior, and strategic SWOT analysis.
                </p>
            </div>

            {/* Predictive Scores */}
            <div className="grid grid-cols-2 gap-6">
                <ScoreDeepDive
                    label="Viability Score"
                    scoreField="viability_score"
                    levelField="viability_level"
                    colorField="viability_color"
                    badgeField="viability_badge"
                    probField="viability_probability"
                    meaningField="viability_meaning"
                    icon={ShieldCheck}
                />
                <ScoreDeepDive
                    label="Delinquency Risk"
                    scoreField="delinquency_score"
                    levelField="delinquency_level"
                    colorField="delinquency_color"
                    badgeField="delinquency_badge"
                    probField="delinquency_probability"
                    meaningField="delinquency_meaning"
                    icon={TrendingDown}
                />
            </div>

            {/* Payment Behavior */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Payment Behavior Analysis
                </h3>
                <div className="grid grid-cols-3 gap-6 mb-6">
                    <FieldInput label="Avg Days Beyond Terms" fieldName="avg_dbt" type="text" placeholder="e.g. 15" />
                    <FieldInput label="% Paid on Time" fieldName="pct_on_time" type="text" placeholder="e.g. 78" />
                    <FieldInput label="Highest Past Due Amount" fieldName="highest_past_due" type="text" placeholder="e.g. SAR 50,000" />
                </div>

                <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                    Payment Speed Breakdown
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Prompt (within terms)', pctField: 'prompt_pct', amtField: 'prompt_amount' },
                        { label: '1–30 days slow', pctField: 'slow_30_pct', amtField: 'slow_30_amount' },
                        { label: '31–60 days slow', pctField: 'slow_60_pct', amtField: 'slow_60_amount' },
                        { label: '90+ days slow', pctField: 'slow_90plus_pct', amtField: 'slow_90plus_amount' },
                    ].map(row => (
                        <div key={row.label}
                            className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-white/10 flex items-center gap-3">
                            <div className="text-xs font-bold text-gray-600 dark:text-slate-400 min-w-0 shrink-0 leading-tight">{row.label}</div>
                            <div className="flex-1 min-w-0">
                                <FieldInput compact label="%" fieldName={row.pctField} type="text" placeholder="0" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <FieldInput compact label="Amount" fieldName={row.amtField} type="text" placeholder="SAR 0" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SWOT */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    SWOT Analysis
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    These arrays feed the 2×2 SWOT grid in the PDF (Industry & Market page).
                    Each item is a bullet point.
                </p>
                <div className="grid grid-cols-2 gap-6">
                    <SWOTPanel
                        title="Strengths"
                        arrayName="strengths"
                        colorClass="bg-green-50/30"
                        borderClass="border-green-200"
                        headerClass="bg-green-50 text-green-800"
                        icon={ShieldCheck}
                    />
                    <SWOTPanel
                        title="Weaknesses"
                        arrayName="weaknesses"
                        colorClass="bg-red-50/30"
                        borderClass="border-red-200"
                        headerClass="bg-red-50 text-red-800"
                        icon={ShieldAlert}
                    />
                    <SWOTPanel
                        title="Opportunities"
                        arrayName="opportunities"
                        colorClass="bg-blue-50/30"
                        borderClass="border-blue-200"
                        headerClass="bg-blue-50 text-blue-800"
                        icon={Target}
                    />
                    <SWOTPanel
                        title="Threats"
                        arrayName="threats"
                        colorClass="bg-orange-50/30"
                        borderClass="border-orange-200"
                        headerClass="bg-orange-50 text-orange-800"
                        icon={Zap}
                    />
                </div>
            </div>
        </div>
    )
}