import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { reportAPI } from '../api/client'

const ReportContext = createContext(null)

// Helper function to derive currency from country
const getCurrencyFromCountry = (country) => {
    if (!country) return 'USD'
    const lowerCountry = country.toLowerCase()
    if (lowerCountry.includes('united arab emirates') || lowerCountry.includes('uae') || lowerCountry.includes('emirates')) {
        return 'AED'
    }
    if (lowerCountry.includes('saudi') || lowerCountry.includes('ksa')) {
        return 'SAR'
    }
    if (lowerCountry.includes('kuwait')) {
        return 'KWD'
    }
    if (lowerCountry.includes('qatar')) {
        return 'QAR'
    }
    if (lowerCountry.includes('bahrain')) {
        return 'BHD'
    }
    if (lowerCountry.includes('oman')) {
        return 'OMR'
    }
    if (lowerCountry.includes('egypt')) {
        return 'EGP'
    }
    return 'USD'
}

const PAGE_FIELDS = {
     1: ['company_name', 'report_date', 'credit_rating', 'client_name'],
     2: ['client_name', 'client_reference', 'analyst_name', 'company_name'],
     3: ['executive_summary_text', 'credit_opinion_text', 'company_history_text'], // Dashboard/Exec combined
     4: ['executive_summary_text', 'credit_opinion_text', 'company_history_text', 'employee_count', 'employee_location', 'capital', 'annual_turnover'],
     5: [
         'company_name', 'cr_number', 'unified_number', 'company_type',
         'company_status', 'phone', 'email', 'country', 'phone_numbers',
         // Country-specific fields
         'show_egypt_fields', 'show_saudi_fields', 'show_uae_fields', 'show_zakat',
         'tax_registration_number', 'trade_license_number', 'tax_card_number',
         'social_insurance_number', 'gafi_registration', 'industrial_license_number',
         'import_license_number', 'export_license_number', 'lei_number',
         'other_registration_id',
         'trn_vat', 'ded_number', 'freezone_license',
         'gosi_registration', 'nitaqat_band', 'municipality_license',
         'zakat_certificate', 'zakat_number', 'zakat_status', 'zakat_alert',
         // Other registration fields
         'license_type', 'investment_license_no', 'issue_date', 'expiry_date',
         'auditor_name', 'license_alert', 'license_icon', 'tax_alert', 'tax_icon'
     ],
     6: ['capital', 'incorporation_date', 'registration_number'],
     // NOTE: former_* history fields are deliberately NOT tracked here. They are
     // optional (only present when a prior report existed), so counting them
     // would drop the completion percentage of every first-time report.
     7: ['parent_company', 'subsidiaries', 'affiliates'],
     8: ['industry', 'employee_count', 'employee_location', 'facilities_count', 'main_facility_location', 'markets_count', 'markets_regions', 'main_suppliers', 'key_customers'],
     9: ['primary_bank', 'total_banks', 'banking_notes'],
     10: ['revenue_1', 'cogs_1', 'total_assets_1', 'equity_1'],
     11: ['current_ratio', 'quick_ratio', 'debt_equity', 'gross_margin'],
     12: ['viability_meaning', 'delinquency_meaning', 'risk_level'],
     13: ['license_status', 'tax_status', 'lawsuit_count', 'judgment_count'],
     14: ['news_events'],
     15: ['industry', 'industry_name', 'market_size', 'industry_growth_rate'],
     16: ['credit_opinion_text', 'recommended_payment_terms', 'recommended_limit'],
     17: ['review_frequency', 'next_review_date', 'assigned_analyst'],
     18: ['data_quality_rating', 'data_limitations', 'data_source_analyst_comment'],
     19: ['analyst_name', 'analyst_email', 'analyst_phone'],
     20: ['company_name']
}

// The id a loaded report belongs to (GET /report/{id} returns it as report_id).
const idOf = (report) => (report ? String(report.report_id ?? report.id ?? '') : '')

const CONFLICT_MESSAGE =
    'Someone else changed this report while you were editing. It has been reloaded with ' +
    'their changes — please check the field and re-apply your edit.'

