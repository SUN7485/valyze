// ============ P16_CreditRecommendation.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'
import { RotateCcw, ShieldCheck, CheckCircle, TrendingUp } from 'lucide-react'
import { reportAPI } from '../api/client'

const COLOR_PRESETS = [
    { label: '🟢 Good', value: '#27ae60' },
    { label: '🟠 Warning', value: '#e67e22' },
    { label: '🔴 Critical', value: '#c0392b' },
    { label: '🔵 Neutral', value: '#1a5f7a' },
]

export default function P16_CreditRecommendation() {
    const { reportId, getFieldValue, updateField, updateArray, getArray, loadReport } = useReport()

    const ratingColor = getFieldValue('rating_color') || '#1a5f7a'
    const finalRiskColor = getFieldValue('final_risk_color') || '#e67e22'
    const creditRating = getFieldValue('final_credit_rating') || 'N/A'
    const finalRiskLevel = getFieldValue('final_risk_level') || '--'

    const handleRegenerate = async (section) => {
        try {
            if (!window.confirm(`Regenerate "${section.replace(/_/g, ' ')}"? Current edits will be lost.`)) return
            await reportAPI.regenerateSection(reportId, [section])
            await loadReport(reportId)
        } catch (err) {
            console.error('Regenerate failed:', err)
            alert('Failed to regenerate. Check backend connection.')
        }
    }

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Credit Recommendation
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Final credit decision, recommended limits, payment terms, and risk mitigations.
                </p>
            </div>

            {/* Final Decision Hero */}
            <div className="bg-[#1a5f7a] dark:bg-blue-600/90 rounded-2xl p-10 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-900/20 dark:bg-black/20 pointer-events-none" />
                <div className="relative z-10 flex items-start justify-between gap-8">
                    {/* Left: Rating */}
                    <div className="space-y-4">
                        <div className="text-xs font-black uppercase tracking-[0.3em] opacity-60">
                            Final Credit Rating
                        </div>
                        <div className="text-8xl font-black drop-shadow" style={{ color: '#fff' }}>
                            {creditRating}
                        </div>
                        <div
                            className="inline-flex items-center gap-2 px-5 py-2 bg-white/10 rounded-full
                          border border-white/20 backdrop-blur-sm"
                        >
                            <ShieldCheck size={16} className="text-green-300" />
                            <span className="text-xs font-black uppercase tracking-widest"
                                style={{
                                    color: finalRiskColor === '#27ae60' ? '#6ee7b7' :
                                        finalRiskColor === '#c0392b' ? '#fca5a5' : '#fcd34d'
                                }}>
                                {finalRiskLevel} RISK
                            </span>
                        </div>
                    </div>

                    {/* Right: Limits */}
                    <div className="grid grid-cols-2 gap-4 flex-1 max-w-md">
                        <div className="bg-white/10 rounded-xl p-4 text-center border border-white/10">
                            <div className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">
                                Rec. Credit Limit (USD)
                            </div>
                            <div className="text-xl font-black">
                                {getFieldValue('recommended_credit_limit') || '--'}
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center border border-white/10">
                            <div className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">
                                Max Exposure (USD)
                            </div>
                            <div className="text-xl font-black text-white">
                                {getFieldValue('maximum_exposure') || '--'}
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center border border-white/10">
                            <div className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">
                                Payment Terms
                            </div>
                            <div className="text-sm font-black">
                                {getFieldValue('recommended_payment_terms') || '--'}
                            </div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center border border-white/10">
                            <div className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">
                                Review Frequency
                            </div>
                            <div className="text-sm font-black">
                                {getFieldValue('review_frequency') || '--'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Final Rating Fields */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Final Assessment Fields
                </h3>
                <div className="grid grid-cols-3 gap-6 mb-6">
                    <FieldInput
                        label="Final Credit Rating"
                        fieldName="final_credit_rating"
                        type="text"
                        placeholder="e.g. BB+"
                    />
                    <FieldInput
                        label="Final Risk Level"
                        fieldName="final_risk_level"
                        type="text"
                        placeholder="e.g. MEDIUM"
                    />
                    <div>
                        <div className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-widest">
                            Risk Color
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {COLOR_PRESETS.map(p => (
                                <button
                                    key={p.value}
                                    title={p.label}
                                    onClick={() => updateField('final_risk_color', p.value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                    border-2 transition-all
                    ${finalRiskColor === p.value
                                            ? 'border-gray-500 dark:border-slate-300 shadow-md scale-105'
                                            : 'border-transparent bg-gray-100 dark:bg-white/5'}`}
                                >
                                    <span
                                        className="w-3 h-3 rounded-full"
                                        style={{ background: p.value }}
                                    />
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <FieldInput
                        label="Recommended Credit Limit (USD)"
                        fieldName="recommended_credit_limit"
                        type="text"
                        placeholder="e.g. USD 2,000,000"
                    />
                    <FieldInput
                        label="Maximum Exposure (USD)"
                        fieldName="maximum_exposure"
                        type="text"
                        placeholder="e.g. USD 3,000,000"
                    />
                    <FieldInput
                        label="Recommended Payment Terms"
                        fieldName="recommended_payment_terms"
                        type="text"
                        placeholder="e.g. Net 30, 50% advance"
                    />
                    <FieldInput
                        label="Review Frequency"
                        fieldName="review_frequency"
                        type="select"
                        options={[
                            { value: 'Quarterly', label: 'Quarterly (High Risk)' },
                            { value: 'Semi-Annual', label: 'Semi-Annual' },
                            { value: 'Annual', label: 'Annual (Stable)' },
                            { value: 'On-Demand', label: 'On-Demand Only' },
                        ]}
                    />
                </div>
            </div>

            {/* Credit Opinion */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8 relative group">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Credit Opinion
                    </h3>
                    <button
                        onClick={() => handleRegenerate('credit_opinion')}
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400
                       hover:text-blue-800 dark:hover:text-blue-300 transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <RotateCcw size={12} /> REGENERATE WITH AI
                    </button>
                </div>
                <FieldInput
                    label=""
                    fieldName="credit_opinion_text"
                    type="textarea"
                    rows={8}
                    placeholder="Final analyst assessment summarising strengths, key risks, and rationale for the assigned rating..."
                    helpText="Appears as an italic block inside the recommendation box in the PDF."
                />
            </div>

            {/* Risk Mitigations */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
                    Risk Mitigation Strategies
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    Each entry renders as an info alert with a shield icon in the PDF.
                    Leave empty to hide this block.
                </p>
                <GenericTableEditor
                    title="Risk Mitigations"
                    data={getArray('risk_mitigations')}
                    onSave={(newItems) => updateArray('risk_mitigations', newItems)}
                    columns={[
                        { key: 'mitigation_title', label: 'Strategy', type: 'text', required: true, placeholder: 'e.g. Collateral Requirement' },
                        { key: 'mitigation_detail', label: 'Detail', type: 'text', placeholder: 'e.g. Require personal guarantee for orders above SAR 500K' },
                    ]}
                    emptyMessage="No risk mitigations defined."
                />
            </div>
        </div>
    )
}
