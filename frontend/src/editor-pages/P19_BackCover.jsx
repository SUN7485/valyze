// ============ P19_BackCover.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'

export default function P19_BackCover() {
    const { getFieldValue } = useReport()

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Back Cover & Submission
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Final sign-off, confidentiality notice, and report identification.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Report Identity */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                            Report Identity
                        </h3>
                        <div className="space-y-4">
                            <FieldInput label="Unique Report ID" fieldName="report_id" type="text" readOnly />
                            <FieldInput label="Generation Date" fieldName="report_date" type="text" readOnly />
                            <FieldInput label="Subject Entity" fieldName="company_name" type="text" readOnly />
                            <FieldInput label="Prepared For" fieldName="client_name" type="text" readOnly />
                            <FieldInput label="Copyright Year" fieldName="current_year" type="text" readOnly />
                        </div>
                    </div>

                    {/* Ready State */}
                    <div className="p-6 bg-green-50 dark:bg-green-500/10 rounded-2xl border border-green-100 dark:border-green-500/20
                          flex items-center gap-4">
                        <div className="p-3 bg-white dark:bg-white/10 rounded-xl shadow-sm text-green-600 dark:text-green-400 shrink-0">
                            <CheckCircle2 size={28} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-green-900 dark:text-green-300 uppercase tracking-widest mb-1">
                                Ready for PDF Generation
                            </h4>
                            <p className="text-xs text-green-700 dark:text-green-400 font-medium leading-relaxed">
                                All sections complete. Click <strong>"Generate Report"</strong> in the
                                top bar to finalize and download the PDF.
                            </p>
                        </div>
                    </div>


                </div>

                {/* Confidentiality Panel */}
                <div className="bg-[#1a5f7a] dark:bg-blue-600/90 rounded-2xl p-10 text-white shadow-xl
                        relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 p-10 opacity-10">
                        <Lock size={180} />
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col">
                        <div className="flex items-center gap-3 mb-8">
                            <ShieldCheck size={28} className="text-blue-200" />
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-blue-100">
                                Confidentiality Guarantee
                            </h3>
                        </div>

                        <div className="flex-1 space-y-6">
                            <p className="text-xs leading-relaxed opacity-70 italic font-medium">
                                "This report is provided for use specifically by the named client and is
                                subject to strict confidentiality. The intelligence contained herein is
                                derived from local regional data sources, public records, and
                                AI-assisted analysis."
                            </p>

                            <div className="space-y-3 pt-6 border-t border-white/10">
                                {[
                                    { label: 'Security Level', value: 'HIGH — CONFIDENTIAL' },
                                    { label: 'Transmission', value: 'SSL / TLS 1.3' },
                                    { label: 'Distribution', value: 'Authorized Recipients Only' },
                                    { label: 'Reproduction', value: 'Strictly Prohibited' },
                                ].map((r, i) => (
                                    <div key={i} className="flex justify-between items-center
                                          text-[10px] font-black uppercase tracking-widest opacity-50">
                                        <span>{r.label}</span>
                                        <span>{r.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-auto pt-8 text-center">
                            <div className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40 mb-1">
                                Valyze — Credit Intelligence
                            </div>
                            <div className="text-[9px] font-bold opacity-20">
                                © {getFieldValue('current_year') || '2025'} Al Marqa. All rights reserved.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-red-50 dark:bg-red-500/10 rounded-2xl p-6 border border-red-100 dark:border-red-500/20
                      border-l-4 border-l-red-500">
                <h4 className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-3">
                    ⚠️ Disclaimer (auto-appended to PDF)
                </h4>
                <p className="text-xs text-red-600 dark:text-red-300 font-medium leading-relaxed">
                    This report is based on information available as of the report date. Valyze has
                    made reasonable efforts to ensure accuracy but makes no warranties, express or
                    implied, regarding completeness or accuracy. This report is provided for
                    informational purposes only and should not be the sole basis for any credit
                    decision. Credit ratings and recommendations may change with new information.
                    This document is confidential and intended solely for authorized recipients.
                    Unauthorized distribution or reproduction is strictly prohibited.
                </p>
            </div>
        </div>
    )
}


