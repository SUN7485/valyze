import React, { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Loader2, X, Plus, Trash2, CheckCircle, Paperclip,
  ChevronLeft, ChevronRight, Check, Building2, FileText,
  ClipboardCheck, Gauge, Zap, AlertCircle, Send,
} from 'lucide-react'

const API_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')

async function portalRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.detail || `Request failed with status ${response.status}`)
  }
  return data
}

/* Constants */
const SPEED_TIERS = {
  '7_days': { label: '7 Days', tier: 'Basic', tierClass: 'bg-slate-100/10 text-slate-300' },
  '5_days': { label: '5 Days', tier: 'Standard', tierClass: 'bg-amber-400/10 text-amber-400' },
  '3_days': { label: '3 Days', tier: 'Express', tierClass: 'bg-cyan-100/10 text-cyan-300' },
  '2_days': { label: '2 Days', tier: 'Express', tierClass: 'bg-cyan-100/10 text-cyan-300' },
  '1_day': { label: '1 Day', tier: 'Urgent', tierClass: 'bg-rose-100/10 text-rose-300' },
  '24_hours': { label: '24 Hours', tier: 'Urgent', tierClass: 'bg-rose-100/10 text-rose-300' },
}

const SUPPORTED_COUNTRIES = [
  { value: '', label: 'Select country...' },
  { value: 'Egypt', label: 'Egypt' },
  { value: 'Saudi Arabia', label: 'Saudi Arabia' },
  { value: 'UAE', label: 'UAE' },
  { value: 'Jordan', label: 'Jordan' },
  { value: 'Qatar', label: 'Qatar' },
  { value: 'Bahrain', label: 'Bahrain' },
  { value: 'Oman', label: 'Oman' },
]

const REPORT_TYPE_OPTIONS = [
  { value: 'credit_report', label: 'Credit Report' },
  { value: 'registration', label: 'Registration' },
  { value: 'owners', label: 'Owners' },
  { value: 'ubo', label: 'UBO' },
  { value: 'legal', label: 'Legal' },
  { value: 'analysis_financial', label: 'Analysis & Financial' },
]

/* Per-company detail fields. Only company_name is mandatory — the rest are
   "guided": optional but strongly encouraged, and they drive the completeness meter. */
const COMPANY_FIELDS = [
  { key: 'registration_no', label: 'Registration / CR Number', placeholder: 'e.g. 1010xxxxxx' },
  { key: 'address', label: 'Registered Address', placeholder: 'Street, city' },
  { key: 'requested_limit', label: 'Requested Credit Limit', placeholder: 'e.g. SAR 500,000' },
  { key: 'vat_no', label: 'VAT Number', placeholder: 'Optional' },
  { key: 'phone', label: 'Phone', placeholder: 'Optional' },
]

/* Documents we recommend the client attaches for the most accurate report.
   Informational only — never blocks submission. */
const DOC_CHECKLIST = [
  'Commercial Registration (CR)',
  'Latest Financial Statements',
  'VAT / Tax Certificate',
  'Trade License',
]

const EMPTY_COMPANY = {
  company_name: '', country: '', registration_no: '',
  address: '', requested_limit: '', vat_no: '', phone: '', comments: '',
}

const WIZARD_STEPS = [
  { id: 'service',   label: 'Service',   icon: Zap },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'review',    label: 'Review',    icon: ClipboardCheck },
]

/* Completeness for a single company: 1 (name) + filled optional fields, out of total. */
function companyCompleteness(company) {
  const optionalKeys = [...COMPANY_FIELDS.map(f => f.key), 'country', 'comments']
  const total = optionalKeys.length + 1 // +1 for the mandatory name
  let filled = company.company_name.trim() ? 1 : 0
  optionalKeys.forEach(k => { if (String(company[k] || '').trim()) filled += 1 })
  return { filled, total, pct: Math.round((filled / total) * 100) }
}

