// ============ P03_ExecutiveSummary.jsx ============
import React, { useEffect } from 'react'
import { RotateCcw, AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'
import { reportAPI } from '../api/client'

// Color mapping helper functions
function getRatingColorFromValue(rating) {
  if (!rating) return '#1a5f7a'
  const r = rating.toUpperCase()
  // AAA, AA+, AA, A+, A, A- = Green (Good)
  if (r.includes('AAA') || r.includes('AA') || r === 'A+' || r === 'A' || r === 'A-') {
    return '#27ae60' // green
  }
  // BBB+, BBB, BBB-, BB+, BB, BB- = Orange (Warning)
  if (r.includes('BBB') || r.includes('BB')) {
    return '#e67e22' // orange
  }
  // B, CCC, CC, C, D = Red (Critical)
  if (r.includes('B') || r.includes('C') || r.includes('D')) {
    return '#c0392b' // red
  }
  return '#1a5f7a' // default blue
}

function getRiskColorFromValue(risk) {
  if (!risk) return '#6b7280'
  const r = risk.toLowerCase()
  if (r.includes('low')) {
    return '#27ae60' // green
  }
  if (r.includes('medium')) {
    return '#e67e22' // orange
  }
  if (r.includes('high')) {
    return '#c0392b' // red
  }
  return '#6b7280' // gray
}

const COLOR_PRESETS = [
  { label: '🟢 Good', value: '#27ae60' },
  { label: '🟠 Warning', value: '#e67e22' },
  { label: '🔴 Critical', value: '#c0392b' },
  { label: '🔵 Neutral', value: '#1a5f7a' },
]

function ScoreBlock({ label, scoreField, colorField, levelField }) {
  const { getFieldValue, updateField, updateArray, getArray } = useReport()
  const score = getFieldValue(scoreField) || '0'
  const color = getFieldValue(colorField) || '#e67e22'
  const level = getFieldValue(levelField) || '--'

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 p-6 shadow-sm group/score hover:-translate-y-1 transition-all duration-300">
      <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="text-4xl font-black mb-3" style={{ color }}>{score}</div>
      <div className="w-full bg-gray-100 dark:bg-white/10 h-2 rounded-full mb-3 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(score, 100)}%`, background: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-500">{level}</span>
        <div className="flex gap-1">
          {COLOR_PRESETS.map(p => (
            <button
              key={p.value}
              title={p.label}
              onClick={() => updateField(colorField, p.value)}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all
                ${color === p.value ? 'border-gray-400 dark:border-slate-500 scale-125' : 'border-transparent opacity-40 hover:opacity-100'}`}
              style={{ background: p.value }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function P03_ExecutiveSummary() {
  const { getFieldValue, updateField, updateArray, getArray, reportId, loadReport } = useReport()

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

  const RegenButton = ({ section }) => (
    <button
      onClick={() => handleRegenerate(section)}
      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400
                 hover:text-blue-800 dark:hover:text-blue-300 transition-colors opacity-0 group-hover:opacity-100"
    >
      <RotateCcw size={12} /> REGENERATE WITH AI
    </button>
  )
  
  // Auto-detect colors based on credit_rating and risk_level values
  const creditRating = getFieldValue('credit_rating')
  const riskLevel = getFieldValue('risk_level')
  
  useEffect(() => {
    // Auto-set rating_color based on credit_rating
    if (creditRating) {
      const detectedColor = getRatingColorFromValue(creditRating)
      const currentColor = getFieldValue('rating_color')
      if (!currentColor || currentColor === '#1a5f7a') {
        updateField('rating_color', detectedColor)
      }
    }
    
    // Auto-set risk_color based on risk_level
    if (riskLevel) {
      const detectedColor = getRiskColorFromValue(riskLevel)
      const currentColor = getFieldValue('risk_color')
      if (!currentColor || currentColor === '#6b7280') {
        updateField('risk_color', detectedColor)
      }
    }
  }, [creditRating, riskLevel, updateField, getFieldValue])
  
  const ratingColor = getFieldValue('rating_color') || '#1a5f7a'
  const riskColor = getFieldValue('risk_color') || '#6b7280'
  const alerts = getArray('alerts')

  const alertStyle = (type) => ({
    danger:  'bg-red-50 border-red-100 text-red-800',
    warning: 'bg-orange-50 border-orange-100 text-orange-800',
    success: 'bg-green-50 border-green-100 text-green-800',
    info:    'bg-blue-50 border-blue-100 text-blue-800',
  }[type?.toLowerCase()] || 'bg-blue-50 border-blue-100 text-blue-800')

  const AlertIcon = (type) => ({
    danger:  <AlertCircle size={18} className="text-red-500 shrink-0" />,
    warning: <AlertTriangle size={18} className="text-orange-500 shrink-0" />,
    success: <CheckCircle2 size={18} className="text-green-500 shrink-0" />,
  }[type?.toLowerCase()] || <Info size={18} className="text-blue-500 shrink-0" />)

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Executive Dashboard</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
          Visual summary of credit rating, predictive scores, and alerts.
        </p>
      </div>

      {/* Top Row: Rating + Risk + Health */}
      <div className="grid grid-cols-3 gap-6">
        {/* Credit Rating */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm flex flex-col items-center text-center gap-4">
          <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Credit Rating</div>
          <div className="text-7xl font-black" style={{ color: ratingColor }}>
            {getFieldValue('credit_rating') || 'N/A'}
          </div>
          <div className="flex gap-1 flex-wrap justify-center">
            {COLOR_PRESETS.map(p => (
              <button
                key={p.value}
                title={p.label}
                onClick={() => updateField('rating_color', p.value)}
                className={`w-5 h-5 rounded-full border-2 transition-all
                  ${ratingColor === p.value ? 'border-gray-500 dark:border-slate-500 scale-125' : 'border-transparent opacity-40 hover:opacity-100'}`}
                style={{ background: p.value }}
              />
            ))}
          </div>
          <FieldInput label="Rating Value" fieldName="credit_rating" type="text" placeholder="e.g. BB+" />
        </div>

        {/* Risk Profile */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm flex flex-col items-center text-center gap-4">
          <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Risk Level</div>
          <div className="text-5xl font-black" style={{ color: riskColor }}>
            {getFieldValue('risk_level') || 'N/A'}
          </div>
          <div className="flex gap-1 flex-wrap justify-center">
            {COLOR_PRESETS.map(p => (
              <button
                key={p.value}
                title={p.label}
                onClick={() => updateField('risk_color', p.value)}
                className={`w-5 h-5 rounded-full border-2 transition-all
                  ${riskColor === p.value ? 'border-gray-500 dark:border-slate-500 scale-125' : 'border-transparent opacity-40 hover:opacity-100'}`}
                style={{ background: p.value }}
              />
            ))}
          </div>
          <FieldInput label="Risk Level" fieldName="risk_level" type="text" placeholder="e.g. MEDIUM" />
        </div>

        {/* Health Score */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm flex flex-col items-center text-center gap-4">
          <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Health Score</div>
          <div className="text-7xl font-black text-gray-800 dark:text-gray-100">
            {getFieldValue('health_score') || '0'}
            <span className="text-xl text-gray-300 dark:text-slate-600 font-bold">/100</span>
          </div>
          <FieldInput label="Score (0–100)" fieldName="health_score" type="text" placeholder="0–100" />
          <FieldInput label="Financial Health Label" fieldName="financial_health" type="text" placeholder="e.g. Good, Stable, Weak" />
        </div>
      </div>

      {/* Credit Limits */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-100 dark:border-white/10 shadow-sm">
          <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4">Recommended Credit Limit (USD)</div>
          <FieldInput label="Amount" fieldName="recommended_credit_limit" type="text" placeholder="e.g. USD 2,000,000" />
        </div>
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-100 dark:border-white/10 shadow-sm">
          <div className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4">Maximum Exposure (USD)</div>
          <FieldInput label="Amount" fieldName="maximum_exposure" type="text" placeholder="e.g. USD 3,000,000" />
        </div>
      </div>

      {/* Financial Snapshot */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">Financial Snapshot</h3>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput compact label="Company Size" fieldName="company_size" type="text" placeholder="e.g. Small" />
          <FieldInput compact label="Annual Revenue" fieldName="annual_revenue" type="text" placeholder="e.g. 50M" />
          <FieldInput compact label="Payment Risk Label" fieldName="payment_risk" type="text" placeholder="e.g. Moderate" />
          <FieldInput compact label="PAYDEX Score" fieldName="paydex_score" type="text" placeholder="e.g. 72" />
        </div>
        <div className="mt-4">
          <FieldInput label="Company Size Explanation" fieldName="company_size_explanation" type="textarea" rows={3} placeholder="Explain why the company is classified as this size..." />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <FieldInput compact label="Current Ratio" fieldName="current_ratio" type="text" placeholder="e.g. 1.2" />
          <FieldInput compact label="Debt/Equity" fieldName="debt_equity" type="text" placeholder="e.g. 0.8" />
          <FieldInput compact label="EBIT Margin %" fieldName="ebit_margin" type="text" placeholder="e.g. 12" />
          <FieldInput compact label="Quick Ratio" fieldName="quick_ratio" type="text" placeholder="e.g. 0.9" />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
          <h4 className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4">Key Business Metrics (shown in Executive Summary)</h4>
          <div className="grid grid-cols-3 gap-4">
            <FieldInput compact label="Employees No." fieldName="employee_count" type="text" placeholder="e.g. 150" />
            <FieldInput compact label="Registered Capital" fieldName="capital" type="text" placeholder="e.g. USD 5,000,000" />
            <FieldInput compact label="Annual Turnover" fieldName="annual_turnover" type="text" placeholder="e.g. AED 50M" />
          </div>
          <div className="mt-2">
            <FieldInput compact label="Employee Location" fieldName="employee_location" type="text" placeholder="e.g. Dubai, UAE" />
          </div>
        </div>
      </div>

      {/* Predictive Scores */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">Predictive Scores</h3>
        <div className="grid grid-cols-4 gap-6">
          <ScoreBlock
            label="Viability"
            scoreField="viability_score"
            colorField="viability_color"
            levelField="viability_level"
          />
          <ScoreBlock
            label="Delinquency"
            scoreField="delinquency_score"
            colorField="delinquency_color"
            levelField="delinquency_level"
          />
          <ScoreBlock
            label="Failure Risk"
            scoreField="failure_score"
            colorField="failure_color"
            levelField="risk_level"
          />
          <ScoreBlock
            label="Payment Index"
            scoreField="payment_score"
            colorField="payment_color"
            levelField="payment_risk"
          />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <FieldInput label="Viability Score" fieldName="viability_score" type="text" placeholder="0–100" />
          <FieldInput label="Delinquency Score" fieldName="delinquency_score" type="text" placeholder="0–100" />
          <FieldInput label="Failure Score" fieldName="failure_score" type="text" placeholder="0–100" />
          <FieldInput label="Payment Score" fieldName="payment_score" type="text" placeholder="0–100" />
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Alerts & Warnings
        </h3>

        {/* Live Preview */}
        {alerts.length > 0 && (
          <div className="space-y-3 mb-6 p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10">
            <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Preview
            </div>
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${a.alert_type === 'success' ? 'bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400' : 
                                                            a.alert_type === 'warning' ? 'bg-amber-50/50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-800 dark:text-amber-400' :
                                                            a.alert_type === 'danger' ? 'bg-rose-50/50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20 text-rose-800 dark:text-rose-400' :
                                                            'bg-blue-50/50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20 text-blue-800 dark:text-blue-400'}`}>
                {AlertIcon(a.alert_type)}
                <div className="text-sm font-semibold">{a.alert_message || '(empty)'}</div>
              </div>
            ))}
          </div>
        )}

        <GenericTableEditor
          title="Alerts"
          data={getArray('alerts')}
          onSave={(newItems) => updateArray('alerts', newItems)}
          columns={[
            { key: 'alert_type', label: 'Type', type: 'select', options: [
              { value: 'success', label: '🟢 Success' },
              { value: 'info', label: '🔵 Info' },
              { value: 'warning', label: '🟠 Warning' },
              { value: 'danger', label: '🔴 Danger' },
            ]},
            { key: 'alert_icon', label: 'Icon', type: 'text', placeholder: '⚠️' },
            { key: 'alert_message', label: 'Message', type: 'text', placeholder: 'Alert text...', required: true },
          ]}
          emptyMessage="No alerts configured."
        />
      </div>

      {/* Risk Mitigation Strategies */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Risk Mitigation Strategies
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          Strategies to mitigate identified risks:
        </p>
        <GenericTableEditor
          title="Risk Mitigations"
          data={getArray('risk_mitigations')}
          onSave={(newItems) => updateArray('risk_mitigations', newItems)}
          columns={[
            { key: 'mitigation_title', label: 'Strategy', type: 'text', placeholder: 'e.g. Regular financial monitoring', required: true },
            { key: 'mitigation_detail', label: 'Expected Outcome', type: 'text', placeholder: 'e.g. Early detection of financial issues', required: true },
          ]}
          emptyMessage="No risk mitigation strategies configured."
        />
      </div>
    </div>
  )
}