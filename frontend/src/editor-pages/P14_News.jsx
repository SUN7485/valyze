// ============ P14_News.jsx ============
import React from 'react'
import { useReport } from '../context/ReportContext'
import GenericTableEditor from '../components/GenericTableEditor'

export default function P14_News() {
    const { getFieldValue, updateField, updateArray, getArray } = useReport()
    const show = getFieldValue('show_news_section') !== false

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                            News & Recent Developments
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                            Events and news that impact the company's credit standing.
                        </p>
                    </div>
                    {/* Section Toggle */}
                    <label className="flex items-center gap-3 cursor-pointer mt-1">
                        <div className={`relative w-11 h-6 rounded-full transition-all
              ${show ? 'bg-[#1a5f7a] dark:bg-blue-600' : 'bg-gray-200 dark:bg-white/10'}`}
                        >
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={show}
                                onChange={e => updateField('show_news_section', e.target.checked)}
                            />
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow
                transition-transform ${show ? 'translate-x-5' : ''}`}
                            />
                        </div>
                        <span className="text-sm font-bold text-gray-600 dark:text-slate-400">Include in report</span>
                    </label>
                </div>
            </div>

            {!show ? (
                <div className="text-center py-12 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed
                        border-gray-200 dark:border-white/10 text-gray-400 dark:text-slate-500 text-sm">
                    News & Developments section is <strong>hidden</strong> from the PDF report.
                </div>
            ) : (
                <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                    <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                        News Timeline Registry
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
                        Events appear as a vertical timeline in the PDF. Most recent first.
                    </p>
                    <GenericTableEditor
                        title="News Events"
                        data={getArray('news_events')}
                        onSave={(newItems) => updateArray('news_events', newItems)}
                        columns={[
                            { key: 'event_date', label: 'Date', type: 'date', required: true },
                            { key: 'event_title', label: 'Headline', type: 'text', required: true, placeholder: 'e.g. Major Contract Award' },
                            { key: 'event_summary', label: 'Summary', type: 'text', placeholder: 'Brief description...' },
                            { key: 'event_sentiment', label: 'Sentiment', type: 'select', options: [
                                { value: 'low', label: '🟢 Positive' },
                                { value: 'medium', label: '🟠 Neutral' },
                                { value: 'high', label: '🔴 Negative' },
                                { value: 'info', label: '🔵 Informational' },
                            ]},
                            { key: 'event_sentiment_label', label: 'Sentiment Label', type: 'text', placeholder: 'e.g. High Impact Positive' },
                        ]}
                        emptyMessage="No news events recorded."
                    />
                </div>
            )}
        </div>
    )
}