// ============ P09_Banking.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'

export default function P09_Banking() {
    const { updateArray, getArray } = useReport()
    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Banking Relationships</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Active credit facilities, banking partners, and treasury support.
                </p>
            </div>

            {/* Overview */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Banking Overview
                </h3>
                <div className="grid grid-cols-3 gap-6">
                    <FieldInput
                        label="Primary Bank"
                        fieldName="primary_bank"
                        type="text"
                        placeholder="e.g. Al Rajhi Bank"
                    />
                    <FieldInput
                        label="Total Banking Partners"
                        fieldName="total_banks"
                        type="text"
                    />
                    <FieldInput
                        label="Group Treasury Support"
                        fieldName="group_treasury_support"
                        type="text"
                        placeholder="e.g. Yes – parent guarantees available"
                    />
                </div>
            </div>

            {/* Facilities Registry */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Credit Facilities Registry
                </h3>
                <GenericTableEditor
                    title="Banking Relationships"
                    data={getArray('banking_relationships')}
                    onSave={(newItems) => updateArray('banking_relationships', newItems)}
                    columns={[
                        { key: 'bank_name', label: 'Bank Name', type: 'text', required: true, placeholder: 'Bank name' },
                        { key: 'facility_type', label: 'Facility Type', type: 'text', placeholder: 'e.g. Term Loan, LC' },
                        { key: 'facility_usage', label: 'Usage', type: 'text', placeholder: 'e.g. Working Capital' },
                    ]}
                    emptyMessage="No banking facilities recorded."
                />
            </div>

            {/* Banking Notes */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Analyst Banking Commentary
                </h3>
                <FieldInput
                    label="Banking Notes"
                    fieldName="banking_notes"
                    type="textarea"
                    rows={5}
                    placeholder="Any defaults, late payments, concentration risk, or strategic support details..."
                    helpText="Leave empty to hide this block from the PDF."
                />
            </div>
        </div>
    )
}