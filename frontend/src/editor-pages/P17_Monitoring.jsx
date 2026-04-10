// ============ P17_Monitoring.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'
import { Bell, Activity } from 'lucide-react'

const COLOR_PRESETS = [
    { label: '🟢 Good', value: '#27ae60' },
    { label: '🟠 Warning', value: '#e67e22' },
    { label: '🔴 Critical', value: '#c0392b' },
]

function EWICard({ label, valueField, colorField, subtextField, subtext }) {
    const { getFieldValue, updateField, updateArray, getArray } = useReport()
    const color = getFieldValue(colorField) || '#e67e22'
    const value = getFieldValue(valueField) || '--'

    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 p-6 shadow-sm">
            <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                {label}
            </div>
            <div className="text-3xl font-black mb-3" style={{ color }}>
                {value}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium mb-4">{subtext}</div>

            {/* Value Input */}
            <FieldInput label="Value" fieldName={valueField} type="text" placeholder="e.g. Moderate" />

            {/* Color Picker */}
            <div className="mt-3">
                <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Color — never use yellow
                </div>
                <div className="flex gap-2">
                    {COLOR_PRESETS.map(p => (
                        <button
                            key={p.value}
                            title={p.label}
                            onClick={() => updateField(colorField, p.value)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]
                font-bold border-2 transition-all
                ${color === p.value
                                    ? 'border-gray-500 dark:border-slate-300 shadow scale-105'
                                    : 'border-transparent bg-gray-100 dark:bg-white/5'}`}
                        >
                            <span className="w-3 h-3 rounded-full" style={{ background: p.value }} />
                            {p.label.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default function P17_Monitoring() {
    const { getFieldValue, getArray, updateArray } = useReport()

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Monitoring & Triggers
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Post-approval surveillance, early warning indicators, and credit review triggers.
                </p>
            </div>

            {/* Monitoring Triggers */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-orange-100 dark:bg-orange-500/10 rounded-lg">
                        <Bell className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Monitoring Triggers
                    </h3>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    Events that should trigger an immediate credit review.
                    Leave empty to show "No monitoring triggers available" in the PDF.
                </p>
                <GenericTableEditor
                    title="Monitoring Triggers"
                    data={getArray('monitoring_triggers')}
                    onSave={(newItems) => updateArray('monitoring_triggers', newItems)}
                    columns={[
                        { key: 'trigger_event', label: 'Trigger Event', type: 'text', required: true, placeholder: 'e.g. Payment delayed > 60 days' },
                        { key: 'trigger_action', label: 'Required Action', type: 'text', placeholder: 'e.g. Immediate credit freeze and review' },
                    ]}
                    emptyMessage="No monitoring triggers defined."
                />
            </div>

            {/* Early Warning Indicators */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
                    Early Warning Indicators
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    These render as colored metric boxes in the PDF.
                    Color must be orange (#e67e22) for warning or red (#c0392b) for critical —
                    never yellow.
                </p>
                <div className="grid grid-cols-3 gap-6">
                    <EWICard
                        label="Payment Delays"
                        valueField="payment_delay_status"
                        colorField="payment_delay_color"
                        subtext="vs. last quarter"
                    />
                    <EWICard
                        label="Credit Utilization %"
                        valueField="credit_utilization"
                        colorField="utilization_color"
                        subtext="of approved limit"
                    />
                    <EWICard
                        label="Financial Trend"
                        valueField="financial_trend"
                        colorField="trend_color"
                        subtext="12-month outlook"
                    />
                </div>
            </div>

            {/* Critical Alerts Thresholds */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Critical Alert Thresholds
                </h3>
                <div className="grid grid-cols-2 gap-6">
                    <FieldInput
                        label="Legal Filing Threshold (High Priority)"
                        fieldName="legal_threshold"
                        type="text"
                        placeholder="e.g. SAR 100,000"
                        helpText="Any legal filing above this amount triggers a high-priority alert in the PDF."
                    />
                    <FieldInput
                        label="Payment Delay Threshold (Medium Priority)"
                        fieldName="payment_delay_threshold"
                        type="text"
                        placeholder="e.g. 30"
                        helpText="Number of days beyond terms before a medium-priority alert fires."
                    />
                </div>
            </div>

            {/* Risk Mitigation Strategies */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
                        <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Risk Mitigation Strategies
                    </h3>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    Strategies to mitigate identified risks and ensure credit recovery.
                    Leave empty to show "No risk mitigation strategies available" in the PDF.
                </p>
                <GenericTableEditor
                    title="Risk Mitigations"
                    data={getArray('risk_mitigations')}
                    onSave={(newItems) => updateArray('risk_mitigations', newItems)}
                    columns={[
                        { key: 'mitigation_title', label: 'Strategy', type: 'text', required: true, placeholder: 'e.g. Implement stricter payment terms' },
                        { key: 'mitigation_detail', label: 'Expected Outcome', type: 'text', placeholder: 'e.g. Reduce delinquency by 20%' },
                    ]}
                    emptyMessage="No risk mitigation strategies defined."
                />
            </div>


        </div>
    )
}