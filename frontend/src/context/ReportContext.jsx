import React, { createContext, useContext, useState, useCallback } from 'react'
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

    // Save reportId to localStorage
    const saveReportId = useCallback((id) => {
        setReportId(id)
        if (id) {
            localStorage.setItem('current_report_id', id)
        } else {
            localStorage.removeItem('current_report_id')
        }
    }, [])

    // Load report from backend
    const loadReport = useCallback(async (id) => {
        const targetId = id || reportId
        if (!targetId) {
            setLoading(false)
            return null
        }

        setLoading(true)
        setError(null)
        try {
            const res = await reportAPI.getReport(targetId)
            console.log('[ReportContext] Report data loaded:', res.data)
            console.log('[ReportContext] Total fields:', Object.keys(res.data.fields || {}).length)
            const allFields = res.data.fields || {}
            console.log('[ReportContext] Cash flow fields:', Object.entries(allFields).filter(([k]) =>
                k.includes('cash') || k.includes('flow') || k.includes('cfo') || k.includes('cfi') || k.includes('cff') || k.includes('operating') || k.includes('investing') || k.includes('financing')
            ).map(([k, v]) => ({ name: k, value: v?.value, source: v?.source })))
            console.log('[ReportContext] All field names:', Object.keys(allFields).sort())
            setReport(res.data)
            setExtractionStats(res.data.extraction_stats)
            return res.data
        } catch (err) {
            console.error('Failed to load report:', err)
            setError(err.message || 'Failed to load report')
            return null
        } finally {
            setLoading(false)
        }
    }, [reportId])

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
            console.log(`isFieldLocked(${fieldName}): source=${field.source}, locked=${field.locked}`)
            // Never lock fields that were imported via easy_way_import
            if (field.source === 'easy_way_import') return false
            return field.locked ?? false
        }
        return false
    }, [report])

    // Update single field
    const updateField = useCallback(async (fieldName, value) => {
        if (!reportId) return

        // Optimistic update
        setReport(prev => {
            if (!prev) return prev
            return {
                ...prev,
                fields: {
                    ...prev.fields,
                    [fieldName]: {
                        ...(prev.fields[fieldName] || {}),
                        value: value,
                        confidence: 'high',
                        source: 'user'
                    }
                }
            }
        })

        try {
            await reportAPI.updateField(reportId, fieldName, value)
        } catch (err) {
            console.error('Field update failed:', err)
            // Reload to get correct state
            await loadReport()
        }
    }, [reportId, loadReport])

    // Delete a field (set to empty string)
    const deleteField = useCallback(async (fieldName) => {
        if (!reportId) return

        // Optimistic update - remove field or set to empty
        setReport(prev => {
            if (!prev) return prev
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

        try {
            await reportAPI.updateField(reportId, fieldName, '')
        } catch (err) {
            console.error('Field delete failed:', err)
            await loadReport()
        }
    }, [reportId, loadReport])

    // Delete all fields for a page
    const deletePage = useCallback(async (pageId) => {
        if (!reportId) return

        const fieldsToDelete = PAGE_FIELDS[pageId] || []
        if (fieldsToDelete.length === 0) return

        // Optimistic update
        setReport(prev => {
            if (!prev) return prev
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

        try {
            // Delete each field
            for (const field of fieldsToDelete) {
                await reportAPI.updateField(reportId, field, '')
            }
        } catch (err) {
            console.error('Page delete failed:', err)
            await loadReport()
        }
    }, [reportId, loadReport])

    // Update array
    const updateArray = useCallback(async (arrayName, data) => {
        if (!reportId) return

        // Optimistic update
        setReport(prev => {
            if (!prev) return prev
            return {
                ...prev,
                arrays: {
                    ...prev.arrays,
                    [arrayName]: data
                }
            }
        })

        try {
            await reportAPI.updateArray(reportId, arrayName, data)
        } catch (err) {
            console.error('Array update failed:', err)
            await loadReport()
        }
    }, [reportId, loadReport])

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
    }, [saveReportId])

    // Get effective currency - from field or derived from country
    const getEffectiveCurrency = useCallback(() => {
        const currency = getFieldValue('currency')
        if (currency) return currency
        const country = getFieldValue('country')
        return getCurrencyFromCountry(country)
    }, [report])

    const contextValue = {
        reportId,
        report,
        loading,
        error,
        extractionStats,
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
        clearReport,
        setError,
        getEffectiveCurrency
    }

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