export function ReportProvider({ children }) {

    const [reportId, setReportId] = useState(
        () => {
            const storedId = localStorage.getItem('current_report_id') || null
            // Clean up malformed IDs with **** suffix
            if (storedId && storedId.includes('****')) {
                localStorage.removeItem('current_report_id')
                return null
            }
            return storedId
        }
    )
    const [report, setReport] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [extractionStats, setExtractionStats] = useState(null)
    // Autosave state shown in the editor header: pending edits and the last failure.
    const [pendingSaves, setPendingSaves] = useState(0)
    const [saveError, setSaveError] = useState(null)

    // The id whose data `report` may hold. Responses for any other id are dropped,
    // so opening report A then B never shows (or writes) A's data under B.
    const currentIdRef = useRef(reportId)

    /* Per-report edit state:
         updatedAt — the server's updated_at as this browser last saw it, sent as
                     last_known_updated_at so a concurrent edit by someone else 409s
         queue     — a promise chain. Edits to one report run strictly one after
                     another, each with the updated_at the previous one returned, so
                     our own debounced saves never 409 each other. */
    const editStateRef = useRef({})
    const editState = (id) => {
        if (!editStateRef.current[id]) editStateRef.current[id] = { updatedAt: null, queue: Promise.resolve() }
        return editStateRef.current[id]
    }

    const enqueue = (id, task) => {
        const st = editState(id)
        const run = st.queue.then(task, task)
        st.queue = run.catch(() => {})
        return run
    }

    // Save reportId to localStorage. Switching to a different report clears the
    // one in memory immediately — never render A's fields under B's URL.
    const saveReportId = useCallback((id) => {
        const next = id ? String(id) : null
        if (currentIdRef.current !== next) {
            currentIdRef.current = next
            setReport(null)
            setExtractionStats(null)
            setError(null)
            setSaveError(null)
            setLoading(false)
        }
        setReportId(next)
        if (next) {
            localStorage.setItem('current_report_id', next)
        } else {
            localStorage.removeItem('current_report_id')
        }
    }, [])

    // Fetch one report and, if it is still the current one, show it.
    const fetchReport = useCallback(async (id) => {
        const res = await reportAPI.getReport(id)
        const data = res.data
        editState(id).updatedAt = data?.updated_at || null
        if (currentIdRef.current === id) {
            setReport(data)
            setExtractionStats(data?.extraction_stats || null)
        }
        return data
    }, [])

    // Load report from backend. Runs behind any queued edits for the same report,
    // so the copy it shows already includes them.
    const loadReport = useCallback(async (id) => {
        const targetId = id ? String(id) : currentIdRef.current
        if (!targetId) {
            setLoading(false)
            return null
        }
        if (targetId !== currentIdRef.current) saveReportId(targetId)

        setLoading(true)
        setError(null)
        try {
            return await enqueue(targetId, () => fetchReport(targetId))
        } catch (err) {
            console.error('Failed to load report:', err)
            if (currentIdRef.current === targetId) setError(err.message || 'Failed to load report')
            return null
        } finally {
            if (currentIdRef.current === targetId) setLoading(false)
        }
    }, [saveReportId, fetchReport]) // eslint-disable-line react-hooks/exhaustive-deps

    /* Run one write for report `id` through its queue. On failure the report is
       reloaded (so the screen shows what the server really holds) and the error is
       RE-THROWN — callers (FieldInput's "Saved" tick, QA's "applied" marks) must
       only report success when the write actually happened. */
    const runEdit = useCallback((id, request) => {
        setPendingSaves(n => n + 1)
        const run = enqueue(id, async () => {
            const st = editState(id)
            try {
                const res = await request(st.updatedAt)
                // A response without updated_at (older backend) leaves us unable to
                // track the version — skip the check next time rather than 409 on
                // our own write.
                st.updatedAt = res?.data?.updated_at || null
                if (currentIdRef.current === id) setSaveError(null)
                return res
            } catch (err) {
                const conflict = err?.status === 409
                try { await fetchReport(id) } catch { /* keep the original error */ }
                const message = conflict ? CONFLICT_MESSAGE : `Save failed: ${err?.message || 'unknown error'}`
                if (currentIdRef.current === id) setSaveError(message)
                const wrapped = new Error(message)
                wrapped.status = err?.status
                wrapped.conflict = conflict
                wrapped.cause = err
                throw wrapped
            }
        }).finally(() => setPendingSaves(n => Math.max(0, n - 1)))
        // Fire-and-forget callers (toggles, effects) still see the failure in the
        // saveError banner; this only stops an "unhandled rejection" console error.
        // Callers that await still receive the rejection.
        run.catch(() => {})
        return run
    }, [fetchReport]) // eslint-disable-line react-hooks/exhaustive-deps

    // Apply a local change only if `id` is still the report on screen.
    const patchLocal = (id, fn) => {
        setReport(prev => (prev && idOf(prev) === id ? fn(prev) : prev))
    }

    // Get single field value
    const getFieldValue = useCallback((fieldName) => {
        if (!report?.fields) return ''
        const field = report.fields[fieldName]
        if (!field) {
            // console.warn(`[ReportContext] Field "${fieldName}" not found in report`)
            return ''
        }
        if (typeof field === 'object') {
            return field.value ?? ''
        }
        return field ?? ''
    }, [report])

    // Get field confidence
    const getFieldConfidence = useCallback((fieldName) => {
        if (!report?.fields) return 'missing'
        const field = report.fields[fieldName]
        if (!field) return 'missing'
        if (typeof field === 'object') {
            return field.confidence ?? 'missing'
        }
        return 'missing'
    }, [report])

    // Check if field is locked
    // Fields with source 'easy_way_import' should never be locked
    const isFieldLocked = useCallback((fieldName) => {
        if (!report?.fields) return false
        const field = report.fields[fieldName]
        if (!field) return false
        if (typeof field === 'object') {
            // Never lock fields that were imported via easy_way_import
            if (field.source === 'easy_way_import') return false
            return field.locked ?? false
        }
        return false
    }, [report])

    // Update single field
    const updateField = useCallback((fieldName, value) => {
        const id = reportId
        if (!id) return Promise.resolve()

        // Optimistic update
        patchLocal(id, prev => ({
            ...prev,
            fields: {
                ...prev.fields,
                [fieldName]: {
                    ...(prev.fields?.[fieldName] || {}),
                    value: value,
                    confidence: 'high',
                    source: 'user'
                }
            }
        }))

        return runEdit(id, (lastKnown) => reportAPI.updateField(id, fieldName, value, lastKnown))
    }, [reportId, runEdit]) // eslint-disable-line react-hooks/exhaustive-deps

    // Delete a field (set to empty string)
    const deleteField = useCallback((fieldName) => {
        const id = reportId
        if (!id) return Promise.resolve()

        // Optimistic update - remove field or set to empty
        patchLocal(id, prev => {
            const newFields = { ...prev.fields }
            if (newFields[fieldName]) {
                newFields[fieldName] = {
                    ...newFields[fieldName],
                    value: '',
                    confidence: 'missing',
                    source: 'user'
                }
            }
            return { ...prev, fields: newFields }
        })

        return runEdit(id, (lastKnown) => reportAPI.updateField(id, fieldName, '', lastKnown))
    }, [reportId, runEdit]) // eslint-disable-line react-hooks/exhaustive-deps

    // Delete all fields for a page — one bulk write, one version check.
    const deletePage = useCallback((pageId) => {
        const id = reportId
        if (!id) return Promise.resolve()

        // Only fields the report actually holds: the server rejects unknown names.
        const present = report && idOf(report) === id ? (report.fields || {}) : {}
        const fieldsToDelete = (PAGE_FIELDS[pageId] || []).filter(f => f in present)
        if (fieldsToDelete.length === 0) return Promise.resolve()

        // Optimistic update
        patchLocal(id, prev => {
            const newFields = { ...prev.fields }
            fieldsToDelete.forEach(f => {
                if (newFields[f]) {
                    newFields[f] = {
                        ...newFields[f],
                        value: '',
                        confidence: 'missing',
                        source: 'user'
                    }
                }
            })
            return { ...prev, fields: newFields }
        })

        const payload = Object.fromEntries(fieldsToDelete.map(f => [f, '']))
        return runEdit(id, (lastKnown) => reportAPI.updateFieldsBulk(id, payload, lastKnown))
    }, [reportId, report, runEdit]) // eslint-disable-line react-hooks/exhaustive-deps

    // Update array
    const updateArray = useCallback((arrayName, data) => {
        const id = reportId
        if (!id) return Promise.resolve()

        // Optimistic update
        patchLocal(id, prev => ({
            ...prev,
            arrays: {
                ...prev.arrays,
                [arrayName]: data
            }
        }))

        return runEdit(id, (lastKnown) => reportAPI.updateArray(id, arrayName, data, lastKnown))
    }, [reportId, runEdit]) // eslint-disable-line react-hooks/exhaustive-deps

    // Trigger recalculation
    const recalculate = useCallback(async () => {
        if (!reportId) return
        try {
            const res = await reportAPI.recalculate(reportId)
            // Reload full report to get updated calcs
            await loadReport()
            return res.data
        } catch (err) {
            console.error('Recalculate failed:', err)
        }
    }, [reportId, loadReport])

    // Get array data
    const getArray = useCallback((arrayName) => {
        return report?.arrays?.[arrayName] || []
    }, [report])

    // Get hidden fields list (user-hidden via eye icon)
    const getHiddenFields = useCallback(() => {
        return getArray('hidden_fields') || []
    }, [report])

    // Check if a field is visible (not hidden)
    const isFieldVisible = useCallback((fieldName) => {
        return !getHiddenFields().includes(fieldName)
    }, [report])

    // Count fields by confidence
    const getFieldCounts = useCallback(() => {
        if (!report?.fields) return {}
        const counts = {
            high: 0, medium: 0,
            calculated: 0, missing: 0,
            system: 0, user: 0
        }
        Object.values(report.fields).forEach(field => {
            if (typeof field === 'object' && field) {
                const conf = field.confidence || 'missing'
                const src = field.source || ''
                if (conf === 'missing') counts.missing++
                else if (conf === 'calculated') counts.calculated++
                else if (conf === 'high' && src === 'system') counts.system++
                else if (conf === 'high' && src === 'user') counts.user++
                else if (conf === 'high') counts.high++
                else if (conf === 'medium') counts.medium++
            }
        })
        return counts
    }, [report])

    /* Has anything actually been extracted into this report?
       `start_company_work` (backend/api/orders.py) seeds a handful of fields
       from the order the moment an analyst clicks Start — company_name, country,
       cr_number, client_name, analyst_name, report_date, current_year — all
       written with source "system". That is ~10% of the tracked fields, so a
       never-extracted report reads as "10% complete" when it is in fact empty.
       Keying on the source rather than a hardcoded field list means this keeps
       working if the backend seeds more fields later. */
    const hasRealData = useCallback(() => {
        const fields = report?.fields || {}
        for (const data of Object.values(fields)) {
            const isObj = typeof data === 'object' && data !== null
            if (isObj && data.source === 'system') continue
            const value = isObj ? data.value : data
            if (value !== null && value !== undefined && String(value).trim() !== '') return true
        }
        const arrays = report?.arrays || {}
        for (const list of Object.values(arrays)) {
            if (Array.isArray(list) && list.length > 0) return true
        }
        return false
    }, [report])

    // Get overall completion percentage based on tracked fields
    const getCompletionPercentage = useCallback(() => {
        let total = 0
        let filled = 0
        Object.values(PAGE_FIELDS).forEach(fields => {
            fields.forEach(f => {
                total++
                // Check arrays first
                const arrayData = report?.arrays?.[f]
                if (arrayData && Array.isArray(arrayData) && arrayData.length > 0) {
                    filled++
                    return
                }
                // Check regular fields
                const data = report?.fields?.[f]
                const value = typeof data === 'object' ? data?.value : data
                if (value && String(value).trim() !== '') {
                    filled++
                }
            })
        })
        return total > 0 ? Math.round((filled / total) * 100) : 100
    }, [report])

    // Clear current report
    const clearReport = useCallback(() => {
        saveReportId(null)
        setReport(null)
        setError(null)
        setExtractionStats(null)
        setSaveError(null)
    }, [saveReportId])

    const clearSaveError = useCallback(() => setSaveError(null), [])

    // Get effective currency - from field or derived from country
    const getEffectiveCurrency = useCallback(() => {
        const currency = getFieldValue('currency')
        if (currency) return currency
        const country = getFieldValue('country')
        return getCurrencyFromCountry(country)
    }, [report])

    const contextValue = useMemo(() => ({
        reportId,
        report,
        loading,
        error,
        extractionStats,
        pendingSaves,
        saveError,
        clearSaveError,
        saveReportId,
        loadReport,
        getFieldValue,
        getFieldConfidence,
        isFieldLocked,
        updateField,
        deleteField,
        deletePage,
        updateArray,
        recalculate,
        getArray,
        getFieldCounts,
        getCompletionPercentage,
        hasRealData,
        clearReport,
        setError,
        getEffectiveCurrency,
    }), [
        reportId, report, loading, error, extractionStats, pendingSaves, saveError,
        clearSaveError, saveReportId, loadReport, getFieldValue, getFieldConfidence,
        isFieldLocked, updateField, deleteField, deletePage, updateArray, recalculate,
        getArray, getFieldCounts, getCompletionPercentage, hasRealData, clearReport,
        getEffectiveCurrency,
    ])

    return (
        <ReportContext.Provider value={contextValue}>
            {children}
        </ReportContext.Provider>
    )
}

export function useReport() {
    const context = useContext(ReportContext)
    if (!context) {
        throw new Error('useReport must be used within ReportProvider')
    }
    return context
}

export default ReportContext
