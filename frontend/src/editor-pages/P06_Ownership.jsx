// ============ P06_Ownership.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'

export default function P06_Ownership() {
  const { getArray, getFieldValue, updateField, updateArray } = useReport()
  const shareholders = getArray('shareholders')
  const showBoard = getFieldValue('show_board_of_directors') || false // Keep this field for UI toggle, but data is 'board_members'

  const totalPct = shareholders.reduce(
    (sum, s) => sum + (parseFloat(s.percentage) || 0), 0
  )
  const isCorrect = Math.abs(totalPct - 100) < 0.1

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Ownership & Management</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
          Shareholders, key management, optional board of directors, and corporate structure.
        </p>
      </div>

      {/* Capital */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Registered Capital
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <FieldInput 
            label="Total Capital" 
            fieldName="capital" 
            type="text" 
            placeholder="e.g. USD 5,000,000" 
            helpText="As per Commercial Registration."
          />
        </div>
      </div>

      {/* Shareholders */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Shareholders
          </h3>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase
            ${isCorrect ? 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-rose-500/10 text-red-700 dark:text-rose-400'}`}>
            Total: {totalPct}% {isCorrect ? '✅' : '⚠️'}
          </div>
        </div>

        <GenericTableEditor
          title="Shareholders"
          data={getArray('shareholders')}
          onSave={(newItems) => updateArray('shareholders', newItems)}
          columns={[
            { key: 'name', label: 'Name', type: 'text', placeholder: 'Person or Company', required: true },
            { key: 'nationality', label: 'Nationality', type: 'text', placeholder: 'e.g. Saudi' },
            { key: 'percentage', label: 'Share (%)', type: 'text', placeholder: 'e.g. 100%', required: true },
            { key: 'position', label: 'Note', type: 'text', placeholder: 'e.g. Founder' },
            { key: 'type', label: 'Type', type: 'text', placeholder: 'e.g. Individual' },
          ]}
          emptyMessage="No shareholders added."
        />
      </div>

      {/* Management */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Key Management
        </h3>
        <GenericTableEditor
          title="Key Management"
          data={getArray('management_team')}
          onSave={(newItems) => updateArray('management_team', newItems)}
          columns={[
            { key: 'name', label: 'Full Name', type: 'text', required: true },
            { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. CEO', required: true },
            { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Finance' },
            { key: 'contact_phone', label: 'Phone', type: 'text' },
            { key: 'contact_email', label: 'Email', type: 'email' },
            { key: 'bio', label: 'Bio', type: 'text', placeholder: 'Responsibilities...' },
          ]}
          emptyMessage="No management team members added."
        />
      </div>

      {/* Board of Directors (Optional) */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Board of Directors
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Show on PDF?</span>
            <input 
              type="checkbox" 
              checked={showBoard}
              onChange={(e) => updateField('show_board_of_directors', e.target.checked)}
              className="w-4 h-4 accent-blue-600 dark:bg-white/5 border-slate-200 dark:border-white/10"
            />
          </div>
        </div>

        {showBoard ? (
          <GenericTableEditor
            title="Board Members"
            data={getArray('board_members')}
            onSave={(newItems) => updateArray('board_members', newItems)}
            columns={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Chairman', required: true },
              { key: 'nationality', label: 'Nationality', type: 'text' },
              { key: 'since', label: 'Since', type: 'text', placeholder: 'e.g. 2018' },
              { key: 'bio_short', label: 'Bio', type: 'text', placeholder: 'Short bio...' },
            ]}
            emptyMessage="No board members added."
          />
        ) : (
          <div className="py-10 text-center bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10 text-gray-400 dark:text-slate-500">
            <p className="text-xs font-bold uppercase tracking-widest">Board Display Disabled</p>
            <p className="text-[10px] mt-1">Check the toggle above to enable this section.</p>
          </div>
        )}
      </div>

      {/* Group Structure Scalars */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Corporate Structure
        </h3>
        <div className="grid grid-cols-1 gap-6">
          <FieldInput 
            label="Parent Company" 
            fieldName="parent_company" 
            type="text" 
            placeholder="e.g. Al Rajhi Holding Group"
            helpText="Name of the ultimate parent entity."
          />
          <FieldInput 
            label="Subsidiaries" 
            fieldName="subsidiaries" 
            type="textarea" 
            rows={3} 
            placeholder="List of subsidiary companies..."
            helpText="Narrative list of subsidiaries."
          />
          <FieldInput 
            label="Affiliates" 
            fieldName="affiliates" 
            type="textarea" 
            rows={3} 
            placeholder="List of affiliated companies..."
            helpText="Narrative list of affiliated entities."
          />
        </div>
      </div>
    </div>
  )
}