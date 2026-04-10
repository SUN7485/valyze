import React, { useState, useEffect, useRef } from 'react'
import { useReport } from '../context/ReportContext'
import ConfidenceBadge from './ConfidenceBadge'
import { Trash2, Eye, EyeOff, Info, Wand2, ShieldCheck, Lock, CheckCircle, Activity, AlertTriangle } from 'lucide-react'

export default function FieldInput({
    label, fieldName, type = 'text',
    options = [], placeholder = '',
    required = false, helpText = '',
    onAfterChange = null,
    canDelete = false,
    compact = false,
    fallbackFields = []
}) {
    const {
        getFieldValue,
        getFieldConfidence,
        isFieldLocked,
        updateField,
        deleteField,
        getArray,
        updateArray,
        report
    } = useReport()

    const value = getFieldValue(fieldName) || fallbackFields.reduce((acc, f) => acc || getFieldValue(f), '')
    const confidence = getFieldConfidence(fieldName) || fallbackFields.reduce((acc, f) => acc === 'missing' ? getFieldConfidence(f) : acc, getFieldConfidence(fieldName))
    const fieldSource = report?.fields?.[fieldName]?.source || fallbackFields.reduce((acc, f) => acc || report?.fields?.[f]?.source, '')
    const locked = isFieldLocked(fieldName)
    const hiddenFields = getArray('hidden_fields') || []
    const isHidden = hiddenFields.includes(fieldName)

    const [localValue, setLocalValue] = useState(value)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const debounceRef = useRef(null)

    useEffect(() => {
        setLocalValue(value)
    }, [value])

    const handleChange = (newValue) => {
        setLocalValue(newValue)
        setSaved(false)

        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
        }

        debounceRef.current = setTimeout(async () => {
            setSaving(true)
            try {
                await updateField(fieldName, newValue)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
                if (onAfterChange) onAfterChange(newValue)
            } catch (err) {
                console.error('Save failed:', err)
            } finally {
                setSaving(false)
            }
        }, 800)
    }

    const borderColor = {
        high: 'border-emerald-500/30 ring-emerald-500/10',
        medium: 'border-amber-500/30 ring-amber-500/10',
        missing: 'border-rose-500/30 ring-rose-500/10',
        calculated: 'border-primary/30 ring-primary/10',
        user: 'border-emerald-500/30 ring-emerald-500/10',
        system: 'border-[var(--color-border)] dark:border-white/10 ring-slate-400/5'
    }[confidence] || 'border-[var(--color-border)] dark:border-white/10 ring-slate-400/5'

    const handleToggleHide = () => {
        const newHidden = isHidden
            ? hiddenFields.filter(f => f !== fieldName)
            : [...hiddenFields, fieldName]
        updateArray('hidden_fields', newHidden)
    }

    const inputClasses = `
        w-full ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'} bg-[var(--color-background)] dark:bg-white/5 
        border-2 ${borderColor}
        ${compact ? 'rounded-xl' : 'rounded-xl'} text-[var(--color-text)] dark:text-white 
        focus:bg-[var(--color-surface)] dark:focus:bg-white/10 focus:ring-2 focus:ring-primary/20 
        focus:border-primary outline-none transition-all duration-200
        placeholder-[var(--color-text-muted)] dark:placeholder-slate-500
        ${isHidden ? 'opacity-40 grayscale-[0.5]' : ''}
        ${locked ? 'bg-[var(--color-border-soft)] dark:bg-white/5 cursor-not-allowed border-dashed' : ''}
    `

    if (locked) {
        return (
            <div className={`${compact ? 'mb-3' : 'mb-6'} group animate-in fade-in slide-in-from-top-2 duration-500`}>
                <div className="flex items-center justify-between mb-2 px-1">
                    <label className={`text-[9px] font-bold text-[var(--color-text-muted)] dark:text-slate-500 uppercase ${compact ? 'tracking-wider' : 'tracking-wider'} flex items-center gap-2`}>
                        <Lock size={11} className="text-primary/50" />
                        {label}
                    </label>
                    <ConfidenceBadge confidence={confidence} fieldSource={fieldSource} />
                </div>
                <div className={`${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'} bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 dark:border-primary/30 border-dashed ${compact ? 'rounded-xl' : 'rounded-xl'} 
                                text-[var(--color-text)] dark:text-white flex justify-between items-center group/locked`}>
                    <span className="font-semibold text-sm tracking-tight">{localValue || 'SYSTEM N/A'}</span>
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={13} className="text-primary opacity-40 group-hover/locked:opacity-100 transition-opacity" />
                        <span className="text-[8px] uppercase font-bold tracking-wider text-primary opacity-40 group-hover/locked:opacity-100 transition-opacity">
                            AI Computed
                        </span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={`${compact ? 'mb-3' : 'mb-6'} transition-all duration-300 ${isHidden ? 'opacity-60' : ''} group`}>
            {/* Header / Info Row */}
            <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2.5">
                    <label className={`text-[9px] font-bold uppercase ${compact ? 'tracking-wider' : 'tracking-wider'} transition-colors
                        ${isHidden ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-muted)] dark:text-slate-400 group-focus-within:text-primary'}`}>
                        {label}
                        {required && <span className="text-rose-500 ml-0.5 animate-pulse">*</span>}
                    </label>
                    
                    <button
                        type="button"
                        onClick={handleToggleHide}
                        title={isHidden ? "Include field in PDF" : "Exclude field from PDF"}
                        className={`p-1 rounded-md transition-all duration-200 transform
                            ${isHidden 
                                ? 'bg-rose-500/10 text-rose-500 hover:scale-110' 
                                : 'bg-[var(--color-border-soft)] dark:bg-white/5 text-[var(--color-text-muted)] hover:text-primary hover:scale-110'}`}
                    >
                        {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>

                    {isHidden && (
                        <span className="text-[8px] uppercase font-bold tracking-wider text-rose-500 animate-pulse">
                            Suppressed from Report
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        {saving && (
                            <div className="flex items-center gap-1 text-[8px] font-bold text-[var(--color-text-muted)] dark:text-slate-500 animate-pulse uppercase tracking-wider">
                                <Activity size={9} /> Syncing
                            </div>
                        )}
                        {saved && (
                            <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-0.5">
                                <CheckCircle size={9} /> Saved
                            </div>
                        )}
                    </div>
                    <ConfidenceBadge confidence={confidence} fieldSource={fieldSource} />
                </div>
            </div>

            {/* Input Element */}
            <div className="relative">
                {type === 'textarea' ? (
                    <textarea
                        value={localValue}
                        onChange={e => handleChange(e.target.value)}
                        placeholder={placeholder}
                        rows={4}
                        className={inputClasses}
                    />
                ) : type === 'select' ? (
                    <select
                        value={localValue}
                        onChange={e => handleChange(e.target.value)}
                        className={inputClasses}
                    >
                        <option value="">Select data point...</option>
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                        {localValue && !options.find(o => o.value === localValue) && (
                            <option value={localValue} className="text-amber-600 dark:text-amber-400">
                                {localValue} (custom)
                            </option>
                        )}
                    </select>
                ) : (
                    <input
                        type={type}
                        value={localValue}
                        onChange={e => handleChange(e.target.value)}
                        placeholder={placeholder}
                        className={inputClasses}
                    />
                )}
                
                {/* Floating Indicators */}
                {!isHidden && !locked && fieldSource === 'ai' && (
                    <div className="absolute right-3 bottom-3 flex items-center gap-1 
                                    text-[8px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] dark:text-slate-700
                                    pointer-events-none group-focus-within:opacity-0 transition-opacity">
                        <Wand2 size={11} /> Verified Extraction
                    </div>
                )}
            </div>

            {/* Footer / Meta Row */}
            <div className="flex items-center justify-between mt-1.5 px-1">
                <div className="flex-1">
                    {helpText && (
                        <p className="text-[10px] text-[var(--color-text-muted)] dark:text-slate-500 flex items-center gap-1.5 font-medium italic">
                            <Info size={11} className="text-primary/30" />
                            {helpText}
                        </p>
                    )}
                    
                    {confidence === 'medium' && (
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-1 flex items-center gap-1.5 animate-pulse">
                            <AlertTriangle size={11} />
                            Heuristic Warning: Extraction Integrity Pending
                        </p>
                    )}
                </div>

                {canDelete && !localValue && (
                    <button
                        type="button"
                        onClick={() => deleteField(fieldName)}
                        className="text-[8px] font-bold text-rose-500 hover:text-rose-600 
                                   uppercase tracking-wider flex items-center gap-1.5 
                                   px-2.5 py-1 bg-rose-50 dark:bg-rose-500/10 rounded-md transition-all
                                   active:scale-95"
                    >
                        <Trash2 size={10} /> Prune Void Field
                    </button>
                )}
            </div>
        </div>
    )
}
