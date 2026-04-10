// ============ P02_OrderSummary.jsx ============
import React from 'react'
import FieldInput from '../components/FieldInput'

export default function P02_OrderSummary() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Order Summary</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
          Order tracking, analyst details, and subject company overview.
        </p>
      </div>

      {/* Order Info */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Order Information
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <FieldInput label="Client Name" fieldName="client_name" type="text" required />
          <FieldInput label="Client Reference No." fieldName="client_reference" type="text" placeholder="REF-2024-001" />
          <FieldInput label="Report Date" fieldName="report_date" type="date" />
          <FieldInput label="Analyst Assigned" fieldName="analyst_name" type="text" required />
          <FieldInput label="Report ID" fieldName="report_id" type="text" readOnly />
        </div>
      </div>

      {/* Subject Company */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Subject Company
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <FieldInput label="Company Name" fieldName="company_name" type="text" required />
          <FieldInput label="Country" fieldName="country" type="text" placeholder="Saudi Arabia" />
          <FieldInput label="Address" fieldName="company_address" type="textarea" rows={2} />
          <FieldInput label="Phone" fieldName="phone" type="text" />
          <FieldInput label="Fax" fieldName="fax" type="text" />
          <FieldInput label="CR Number" fieldName="cr_number" type="text" />
        </div>
      </div>

      {/* Analyst Notes */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Order Comments
        </h3>
        <FieldInput
          label="Special Instructions / Notes"
          fieldName="order_comment"
          type="textarea"
          rows={4}
          placeholder="Any client-specific instructions or context for this report..."
        />
      </div>
    </div>
  )
}