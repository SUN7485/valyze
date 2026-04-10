// ============ P07_RelatedConcerns.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'

export default function P07_RelatedConcerns() {
  const { getFieldValue, updateField, updateArray, getArray } = useReport()
  const show = getFieldValue('show_related_concerns') !== false

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Related Concerns</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
            Subsidiaries, affiliates, and associated entities.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10">
          <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Enable Section?</span>
          <input 
            type="checkbox" 
            checked={show}
            onChange={(e) => updateField('show_related_concerns', e.target.checked)}
            className="w-5 h-5 accent-blue-600 dark:bg-white/5 border-slate-200 dark:border-white/10"
          />
        </div>
      </div>

      {show ? (
        <>
          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
            <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
              Branches Network
            </h3>
            <GenericTableEditor
              title="Branches"
              data={getArray('branches')}
              onSave={(newItems) => updateArray('branches', newItems)}
              columns={[
                { key: 'branch_name', label: 'Branch Name', type: 'text', required: true },
                { key: 'branch_unified_no', label: 'Unified No.', type: 'text' },
                { key: 'branch_cr_no', label: 'CR No.', type: 'text' },
                { key: 'branch_city', label: 'City', type: 'text' },
                { key: 'branch_function', label: 'Function', type: 'text', placeholder: 'e.g. Sales Office' },
                { key: 'branch_status', label: 'Status', type: 'text', placeholder: 'e.g. Active' },
                { key: 'branch_status_badge', label: 'Badge', type: 'select', options: [
                  { value: 'low', label: '🟢 Green (low)' },
                  { value: 'medium', label: '🟠 Orange (medium)' },
                  { value: 'high', label: '🔴 Red (high)' },
                ]},
              ]}
              emptyMessage="No branches added."
            />
          </div>

          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
            <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
              Regional Affiliates
            </h3>
            <GenericTableEditor
              title="Regional Affiliates"
              data={getArray('regional_affiliates')}
              onSave={(newItems) => updateArray('regional_affiliates', newItems)}
              columns={[
                { key: 'affiliate_name', label: 'Entity Name', type: 'text', required: true },
                { key: 'relation', label: 'Relation', type: 'text', placeholder: 'e.g. Sister Co.' },
                { key: 'cr_number', label: 'CR Number', type: 'text' },
                { key: 'status', label: 'Status', type: 'text', placeholder: 'e.g. Active' },
              ]}
              emptyMessage="No affiliates added."
            />
          </div>

          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
            <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
              Group Headquarters
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <FieldInput 
                label="Group HQ Name" 
                fieldName="group_hq_name" 
                type="text" 
                placeholder="e.g. Al Rajhi Holding Group HQ"
              />
              <FieldInput 
                label="Group HQ Location" 
                fieldName="group_hq_location" 
                type="text" 
                placeholder="e.g. Riyadh, Saudi Arabia"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
            <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
              Group Headquarters
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <FieldInput 
                label="Group HQ Name" 
                fieldName="group_hq_name" 
                type="text" 
                placeholder="e.g. Al Rajhi Holding Group HQ"
              />
              <FieldInput 
                label="Group HQ Location" 
                fieldName="group_hq_location" 
                type="text" 
                placeholder="e.g. Riyadh, Saudi Arabia"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="py-20 text-center bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
             <span className="text-2xl">🚫</span>
          </div>
          <h3 className="text-sm font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">Section Hidden</h3>
          <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
            This section will be omitted from the final PDF. Turn the toggle on if the subject has relevant subsidiaries or sister companies.
          </p>
        </div>
      )}
    </div>
  )
}