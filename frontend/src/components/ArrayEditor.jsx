import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, Check, Database, ListPlus } from 'lucide-react'

export default function ArrayEditor({
    arrayName,
    columns,
    data = [],
    emptyMessage = "No analytical data captured yet",
    addLabel = "Add Entry",
    onSave
}) {
    const [items, setItems] = useState(data)
    const [editingIndex, setEditingIndex] = useState(null)
    const [formData, setFormData] = useState({})
    const [isAdding, setIsAdding] = useState(false)

    // Sync internal state with data prop when it changes
    useEffect(() => {
        setItems(data)
    }, [data])

    const handleStartAdd = () => {
        const emptyForm = {}
        columns.forEach(col => emptyForm[col.key] = '')
        setFormData(emptyForm)
        setIsAdding(true)
        setEditingIndex(null)
    }

    const handleStartEdit = (index) => {
        setFormData(items[index])
        setEditingIndex(index)
        setIsAdding(false)
    }

    const handleCancel = () => {
        setEditingIndex(null)
        setIsAdding(false)
        setFormData({})
    }

    const handleSave = () => {
        let newItems = [...items]
        if (isAdding) {
            newItems.push(formData)
        } else if (editingIndex !== null) {
            newItems[editingIndex] = formData
        }
        setItems(newItems)
        onSave && onSave(newItems)
        handleCancel()
    }

    const handleDelete = (index) => {
        const newItems = items.filter((_, i) => i !== index)
        setItems(newItems)
        onSave && onSave(newItems)
    }

    const inputClasses = "w-full px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none transition-all duration-300 placeholder-slate-400 dark:placeholder-slate-500"

    return (
        <div className="glass-card bg-white dark:bg-white/5 border-none shadow-xl shadow-slate-900/5 mb-10 overflow-hidden group/array">
            <div className="px-8 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <Database size={16} />
                    </div>
                    <h3 className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.15em] text-[10px]">
                        {arrayName.replace(/_/g, ' ')}
                    </h3>
                </div>
                {!isAdding && editingIndex === null && (
                    <button
                        onClick={handleStartAdd}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                    >
                        <ListPlus size={14} /> {addLabel}
                    </button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/30 dark:bg-white/5 text-slate-400 dark:text-slate-500 font-black uppercase text-[9px] tracking-[0.2em] border-b border-slate-100 dark:border-white/10">
                        <tr>
                                        {columns.map(col => (
                                            <td key={col.key} className="px-6 py-3">
                                                {col.type === 'select' ? (
                                                    <select
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    >
                                                        <option value="">Select...</option>
                                                        {(col.options || []).map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : col.type === 'date' ? (
                                                    <input
                                                        type="date"
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    />
                                                ) : (
                                                    <input
                                                        type={col.type || 'text'}
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    />
                                                )}
                                            </td>
                                        ))}
                            <th className="px-8 py-4 text-right">Controls</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {items.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-white/5 group/row transition-colors">
                                {editingIndex === index ? (
                                    <>
                                        {columns.map(col => (
                                            <td key={col.key} className="px-6 py-3">
                                                {col.type === 'select' ? (
                                                    <select
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    >
                                                        <option value="">Select...</option>
                                                        {(col.options || []).map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : col.type === 'date' ? (
                                                    <input
                                                        type="date"
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    />
                                                ) : (
                                                    <input
                                                        type={col.type || 'text'}
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    />
                                                )}
                                            </td>
                                        ))}
                                        <td className="px-8 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={handleSave} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">
                                                    <Check size={14} />
                                                </button>
                                                <button onClick={handleCancel} className="p-2 bg-slate-400 text-white rounded-lg hover:bg-slate-500 transition-colors shadow-lg shadow-slate-400/20">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        {columns.map(col => (
                                            <td key={col.key} className="px-8 py-5 text-slate-600 dark:text-slate-300 font-bold tracking-tight">
                                                {item[col.key] || <span className="text-slate-300 dark:text-slate-700 italic font-medium">Undefined</span>}
                                            </td>
                                        ))}
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity translate-x-1 group-hover/row:translate-x-0 transition-transform duration-300">
                                                <button
                                                    onClick={() => handleStartEdit(index)}
                                                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors border border-transparent hover:border-primary/20"
                                                    title="Modify Entry"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(index)}
                                                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"
                                                    title="Prune Entry"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}

                        {isAdding && (
                            <tr className="bg-primary/5 dark:bg-primary/10 animate-in slide-in-from-right-4 duration-300">
                                {columns.map(col => (
                                    <td key={col.key} className="px-6 py-5">
                                                {col.type === 'select' ? (
                                                    <select
                                                        className={inputClasses}
                                                        value={formData[col.key] || ''}
                                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                                    >
                                                        <option value="">Select...</option>
                                                        {(col.options || []).map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                        {formData[col.key] && !(col.options || []).find(o => o.value === formData[col.key]) && (
                                                            <option value={formData[col.key]} className="text-amber-600">
                                                                ⚡ {formData[col.key]} (custom)
                                                            </option>
                                                        )}
                                                    </select>
                                        ) : col.type === 'date' ? (
                                            <input
                                                type="date"
                                                className={inputClasses}
                                                placeholder={col.placeholder || col.label}
                                                value={formData[col.key] || ''}
                                                onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                            />
                                        ) : (
                                            <input
                                                type={col.type || 'text'}
                                                className={inputClasses}
                                                placeholder={col.placeholder || col.label}
                                                value={formData[col.key] || ''}
                                                onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                            />
                                        )}
                                    </td>
                                ))}
                                <td className="px-8 py-5 text-right align-middle">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={handleSave} className="px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 font-black text-[9px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                                            <Check size={14} /> Commit
                                        </button>
                                        <button onClick={handleCancel} className="px-4 py-2 bg-slate-500 text-white rounded-xl hover:bg-slate-600 font-black text-[9px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-slate-500/20">
                                            <X size={14} /> Cancel
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {items.length === 0 && !isAdding && (
                            <tr>
                                <td colSpan={columns.length + 1} className="px-8 py-20 text-center text-slate-300 dark:text-slate-600">
                                    <div className="flex flex-col items-center gap-4 animate-in fade-in duration-1000">
                                        <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center border border-slate-100 dark:border-white/10">
                                            <Database size={32} className="opacity-20 dark:opacity-10" />
                                        </div>
                                        <p className="italic font-bold text-[10px] uppercase tracking-[0.2em]">{emptyMessage}</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
