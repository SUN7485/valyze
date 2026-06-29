import React, { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, X, Plus, Trash2, CheckCircle, Paperclip } from 'lucide-react'

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

/* Order Form */
function OrderForm({ portalToken, clientName, onSubmitSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState('5_days')
  const [reportTypes, setReportTypes] = useState(['credit_report'])
  const [notes, setNotes] = useState('')
  const [clientRef, setClientRef] = useState('')
  const [companies, setCompanies] = useState([{ company_name: '', country: '', comments: '' }])
  const [filesPerCompany, setFilesPerCompany] = useState([[]])

  const MAX_FILES_PER_COMPANY = 5
  const MAX_FILE_SIZE_MB = 100
  const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.tiff', '.xlsx', '.xls', '.csv', '.txt'])

  const addCompany = () => {
    setCompanies(prev => [...prev, { company_name: '', country: '', comments: '' }])
    setFilesPerCompany(prev => [...prev, []])
  }

  const removeCompany = (i) => {
    setCompanies(prev => prev.filter((_, idx) => idx !== i))
    setFilesPerCompany(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateCompany = (i, field, value) =>
    setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))

  const toggleReportType = (value) => {
    setReportTypes(prev =>
      prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validCompanies = companies.filter(c => c.company_name.trim())
    if (!validCompanies.length) { setError('At least one company name is required.'); return }
    if (!reportTypes.length) { setError('Select at least one report type.'); return }

    setLoading(true); setError('')
    try {
      const formData = new FormData()
      const orderData = {
        speed,
        report_types: reportTypes,
        client_ref: clientRef || undefined,
        notes: notes || undefined,
        companies: validCompanies,
      }
      formData.append('order_data', JSON.stringify(orderData))

      filesPerCompany.forEach((files, companyIndex) => {
        files.forEach(file => {
          formData.append('files', file)
          formData.append('file_company_indexes', String(companyIndex))
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

  const selectedTier = SPEED_TIERS[speed]

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-amber-400 font-extrabold text-lg tracking-[0.3em] mb-1">VALYZE</div>
            <h1 className="text-white text-2xl font-black">New Order</h1>
            <p className="text-white/50 text-sm mt-1">Welcome, {clientName}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <X size={16} />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Speed Section */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <label className="block text-white/70 text-sm font-bold mb-3">Service Speed</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-400 outline-none text-sm mb-3"
            >
              {Object.entries(SPEED_TIERS).map(([key, val]) => (
                <option key={key} value={key} className="bg-gray-900 text-white">{val.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-xs">Tier:</span>
              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold ${selectedTier?.tierClass || ''}`}>
                {selectedTier?.tier || 'Standard'}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
            {/* Report Types */}
            <div>
              <label className="block text-white/70 text-sm font-bold mb-3">Report Types</label>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                      reportTypes.includes(opt.value)
                        ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={reportTypes.includes(opt.value)}
                      onChange={() => toggleReportType(opt.value)}
                      className="accent-amber-400 w-4 h-4"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/70 text-sm font-bold mb-2">Your Reference</label>
                <input
                  type="text"
                  value={clientRef}
                  onChange={e => setClientRef(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm"
                  placeholder="e.g., PO-12345"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm font-bold mb-2">Due Date</label>
                <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white/50 text-sm">
                  Auto-calculated after submission
                </div>
              </div>
            </div>

            <div>
              <label className="block text-white/70 text-sm font-bold mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm resize-none"
                placeholder="Any additional instructions..."
              />
            </div>
          </div>

          {/* Companies */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-sm">Companies</h2>
              <button
                type="button"
                onClick={addCompany}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-400/10 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-400/20 transition-all"
              >
                <Plus size={14} /> Add Company
              </button>
            </div>
            <div className="space-y-3">
              {companies.map((company, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-bold">Company {i + 1}</span>
                    {companies.length > 1 && (
                      <button type="button" onClick={() => removeCompany(i)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={company.company_name}
                    onChange={e => updateCompany(i, 'company_name', e.target.value)}
                    placeholder="Company name *"
                    required
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={company.country}
                      onChange={e => updateCompany(i, 'country', e.target.value)}
                      className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-400 outline-none text-sm"
                    >
                      {SUPPORTED_COUNTRIES.map(c => (
                        <option key={c.value} value={c.value} className="bg-gray-900">{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={company.comments}
                      onChange={e => updateCompany(i, 'comments', e.target.value)}
                      placeholder="Comments"
                      className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm"
                    />
                  </div>

                  {/* File attachments */}
                  <div className="pt-2">
                    <label className="block text-white/70 text-xs font-bold mb-2">Documents</label>
                    <label
                      htmlFor={`files-${i}`}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-xl text-white/50 text-xs font-medium cursor-pointer hover:border-amber-400/50 transition-all"
                    >
                      <Paperclip size={12} />
                      <span>{filesPerCompany[i]?.length ? `${filesPerCompany[i].length} file(s) selected` : 'Attach files'}</span>
                      <input
                        id={`files-${i}`}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.tiff,.xlsx,.xls,.csv,.txt"
                        onChange={e => {
                          const files = Array.from(e.target.files || [])
                          const ext = files.map(f => f.name.slice(f.name.lastIndexOf('.')).toLowerCase())
                          if (ext.some(x => !ALLOWED_EXTENSIONS.has(x))) {
                            setError(`Invalid file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`)
                            return
                          }
                          if (files.some(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024)) {
                            setError(`Files must be under ${MAX_FILE_SIZE_MB}MB each`)
                            return
                          }
                          if ((filesPerCompany[i]?.length || 0) + files.length > MAX_FILES_PER_COMPANY) {
                            setError(`Maximum ${MAX_FILES_PER_COMPANY} files per company`)
                            return
                          }
                          setFilesPerCompany(prev => prev.map((ef, idx) => idx === i ? [...ef, ...files] : ef))
                          e.target.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                    {filesPerCompany[i]?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {filesPerCompany[i].map((f, fi) => (
                          <li key={fi} className="flex items-center justify-between text-xs text-white/70 bg-white/5 rounded-lg px-2 py-1">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setFilesPerCompany(prev => prev.map((ef, idx) => idx === i ? ef.filter((_, fj) => fj !== fi) : ef))}
                              className="text-red-400 hover:text-red-300 text-xs ml-2"
                            >
                              X
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : 'Submit Order'}
          </button>
        </form>
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

/* Main Portal Page */
export default function PortalPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [state, setState] = useState('login')
  const [portalToken, setPortalToken] = useState('')
  const [clientName, setClientName] = useState('Client')
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
            setState('form')
          }}
        />
      )}
      {state === 'form' && (
        <OrderForm
          portalToken={portalToken}
          clientName={clientName}
          onSubmitSuccess={(result) => { setLastResult(result); setState('success') }}
        />
      )}
      {state === 'success' && (
        <SuccessScreen result={lastResult} clientName={clientName} />
      )}
    </div>
  )
}
