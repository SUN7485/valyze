import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, ArrowLeft, X, Plus, Trash2, CheckCircle } from 'lucide-react'
import { api } from '../api/client'

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

/* ── Login Screen ── */
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
      setError(err.message || 'Invalid credentials. Please try again.')
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
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all mb-4" placeholder="Enter password" />
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in...</> : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Order Form ── */
function OrderForm({ portalToken, clientName, onSubmitSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceLevel, setServiceLevel] = useState('standard')
  const [reportType, setReportType] = useState('standard')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [clientRef, setClientRef] = useState('')
  const [companies, setCompanies] = useState([{ company_name: '', country: '', comments: '' }])

  const addCompany = () => setCompanies(prev => [...prev, { company_name: '', country: '', comments: '' }])
  const removeCompany = (i) => setCompanies(prev => prev.filter((_, idx) => idx !== i))
  const updateCompany = (i, field, value) => setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validCompanies = companies.filter(c => c.company_name.trim())
    if (!validCompanies.length) { setError('At least one company name is required.'); return }
    if (!dueDate) { setError('Due date is required.'); return }

    setLoading(true); setError('')
    try {
      const result = await portalRequest('/api/portal/submit-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalToken}` },
        body: JSON.stringify({ service_level: serviceLevel, report_type: reportType, due_date: dueDate, client_ref: clientRef || undefined, notes: notes || undefined, companies: validCompanies }),
      })
      onSubmitSuccess(result)
    } catch (err) {
      setError(err.message || 'Failed to submit order')
    } finally { setLoading(false) }
  }

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

        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2"><X size={16} />{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Level */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <label className="block text-white/70 text-sm font-bold mb-3">Service Level</label>
            <div className="grid grid-cols-2 gap-2">
              {['basic', 'standard', 'express', 'urgent'].map(level => (
                <button key={level} type="button" onClick={() => setServiceLevel(level)}
                  className={`py-3 rounded-xl text-sm font-bold capitalize transition-all ${serviceLevel === level ? 'bg-amber-400 text-gray-900' : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'}`}>
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/70 text-sm font-bold mb-2">Report Type</label>
                <div className="flex gap-2">
                  {['standard', 'full'].map(type => (
                    <button key={type} type="button" onClick={() => setReportType(type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-all ${reportType === type ? 'bg-amber-400 text-gray-900' : 'bg-white/5 text-white/70 border border-white/10'}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-sm font-bold mb-2">Due Date *</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:border-amber-400 outline-none text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-white/70 text-sm font-bold mb-2">Your Reference (optional)</label>
              <input type="text" value={clientRef} onChange={e => setClientRef(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm" placeholder="e.g., PO-12345" />
            </div>
            <div>
              <label className="block text-white/70 text-sm font-bold mb-2">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm resize-none" placeholder="Any additional instructions..." />
            </div>
          </div>

          {/* Companies */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-sm">Companies</h2>
              <button type="button" onClick={addCompany}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-400/10 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-400/20 transition-all">
                <Plus size={14} /> Add Company
              </button>
            </div>
            <div className="space-y-3">
              {companies.map((company, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-bold">Company {i + 1}</span>
                    {companies.length > 1 && (
                      <button type="button" onClick={() => removeCompany(i)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <input type="text" value={company.company_name} onChange={e => updateCompany(i, 'company_name', e.target.value)} placeholder="Company name *" required
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={company.country} onChange={e => updateCompany(i, 'country', e.target.value)} placeholder="Country"
                      className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm" />
                    <input type="text" value={company.comments} onChange={e => updateCompany(i, 'comments', e.target.value)} placeholder="Comments"
                      className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-amber-400 outline-none text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-amber-400 to-amber-300 text-gray-900 font-extrabold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : 'Submit Order'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Success Screen ── */
function SuccessScreen({ result, clientName }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #08111c 0%, #0D1B2A 48%, #07101a 100%)' }}>
      <div className="w-full max-w-lg bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-emerald-400 flex items-center justify-center">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>
        <h1 className="text-white text-2xl font-black mb-2">Order Submitted!</h1>
        <div className="text-amber-400 text-3xl font-black my-4">{result?.order_number || '—'}</div>
        <p className="text-white/50 text-sm">Your order has been received and is being processed.</p>
        <button onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all">
          Submit Another Order
        </button>
      </div>
    </div>
  )
}

/* ── Main Portal Page ── */
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
        <LoginScreen token={token} onAuthenticated={({ portalToken: pt, clientName: cn }) => { setPortalToken(pt); setClientName(cn); setState('form') }} />
      )}
      {state === 'form' && (
        <OrderForm portalToken={portalToken} clientName={clientName} onSubmitSuccess={(result) => { setLastResult(result); setState('success') }} />
      )}
      {state === 'success' && (
        <SuccessScreen result={lastResult} clientName={clientName} />
      )}
    </div>
  )
}