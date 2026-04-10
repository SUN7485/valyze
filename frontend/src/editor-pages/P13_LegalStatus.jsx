// ============ P13_LegalStatus.jsx ============
import React from 'react'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'
import { useReport } from '../context/ReportContext'
import { Scale, Gavel, FileWarning, ShieldAlert } from 'lucide-react'

function LegalCountCard({ label, countField, amountField, dateField,
    badgeField, statusField, icon: Icon }) {
    return (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-400 dark:text-slate-500">
                    <Icon size={20} />
                </div>
                <div className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest">{label}</div>
            </div>
            <div className="space-y-3">
                <FieldInput label="Count" fieldName={countField} type="text" placeholder="0" />
                <FieldInput label="Total Amount" fieldName={amountField} type="text" placeholder="SAR 0" />
                <FieldInput label="Last Filed Date" fieldName={dateField} type="date" />
                <FieldInput label="Status Text" fieldName={statusField} type="text" placeholder="e.g. Clear, Ongoing" />
                <FieldInput
                    label="Badge Class"
                    fieldName={badgeField}
                    type="select"
                    options={[
                        { value: 'low', label: '🟢 Green (low)' },
                        { value: 'medium', label: '🟠 Orange (medium)' },
                        { value: 'high', label: '🔴 Red (high)' },
                    ]}
                />
            </div>
        </div>
    )
}

export default function P13_LegalStatus() {
    const { updateArray, getArray } = useReport()
    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Legal Status & Compliance</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Lawsuits, liens, judgments, and regulatory compliance status.
                </p>
            </div>

            {/* Compliance Status */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Compliance Status
                </h3>
                <div className="grid grid-cols-2 gap-8">
                    {/* License */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2">
                            <Scale size={14} /> Business License
                        </h4>
                        <FieldInput label="License Status Text" fieldName="license_status" type="text" placeholder="e.g. Valid" />
                        <FieldInput label="License Expiry" fieldName="license_expiry" type="date" />
                        <FieldInput
                            label="Alert Type"
                            fieldName="license_alert"
                            type="select"
                            options={[
                                { value: 'success', label: '🟢 Success' },
                                { value: 'warning', label: '🟠 Warning' },
                                { value: 'danger', label: '🔴 Danger' },
                            ]}
                        />
                        <FieldInput label="Alert Icon" fieldName="license_icon" type="text" placeholder="e.g. ✅" />
                    </div>

                    {/* Tax */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2">
                            <ShieldAlert size={14} /> Tax / Zakat Compliance
                        </h4>
                        <FieldInput label="Tax Status Text" fieldName="tax_status" type="text" placeholder="e.g. Compliant" />
                        <FieldInput
                            label="Alert Type"
                            fieldName="tax_alert"
                            type="select"
                            options={[
                                { value: 'success', label: '🟢 Success' },
                                { value: 'warning', label: '🟠 Warning' },
                                { value: 'danger', label: '🔴 Danger' },
                            ]}
                        />
                        <FieldInput label="Alert Icon" fieldName="tax_icon" type="text" placeholder="e.g. ✅" />
                    </div>
                </div>
            </div>

            {/* Legal Summary Cards */}
            <div className="grid grid-cols-3 gap-6">
                <LegalCountCard
                    label="Lawsuits"
                    countField="lawsuit_count"
                    amountField="lawsuit_amount"
                    dateField="lawsuit_last_date"
                    badgeField="lawsuit_badge"
                    statusField="lawsuit_status"
                    icon={Gavel}
                />
                <LegalCountCard
                    label="Liens & Encumbrances"
                    countField="lien_count"
                    amountField="lien_amount"
                    dateField="lien_last_date"
                    badgeField="lien_badge"
                    statusField="lien_status"
                    icon={FileWarning}
                />
                <LegalCountCard
                    label="Court Judgments"
                    countField="judgment_count"
                    amountField="judgment_amount"
                    dateField="judgment_last_date"
                    badgeField="judgment_badge"
                    statusField="judgment_status"
                    icon={Scale}
                />
            </div>

            {/* Legal Event Details Array */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Detailed Legal Event Registry
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-4">
                    Each entry creates a details card in the PDF. Leave empty to hide this section.
                </p>
                <GenericTableEditor
                    title="Legal Events"
                    data={getArray('legal_details')}
                    onSave={(newItems) => updateArray('legal_details', newItems)}
                    columns={[
                        { key: 'event_type', label: 'Event Type', type: 'select', options: [
                            { value: 'Lawsuit', label: 'Lawsuit' },
                            { value: 'Lien', label: 'Lien' },
                            { value: 'Judgment', label: 'Judgment' },
                            { value: 'Regulatory', label: 'Regulatory Action' },
                        ]},
                        { key: 'event_date', label: 'Date', type: 'date' },
                        { key: 'event_amount', label: 'Amount', type: 'text', placeholder: 'SAR 0' },
                        { key: 'event_description', label: 'Description', type: 'text', placeholder: 'Brief details...' },
                    ]}
                    emptyMessage="No detailed legal events recorded."
                />
            </div>
        </div>
    )
}