/* Login Screen */
function LoginScreen({ token, onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password.trim()) { setError('Please enter a password.'); return }
    setLoading(true); setError('')
    try {
      const result = await portalRequest('/api/portal/auth', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      onAuthenticated({ portalToken: result.portal_token, clientName: result.client?.client_name || 'Client' })
    } catch (err) {
      setError(err.message || 'Invalid credentials.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
        <div className="text-amber-400 font-extrabold text-xl tracking-[0.3em] mb-4">VALYZE</div>
        <h1 className="text-white text-2xl font-black mb-2">Client Order Portal</h1>
        <p className="text-white/50 text-sm mb-6">Enter the temporary password from your Valyze portal link.</p>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="block text-left text-white/70 text-sm font-bold mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all mb-4"
            placeholder="Enter password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in...</> : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* Shared input styling */
const FIELD_CLS = 'w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none text-sm transition-all'

/* Order Form — guided multi-step wizard */
function OrderForm({ portalToken, clientName, onSubmitSuccess, orderMode }) {
  const isBatch = orderMode === 'batch'
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState('5_days')
  const [reportTypes, setReportTypes] = useState(['credit_report'])
  const [notes, setNotes] = useState('')
  const [clientRef, setClientRef] = useState('')
  const [companies, setCompanies] = useState([{ ...EMPTY_COMPANY }])
  const [filesPerCompany, setFilesPerCompany] = useState([[]])

  const MAX_FILES_PER_COMPANY = 5
  const MAX_FILE_SIZE_MB = 100
  const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.tiff', '.xlsx', '.xls', '.csv', '.txt'])

  const addCompany = () => {
    if (!isBatch) return
    setCompanies(prev => [...prev, { ...EMPTY_COMPANY }])
    setFilesPerCompany(prev => [...prev, []])
  }
  const removeCompany = (i) => {
    setCompanies(prev => prev.filter((_, idx) => idx !== i))
    setFilesPerCompany(prev => prev.filter((_, idx) => idx !== i))
  }
  const updateCompany = (i, field, value) =>
    setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  const toggleReportType = (value) =>
    setReportTypes(prev => prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value])

  const addFiles = (i, fileList) => {
    const files = Array.from(fileList || [])
    const ext = files.map(f => f.name.slice(f.name.lastIndexOf('.')).toLowerCase())
    if (ext.some(x => !ALLOWED_EXTENSIONS.has(x))) {
      setError(`Invalid file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`); return
    }
    if (files.some(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024)) {
      setError(`Files must be under ${MAX_FILE_SIZE_MB}MB each`); return
    }
    if ((filesPerCompany[i]?.length || 0) + files.length > MAX_FILES_PER_COMPANY) {
      setError(`Maximum ${MAX_FILES_PER_COMPANY} files per company`); return
    }
    setError('')
    setFilesPerCompany(prev => prev.map((ef, idx) => idx === i ? [...ef, ...files] : ef))
  }
  const removeFile = (i, fi) =>
    setFilesPerCompany(prev => prev.map((ef, idx) => idx === i ? ef.filter((_, fj) => fj !== fi) : ef))

  const namedCompanies = companies.filter(c => c.company_name.trim())
  const totalFiles = filesPerCompany.reduce((s, f) => s + f.length, 0)

  // Overall completeness across all companies (drives the meter).
  const overall = useMemo(() => {
    if (!companies.length) return 0
    const sum = companies.reduce((s, c) => s + companyCompleteness(c).pct, 0)
    return Math.round(sum / companies.length)
  }, [companies])

  const selectedTier = SPEED_TIERS[speed]

  // Per-step gating — company NAME and COUNTRY are mandatory.
  const canAdvance = () => {
    if (step === 0) return reportTypes.length > 0
    if (step === 1) return namedCompanies.length > 0 && namedCompanies.every(c => c.country)
    return true
  }

  const goNext = () => {
    if (step === 0 && reportTypes.length === 0) {
      setError('Select at least one report type.')
      return
    }
    if (step === 1) {
      if (namedCompanies.length === 0) {
        setError('At least one company name is required.')
        return
      }
      if (namedCompanies.some(c => !c.country)) {
        setError('Please select a country for each company.')
        return
      }
    }
    setError(''); setStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }
  const goBack = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  const handleSubmit = async () => {
    if (!namedCompanies.length) { setError('At least one company name is required.'); setStep(1); return }
    if (namedCompanies.some(c => !c.country)) { setError('Please select a country for each company.'); setStep(1); return }
    setLoading(true); setError('')
    try {
      const formData = new FormData()
      const orderData = {
        speed,
        report_types: reportTypes,
        client_ref: clientRef || undefined,
        notes: notes || undefined,
        companies: namedCompanies,
      }
      formData.append('order_data', JSON.stringify(orderData))
      // Only attach files for companies that have a name (indexes must map to named list).
      companies.forEach((c, idx) => {
        if (!c.company_name.trim()) return
        const mappedIndex = namedCompanies.findIndex(nc => nc === c)
        ;(filesPerCompany[idx] || []).forEach(file => {
          formData.append('files', file)
          formData.append('file_company_indexes', String(mappedIndex))
        })
      })
      const result = await portalRequest('/api/portal/submit-order-with-files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalToken}` },
        body: formData,
      })
      onSubmitSuccess(result)
    } catch (err) {
      setError(err.message || 'Failed to submit order')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-amber-400 font-extrabold text-lg tracking-[0.3em] mb-1">VALYZE</div>
            <h1 className="text-white text-2xl font-black">{isBatch ? 'Batch Order' : 'Single Order'}</h1>
            <p className="text-white/50 text-sm mt-1">Welcome, {clientName}</p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <Gauge size={16} className="text-amber-400" />
            <div>
              <div className="text-white font-black text-lg leading-none">{overall}%</div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider">Complete</div>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-6">
          {WIZARD_STEPS.map((s, idx) => {
            const Icon = s.icon
            const active = idx === step
            const done = idx < step
            return (
              <React.Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => idx < step && setStep(idx)}
                  disabled={idx > step}
                  className={`flex flex-col items-center gap-1.5 ${idx <= step ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    active ? 'bg-amber-400 border-amber-400 text-gray-900 scale-110 shadow-lg shadow-amber-400/30'
                    : done ? 'bg-emerald-400/20 border-emerald-400 text-emerald-400'
                    : 'bg-white/5 border-white/15 text-white/40'
                  }`}>
                    {done ? <Check size={18} /> : <Icon size={16} />}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-amber-400' : done ? 'text-emerald-400/80' : 'text-white/40'}`}>{s.label}</span>
                </button>
                {idx < WIZARD_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 rounded transition-all ${idx < step ? 'bg-emerald-400/50' : 'bg-white/10'}`} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertCircle size={16} className="flex-shrink-0" />{error}
          </div>
        )}

        {/* ---------- STEP 0: SERVICE ---------- */}
        {step === 0 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <label className="block text-white/70 text-sm font-bold mb-3">Service Speed</label>
              <select value={speed} onChange={e => setSpeed(e.target.value)} className={FIELD_CLS + ' mb-3'}>
                {Object.entries(SPEED_TIERS).map(([key, val]) => (
                  <option key={key} value={key} className="bg-gray-900 text-white">{val.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-xs">Tier:</span>
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold ${selectedTier?.tierClass || ''}`}>{selectedTier?.tier || 'Standard'}</span>
                <span className="text-white/30 text-xs ml-auto">Due date auto-calculated</span>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <label className="block text-white/70 text-sm font-bold mb-3">Report Types <span className="text-amber-400/70 font-normal">· pick at least one</span></label>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPE_OPTIONS.map(opt => (
                  <label key={opt.value} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                    reportTypes.includes(opt.value) ? 'bg-amber-400/10 border-amber-400/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}>
                    <input type="checkbox" checked={reportTypes.includes(opt.value)} onChange={() => toggleReportType(opt.value)} className="accent-amber-400 w-4 h-4" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------- STEP 1: COMPANIES ---------- */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
              <label className="block text-white/70 text-sm font-bold mb-2">Your Reference <span className="text-white/30 font-normal">· optional</span></label>
              <input type="text" value={clientRef} onChange={e => setClientRef(e.target.value)} className={FIELD_CLS} placeholder="e.g., PO-12345" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-xs"><span className="text-amber-400 font-bold">Company name</span> and <span className="text-amber-400 font-bold">country</span> are required. The more details you add, the faster and more accurate your report.</p>
              {isBatch && (
                <button type="button" onClick={addCompany} className="flex items-center gap-1 px-3 py-1.5 bg-amber-400/10 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-400/20 transition-all flex-shrink-0 ml-3">
                  <Plus size={14} /> Add
                </button>
              )}
            </div>
            {companies.map((company, i) => {
              const comp = companyCompleteness(company)
              return (
                <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold text-sm flex items-center gap-2"><Building2 size={14} className="text-amber-400" /> Company {i + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-white/40">{comp.filled}/{comp.total} details</span>
                      {companies.length > 1 && (
                        <button type="button" onClick={() => removeCompany(i)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                  {/* completeness bar */}
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500" style={{ width: `${comp.pct}%` }} />
                  </div>

                  <div>
                    <label className="block text-white/70 text-xs font-bold mb-1.5">Company Name <span className="text-amber-400">*</span></label>
                    <input type="text" value={company.company_name} onChange={e => updateCompany(i, 'company_name', e.target.value)} placeholder="Legal company name" className={FIELD_CLS} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-white/70 text-xs font-bold mb-1.5">Country <span className="text-amber-400">*</span></label>
                      <select
                        value={company.country}
                        onChange={e => updateCompany(i, 'country', e.target.value)}
                        className={`${FIELD_CLS} ${!company.country ? 'border-amber-400/40' : ''}`}
                      >
                        {SUPPORTED_COUNTRIES.map(c => <option key={c.value} value={c.value} className="bg-gray-900">{c.label}</option>)}
                      </select>
                    </div>
                    {COMPANY_FIELDS.map(f => (
                      <div key={f.key}>
                        <label className="block text-white/70 text-xs font-bold mb-1.5">{f.label}</label>
                        <input type="text" value={company[f.key]} onChange={e => updateCompany(i, f.key, e.target.value)} placeholder={f.placeholder} className={FIELD_CLS} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-bold mb-1.5">Comments</label>
                    <input type="text" value={company.comments} onChange={e => updateCompany(i, 'comments', e.target.value)} placeholder="Anything we should know about this company" className={FIELD_CLS} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ---------- STEP 2: DOCUMENTS ---------- */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-amber-400/5 border border-amber-400/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold mb-2"><ClipboardCheck size={14} /> Recommended documents</div>
              <div className="grid grid-cols-2 gap-1.5">
                {DOC_CHECKLIST.map(d => (
                  <div key={d} className="flex items-center gap-1.5 text-white/60 text-xs"><Check size={12} className="text-emerald-400/70 flex-shrink-0" />{d}</div>
                ))}
              </div>
              <p className="text-white/30 text-[11px] mt-2">Optional — but attaching these speeds up your report significantly.</p>
            </div>

            {namedCompanies.length === 0 && (
              <div className="text-white/40 text-sm text-center py-6">Add a company in the previous step to attach documents.</div>
            )}

            {companies.map((company, i) => {
              if (!company.company_name.trim()) return null
              return (
                <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-bold text-sm flex items-center gap-2"><Building2 size={14} className="text-amber-400" /> {company.company_name}</span>
                    <span className="text-[10px] font-bold text-white/40">{filesPerCompany[i]?.length || 0}/{MAX_FILES_PER_COMPANY} files</span>
                  </div>
                  <label htmlFor={`files-${i}`} className="flex items-center justify-center gap-2 px-3 py-4 bg-white/5 border border-dashed border-white/15 rounded-xl text-white/50 text-xs font-medium cursor-pointer hover:border-amber-400/50 hover:text-amber-300 transition-all">
                    <Paperclip size={14} />
                    <span>Click to attach documents</span>
                    <input id={`files-${i}`} type="file" multiple accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.tiff,.xlsx,.xls,.csv,.txt"
                      onChange={e => { addFiles(i, e.target.files); e.target.value = '' }} className="hidden" />
                  </label>
                  {filesPerCompany[i]?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {filesPerCompany[i].map((f, fi) => (
                        <li key={fi} className="flex items-center justify-between text-xs text-white/70 bg-white/5 rounded-lg px-3 py-2">
                          <span className="truncate flex items-center gap-2"><FileText size={12} className="text-amber-400/70 flex-shrink-0" />{f.name}</span>
                          <button type="button" onClick={() => removeFile(i, fi)} className="text-red-400 hover:text-red-300 ml-2"><X size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ---------- STEP 3: REVIEW ---------- */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-black text-sm uppercase tracking-wider">Review your order</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-white/40 text-xs">Speed</div><div className="text-white font-bold">{selectedTier?.label} · {selectedTier?.tier}</div></div>
                <div><div className="text-white/40 text-xs">Report Types</div><div className="text-white font-bold">{reportTypes.map(t => REPORT_TYPE_OPTIONS.find(o => o.value === t)?.label || t).join(', ')}</div></div>
                {clientRef && <div><div className="text-white/40 text-xs">Your Reference</div><div className="text-white font-bold">{clientRef}</div></div>}
                <div><div className="text-white/40 text-xs">Documents</div><div className="text-white font-bold">{totalFiles} file(s)</div></div>
              </div>
              <div>
                <div className="text-white/40 text-xs mb-2">Companies ({namedCompanies.length})</div>
                <div className="space-y-2">
                  {namedCompanies.map((c, idx) => {
                    const realIdx = companies.findIndex(cc => cc === c)
                    return (
                      <div key={idx} className="bg-white/5 rounded-xl px-3 py-2 flex items-center justify-between">
                        <div>
                          <div className="text-white font-bold text-sm">{c.company_name}</div>
                          <div className="text-white/40 text-xs">{[c.country, c.registration_no, c.requested_limit].filter(Boolean).join(' · ') || 'No extra details'}</div>
                        </div>
                        <span className="text-[10px] text-white/40 font-bold">{(filesPerCompany[realIdx]?.length || 0)} files</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <label className="block text-white/70 text-sm font-bold mb-2">Notes <span className="text-white/30 font-normal">· optional</span></label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={FIELD_CLS + ' resize-none'} placeholder="Any additional instructions for the analyst..." />
            </div>
          </div>
        )}

        {/* ---------- NAV ---------- */}
        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button type="button" onClick={goBack} disabled={loading}
              className="px-5 py-3.5 bg-white/5 border border-white/10 text-white/70 rounded-xl text-sm font-bold hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step < WIZARD_STEPS.length - 1 ? (
            <button type="button" onClick={goNext}
              className="flex-1 py-3.5 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3.5 bg-gradient-to-r from-emerald-400 to-emerald-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : <><Send size={16} /> Submit Order</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* Success Screen */
function SuccessScreen({ result, clientName }) {
  const navigate = useNavigate()
  const handleViewOrder = () => {
    if (result?.order_id) {
      navigate(`/orders/${result.order_id}`)
    } else {
      window.location.reload()
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="w-full max-w-lg bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-emerald-400 flex items-center justify-center">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>
        <h1 className="text-white text-2xl font-black mb-2">Order Submitted!</h1>
        <div className="text-amber-400 text-3xl font-black my-4">{result?.order_number || '-'}</div>
        <p className="text-white/50 text-sm">Your order has been received and is being processed.</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleViewOrder}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 rounded-xl text-sm font-bold hover:opacity-90 transition-all"
          >
            View Order Details
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all"
          >
            Submit Another
          </button>
        </div>
      </div>
    </div>
  )
}

/* Order Type Selection Screen */
function OrderTypeScreen({ clientName, onSelect }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-amber-400 font-extrabold text-xl tracking-[0.3em] mb-2">VALYZE</div>
          <h1 className="text-white text-2xl font-black mb-1">New Order</h1>
          <p className="text-white/50 text-sm">Welcome, {clientName} — choose your order type</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onSelect('single')}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-7 text-left hover:border-amber-400/50 hover:bg-amber-400/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center mb-4 group-hover:bg-amber-400/20 transition-all">
              <FileText size={22} className="text-amber-400" />
            </div>
            <div className="text-white font-black text-lg mb-1">Single Order</div>
            <p className="text-white/40 text-sm">Request a credit report for one company.</p>
          </button>
          <button
            type="button"
            onClick={() => onSelect('batch')}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-7 text-left hover:border-amber-400/50 hover:bg-amber-400/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center mb-4 group-hover:bg-amber-400/20 transition-all">
              <ClipboardCheck size={22} className="text-amber-400" />
            </div>
            <div className="text-white font-black text-lg mb-1">Batch Order</div>
            <p className="text-white/40 text-sm">Request reports for multiple companies in one submission.</p>
          </button>
        </div>
      </div>
    </div>
  )
}

/* Main Portal Page */
export default function PortalPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [state, setState] = useState('login')
  const [portalToken, setPortalToken] = useState('')
  const [clientName, setClientName] = useState('Client')
  const [orderMode, setOrderMode] = useState('single')
  const [lastResult, setLastResult] = useState(null)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
          <div className="text-amber-400 font-extrabold text-xl tracking-[0.3em] mb-4">VALYZE</div>
          <p className="text-red-400 text-sm">Invalid portal link. Contact Valyze.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {state === 'login' && (
        <LoginScreen
          token={token}
          onAuthenticated={({ portalToken: pt, clientName: cn }) => {
            setPortalToken(pt)
            setClientName(cn)
            setState('type-select')
          }}
        />
      )}
      {state === 'type-select' && (
        <OrderTypeScreen
          clientName={clientName}
          onSelect={(mode) => { setOrderMode(mode); setState('form') }}
        />
      )}
      {state === 'form' && (
        <OrderForm
          portalToken={portalToken}
          clientName={clientName}
          orderMode={orderMode}
          onSubmitSuccess={(result) => { setLastResult(result); setState('success') }}
        />
      )}
      {state === 'success' && (
        <SuccessScreen result={lastResult} clientName={clientName} />
      )}
    </div>
  )
}
