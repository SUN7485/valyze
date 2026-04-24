// ============ P05_CompanyProfile.jsx ============
import React, { useState, useEffect } from 'react'
import { useReport } from '../context/ReportContext'
import FieldInput from '../components/FieldInput'
import PhoneNumbersEditor from '../components/PhoneNumbersEditor'
import { X } from 'lucide-react'

const COUNTRY_OPTIONS = [
  { value: 'Egypt',        label: '🇪🇬 Egypt' },
  { value: 'Saudi Arabia', label: '🇸🇦 Saudi Arabia (KSA)' },
  { value: 'UAE',          label: '🇦 United Arab Emirates' },
  { value: 'United Arab Emirates', label: '🇦 United Arab Emirates (full name)' },
  { value: 'Other',        label: '🌍 Other' },
]

export default function P05_CompanyProfile() {
  const { getFieldValue, updateField, report, getArray } = useReport()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!report || initialized) return
    
    const country = getFieldValue('country') || ''
    
    // Auto-detect country flags when loading existing data
    const shouldShowEgypt = country === 'Egypt'
    const shouldShowSaudi = country === 'Saudi Arabia'
    const shouldShowUae = country === 'UAE' || country === 'United Arab Emirates'
    
    if (shouldShowEgypt && !getFieldValue('show_egypt_fields')) {
      updateField('show_egypt_fields', true)
    }
    if (shouldShowSaudi && !getFieldValue('show_saudi_fields')) {
      updateField('show_saudi_fields', true)
    }
    if (shouldShowUae && !getFieldValue('show_uae_fields')) {
      updateField('show_uae_fields', true)
    }
    if (shouldShowSaudi && !getFieldValue('show_zakat')) {
      updateField('show_zakat', true)
    }
    
    setInitialized(true)
  }, [report, initialized])

  const handleCountryChange = (val) => {
    updateField('country', val)
    updateField('show_egypt_fields',  val === 'Egypt')
    updateField('show_saudi_fields',  val === 'Saudi Arabia')
    updateField('show_uae_fields',    val === 'UAE' || val === 'United Arab Emirates')
    updateField('show_zakat',         val === 'Saudi Arabia')
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-gray-100 dark:border-white/5 pb-4">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Company Profile</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
          Legal identity, registration, compliance status, and contact details. 
          Registration Details appear on the same PDF page.
        </p>
      </div>

      {/* Company Identity */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Company Identity
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <FieldInput label="Company Name"        fieldName="company_name" type="text" required />
          <FieldInput label="Legal Name"          fieldName="legal_name"   type="text" />
          <FieldInput label="Trade / Brand Names" fieldName="trade_names"  type="text" placeholder="e.g. ACME, ACG" />
          <FieldInput 
            label="Legal Entity Type" 
            fieldName="company_type" 
            type="select" 
            options={[
              { value: 'LLC',         label: 'LLC – Limited Liability Company' },
              { value: 'JSC',         label: 'JSC – Joint Stock Company' },
              { value: 'Sole',        label: 'Sole Proprietorship' },
              { value: 'Partnership', label: 'Partnership' },
              { value: 'Branch',      label: 'Foreign Branch' },
              { value: 'Free Zone Establishment with Limited Liability', label: 'Free Zone Establishment (FZE)' },
              { value: 'FZE',         label: 'FZE – Free Zone Establishment' },
              { value: 'Free Zone',   label: 'Free Zone Company' },
              { value: 'Other',       label: 'Other' },
            ]}
          />
          <FieldInput label="Industry Sector"     fieldName="industry"            type="text" />
          <FieldInput label="SIC Codes"           fieldName="sic_codes"           type="text" placeholder="e.g. 5411" />
          <FieldInput label="Incorporation Date"  fieldName="incorporation_date"  type="date" />
          <FieldInput label="Duration"            fieldName="company_duration"    type="text" placeholder="e.g. 25 years (until 2043)" />
          <FieldInput label="Registered Capital"  fieldName="capital"             type="text" placeholder="e.g. USD 5,000,000" />
        </div>
      </div>

      {/* Operating Status */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Operating Status
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <FieldInput 
            label="Company Status" 
            fieldName="company_status" 
            type="select"
            options={[
              { value: 'Active',             label: 'Active' },
              { value: 'Inactive',           label: 'Inactive' },
              { value: 'Suspended',          label: 'Suspended' },
              { value: 'Under Liquidation',  label: 'Under Liquidation' },
            ]}
          />
           <FieldInput 
            label="Status Badge Class" 
            fieldName="company_status_badge" 
            type="select"
            options={[
              { value: 'low',    label: 'Green (low)' },
              { value: 'medium', label: 'Orange (medium)' },
              { value: 'high',   label: 'Red (high)' },
            ]}
          />
          <FieldInput label="License Status"  fieldName="license_status" type="select"
            options={[
              { value: 'Valid',            label: 'Valid' },
              { value: 'Expired',          label: 'Expired' },
              { value: 'Suspended',        label: 'Suspended' },
              { value: 'Pending Renewal',  label: 'Pending Renewal' },
              { value: 'Active and valid', label: 'Active and Valid' },
              { value: 'Active',           label: 'Active' },
            ]}
          />
          <FieldInput label="License Expiry"  fieldName="expiry_date"  type="date" />
          <FieldInput label="License Alert Class" fieldName="license_alert" type="select"
            options={[
              { value: 'success', label: '🟢 Success' },
              { value: 'warning', label: '🟠 Warning' },
              { value: 'danger',  label: '🔴 Danger' },
            ]}
          />
          <FieldInput label="License Alert Icon" fieldName="license_icon" type="text" placeholder="e.g. ✅" />
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Contact & Presence
        </h3>
        <div className="grid grid-cols-1 gap-4 mb-6">
          <FieldInput label="Registered Address"    fieldName="company_address"    type="textarea" rows={2} />
          <FieldInput label="Headquarters Address"  fieldName="headquarters_address" type="textarea" rows={2} />
        </div>

        {/* Phone Numbers */}
        <div className="mb-6">
          <PhoneNumbersEditor
            data={getArray('phone_numbers')}
            onSave={(newItems) => updateArray('phone_numbers', newItems)}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <FieldInput label="Fax"               fieldName="fax"     type="text" />
          <FieldInput label="Official Email"    fieldName="email"   type="email" />
          <FieldInput label="Corporate Website" fieldName="website" type="text" placeholder="https://..." />
        </div>
      </div>

      {/* External Auditor & Tax */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
          Auditor & Tax Compliance
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <FieldInput label="External Auditor"      fieldName="auditor_name" type="text" placeholder="e.g. KPMG" />
          <FieldInput 
            label="Tax Compliance Status" 
            fieldName="tax_status" 
            type="select"
            options={[
              { value: 'Compliant',     label: 'Compliant' },
              { value: 'Non-Compliant', label: 'Non-Compliant' },
              { value: 'Under Review',  label: 'Under Review' },
              { value: 'Exempt',        label: 'Exempt' },
              { value: 'VAT registered and compliant', label: 'VAT Registered & Compliant' },
            ]}
          />
          <FieldInput label="Tax Alert Class" fieldName="tax_alert" type="select"
            options={[
              { value: 'success', label: '🟢 Success' },
              { value: 'warning', label: '🟠 Warning' },
              { value: 'danger',  label: '🔴 Danger' },
            ]}
          />
          <FieldInput label="Tax Alert Icon" fieldName="tax_icon" type="text" placeholder="e.g. ✅" />
        </div>
      </div>

      {/* ── REGISTRATION DETAILS ── */}
      <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
        <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
          Registration Details
        </h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-6">
          These fields appear in the Registration Details grid on PDF Page 4.
        </p>

        <div className="grid grid-cols-2 gap-8">
          {/* Main Select */}
          <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10">
            <FieldInput
              label="Select Country Context"
              fieldName="country"
              type="select"
              options={COUNTRY_OPTIONS}
              onChange={(e) => handleCountryChange(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <FieldInput label="Registration Number"  fieldName="cr_number" type="text" />
            <FieldInput label="Comm. Reg. Date"      fieldName="issue_date"     type="date" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-8">
          <FieldInput label="Unified Number"           fieldName="unified_number" type="text" />
          <FieldInput label="License Type"             fieldName="license_type" type="text" />
          <FieldInput label="Investment License No."   fieldName="investment_license_no" type="text" />
        </div>

        {/* Dynamic Country Specifics */}
        <div className="mt-8 space-y-6">
          {getFieldValue('show_uae_fields') && (
            <div className="p-6 bg-blue-50/50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20 animate-in slide-in-from-top-2 relative">
              <button
                onClick={() => updateField('show_uae_fields', false)}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                title="Hide UAE section"
              >
                <X size={16} />
              </button>
              <h4 className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-4">UAE Specific Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Trade License No."   fieldName="trade_license_number" type="text" />
                <FieldInput label="TRN (VAT)"           fieldName="trn_vat" type="text" />
                <FieldInput label="DED Number"          fieldName="ded_number" type="text" />
                <FieldInput label="Free Zone License"   fieldName="freezone_license" type="text" />
              </div>
            </div>
          )}
          {getFieldValue('show_saudi_fields') && (
            <div className="p-6 bg-green-50/50 dark:bg-emerald-500/10 rounded-2xl border border-green-100 dark:border-emerald-500/20 animate-in slide-in-from-top-2 relative">
              <button
                onClick={() => updateField('show_saudi_fields', false)}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
                title="Hide KSA section"
              >
                <X size={16} />
              </button>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black text-green-700 dark:text-emerald-400 uppercase tracking-widest">KSA Specific Details</h4>
                <button
                  onClick={() => updateField('show_zakat', !getFieldValue('show_zakat'))}
                  className="px-3 py-1 text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded-lg hover:bg-green-300 dark:hover:bg-green-700 transition-colors"
                >
                  {getFieldValue('show_zakat') ? 'Hide Zakat' : 'Show Zakat'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="GOSI Registration"  fieldName="gosi_registration"  type="text" />
                <FieldInput label="Nitaqat Band"      fieldName="nitaqat_band"      type="text" />
                <FieldInput label="Municipality License" fieldName="municipality_license" type="text" />
                {getFieldValue('show_zakat') && (
                  <>
                    <FieldInput label="Zakat Certificate" fieldName="zakat_certificate" type="text" />
                    <FieldInput label="Zakat Number" fieldName="zakat_number" type="text" />
                    <FieldInput label="Zakat Status" fieldName="zakat_status" type="select" options={[
                      { value: 'Compliant', label: 'Compliant' },
                      { value: 'Non-Compliant', label: 'Non-Compliant' },
                      { value: 'Exempt', label: 'Exempt' },
                      { value: 'Under Review', label: 'Under Review' },
                    ]} />
                    <FieldInput label="Zakat Alert Class" fieldName="zakat_alert" type="select" options={[
                      { value: 'success', label: '🟢 Success' },
                      { value: 'warning', label: '🟠 Warning' },
                      { value: 'danger', label: '🔴 Danger' },
                    ]} />
                  </>
                )}
              </div>
            </div>
          )}

          {getFieldValue('show_egypt_fields') && (
            <div className="p-6 bg-red-50/50 dark:bg-rose-500/10 rounded-2xl border border-red-100 dark:border-rose-500/20 animate-in slide-in-from-top-2 relative">
              <button
                onClick={() => updateField('show_egypt_fields', false)}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                title="Hide Egypt section"
              >
                <X size={16} />
              </button>
              <h4 className="text-[10px] font-black text-red-700 dark:text-rose-400 uppercase tracking-widest mb-4">Egypt Specific Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Tax Registration No."  fieldName="tax_registration_number" type="text" />
                <FieldInput label="Trade License No."     fieldName="trade_license_number" type="text" />
                <FieldInput label="Tax Card Number"       fieldName="tax_card_number" type="text" />
                <FieldInput label="Social Insurance No."  fieldName="social_insurance_number" type="text" />
                <FieldInput label="GAFI Registration"     fieldName="gafi_registration" type="text" />
                <FieldInput label="Industrial License Number" fieldName="industrial_license_number" type="text" />
                <FieldInput label="Import License Number"   fieldName="import_license_number" type="text" />
                <FieldInput label="Export License Number"   fieldName="export_license_number" type="text" />
                <FieldInput label="LEI (Legal Entity Identifier)" fieldName="lei_number" type="text" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}