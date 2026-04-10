// ============ P18_Appendices.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import GenericTableEditor from '../components/GenericTableEditor'
import { Paperclip, Info } from 'lucide-react'

const FIXED_SOURCES = [
    { type: 'Commercial Registry', detail: 'Official government commercial registration records and gazette publications' },
    { type: 'Financial Statements', detail: 'Audited or management accounts submitted by the subject company' },
    { type: 'Tax & Regulatory', detail: 'National tax authority records, VAT/Zakat compliance certificates' },
    { type: 'Legal & Court Records', detail: 'Public court filings, judgment registers, and lien records' },
    { type: 'Trade References', detail: 'Direct supplier and customer interviews and payment history surveys' },
    { type: 'Banking Information', detail: 'Bank confirmation letters and banking relationship disclosures' },
    { type: 'News & Media', detail: 'Licensed press databases, official press releases, verified news outlets' },
    { type: 'Industry Databases', detail: 'Sector reports from recognized research agencies and trade associations' },
    { type: 'On-Site Visits', detail: 'Field visits, management interviews, and facility inspections where conducted' },
]

export default function P18_Appendices() {
    const { updateArray, getArray } = useReport()
    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Appendices</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Scoring methodology, rating scale, data sources, and analyst quality notes.
                    The Disclaimer is auto-appended in the PDF at the bottom of this section.
                </p>
            </div>

            {/* Appendix A & B — Read Only Info */}
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-500/20 flex items-start gap-4">
                <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg text-white shrink-0">
                    <Info size={18} />
                </div>
                <div>
                    <h4 className="text-xs font-black text-blue-900 dark:text-blue-300 uppercase tracking-widest mb-1">
                        Appendix A & B — Auto-Generated
                    </h4>
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                        Scoring Methodology (Appendix A) and Credit Rating Scale (Appendix B)
                        are fixed content auto-included in every PDF. No editing required.
                    </p>
                </div>
            </div>

            {/* Appendix C — Data Sources Fixed Table */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
                    Appendix C — Data Sources
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                    The source table below is <strong>fixed</strong> in every report.
                    Add your analyst comments below it.
                </p>

                {/* Fixed Source Table Preview */}
                <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden mb-6">
                    <div className="grid grid-cols-[1fr_2fr] bg-[#1a5f7a] dark:bg-blue-600/90 text-white">
                        <div className="px-4 py-2 text-xs font-black uppercase tracking-widest">
                            Source Type
                        </div>
                        <div className="px-4 py-2 text-xs font-black uppercase tracking-widest">
                            Details
                        </div>
                    </div>
                    {FIXED_SOURCES.map((s, i) => (
                        <div
                            key={i}
                            className={`grid grid-cols-[1fr_2fr] border-b border-gray-100 dark:border-white/5 last:border-0
                ${i % 2 === 0 ? 'bg-gray-50/50 dark:bg-white/5' : 'bg-white dark:bg-transparent'}`}
                        >
                            <div className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-slate-300">{s.type}</div>
                            <div className="px-4 py-3 text-xs text-gray-500 dark:text-slate-500">{s.detail}</div>
                        </div>
                    ))}
                </div>

                {/* Analyst Comment on Data Quality */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-6 border border-gray-100 dark:border-white/10">
                    <h4 className="text-xs font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest mb-4">
                        📝 Analyst Comment on Data Quality
                    </h4>
                    <div className="grid grid-cols-3 gap-6">
                        <FieldInput
                            label="Data Quality Rating"
                            fieldName="data_quality_rating"
                            type="text"
                            placeholder="e.g. Good - Based on audited financial statements"
                        />
                        <div className="col-span-2">
                            <FieldInput
                                label="Data Limitations"
                                fieldName="data_limitations"
                                type="textarea"
                                rows={2}
                                placeholder="Any gaps, missing sources, or unverified information..."
                            />
                        </div>
                    </div>
                    <div className="mt-4">
                        <FieldInput
                            label="Analyst Note on Sources"
                            fieldName="data_source_analyst_comment"
                            type="textarea"
                            rows={3}
                            placeholder="Additional context on how data was gathered, verified, and weighted..."
                        />
                    </div>
                </div>
            </div>

            {/* Supporting Documents Registry */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8 relative overflow-hidden">
                <div className="absolute top-4 right-4 opacity-5 dark:opacity-10 text-gray-400 dark:text-white">
                    <Paperclip size={100} />
                </div>
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 relative">
                    Supporting Documents Registry
                </h3>
                <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6 relative">
                    Documents reviewed during this analysis. Does not appear in PDF output
                    but is stored with the report record.
                </p>
                <GenericTableEditor
                    title="Supporting Documents"
                    data={getArray('extra_reg_fields')}
                    onSave={(newItems) => updateArray('extra_reg_fields', newItems)}
                    columns={[
                        { key: 'extra_reg_label', label: 'Document Type', type: 'text', placeholder: 'e.g. VAT Certificate' },
                        { key: 'extra_reg_value', label: 'Reference', type: 'text', placeholder: 'e.g. 123456789' },
                    ]}
                    emptyMessage="No supporting documents logged."
                />
            </div>
        </div>
    )
}