// ============ P04_ExecutiveSummary.jsx ============
import React from 'react'
import { RotateCcw } from 'lucide-react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import { reportAPI } from '../api/client'

export default function P04_ExecutiveSummary() {
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

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Executive Summary</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
          Company overview and history narrative. Appears after the dashboard in the report.
        </p>
      </div>

      {/* Company Overview */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8 relative group">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Company Overview
          </h3>
          <RegenButton section="executive_summary" />
        </div>
        <FieldInput
          label=""
          fieldName="executive_summary_text"
          type="textarea"
          rows={12}
          placeholder="Comprehensive overview of the company's credit profile, financial position, and key risk drivers..."
          helpText="This paragraph appears at the top of the Executive Summary page in the PDF."
        />
      </div>

      {/* Company History */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8 relative group">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Company History
          </h3>
          <RegenButton section="company_history" />
        </div>
        <FieldInput
          label=""
          fieldName="company_history_text"
          type="textarea"
          rows={6}
          placeholder="Founding history, major milestones, growth trajectory..."
          helpText="Displayed as an info block below the Company Overview in the PDF."
        />
      </div>

      {/* Key Business Metrics (shown in Executive Summary PDF) */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-sm">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Key Business Metrics
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <FieldInput label="Employees No." fieldName="employee_count" type="text" placeholder="e.g. 150" />
          <FieldInput label="Registered Capital" fieldName="capital" type="text" placeholder="e.g. USD 5,000,000" />
          <FieldInput label="Annual Turnover" fieldName="annual_turnover" type="text" placeholder="e.g. AED 50M" />
        </div>
        <div className="mt-4">
          <FieldInput label="Employee Location" fieldName="employee_location" type="text" placeholder="e.g. Dubai, UAE" />
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-500/20">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
          💡 <strong>Page order note:</strong> In the PDF, the Executive Summary (this page) appears on
          Page 3, <em>after</em> the Executive Dashboard (Page 2). Credit Opinion text is edited on the
          Credit Recommendation page.
        </p>
      </div>
    </div>
  )
}