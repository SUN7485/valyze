// ============ P01_CoverPage.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'

export default function P01_CoverPage() {
  const { getFieldValue } = useReport()
  const ratingColor = getFieldValue('rating_color') || '#1a5f7a'
  const riskColor = getFieldValue('risk_color') || '#6b7280'

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-6">
        <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Cover Page</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 font-medium italic">
          Report identity, analyst assignment, and top-level credit snapshot.
        </p>
      </div>

      {/* Report Identity */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Report Identity
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <FieldInput
            label="Subject Company Name"
            fieldName="company_name"
            type="text"
            required
            placeholder="e.g. Acme Corporation"
          />
          <FieldInput
            label="Report Issuance Date"
            fieldName="report_date"
            type="date"
          />
          <FieldInput
            label="Internal Report ID"
            fieldName="report_id"
            type="text"
            readOnly
          />
          <FieldInput
            label="Fiscal Year"
            fieldName="current_year"
            type="text"
          />
        </div>
      </div>

      {/* Analyst Assignment */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Analyst Assignment
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <FieldInput
            label="Client Organization"
            fieldName="client_name"
            type="text"
            required
            placeholder="Saudi National Bank"
          />
          <FieldInput
            label="Primary Analyst"
            fieldName="analyst_name"
            type="text"
            required
            placeholder="Full name"
          />
        </div>
      </div>

      {/* Credit Snapshot */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Credit Snapshot
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Credit Rating', field: 'credit_rating', color: ratingColor, size: 'text-4xl' },
            { label: 'Risk Level', field: 'risk_level', color: riskColor, size: 'text-2xl' },
            { label: 'Health Score', field: 'health_score', suffix: '/100', size: 'text-3xl' },
            { label: 'Rec. Limit (USD)', field: 'recommended_credit_limit', size: 'text-xl' },
          ].map((m, i) => (
            <div
              key={i}
              className="bg-gray-50 dark:bg-white/5 rounded-2xl p-6 text-center border border-gray-100 dark:border-white/10
                         hover:-translate-y-1 transition-transform"
            >
              <div className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                {m.label}
              </div>
              <div
                className={`${m.size} font-black truncate`}
                style={m.color ? { color: m.color } : { color: '#1a5f7a' }}
              >
                {getFieldValue(m.field) || 'N/A'}
                {m.suffix && (
                  <span className="text-sm font-bold text-gray-300 dark:text-gray-600">{m.suffix}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}