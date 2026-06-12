import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Search, Plus, Eye, Edit3, Trash2, X, Loader2, Copy, CheckCircle, Clock, AlertTriangle, Key, ExternalLink, CopyCheck, FileText } from 'lucide-react'
import { clientsAPI, ordersAPI, invoicesAPI } from '../api/client'

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
          <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-all">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function Pill({ color = 'slate', children }) {
  const map = {
    slate:   'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10',
    gold:    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
    purple:  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
    rose:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/20',
    amber:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
    blue:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20',
    green:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border ${map[color] || map.slate}`}>
      {children}
    </span>
  )
}

function StatusBadge({ status }) {
  if (status === 'pending')     return <Pill color="amber">Pending</Pill>
  if (status === 'in_progress') return <Pill color="blue">In Progress</Pill>
  if (status === 'completed')   return <Pill color="green">Completed</Pill>
  if (status === 'invoiced')    return <Pill color="purple">Invoiced</Pill>
  return <Pill>{status || '-'}</Pill>
}

function GeneratePortalModal({ clientId, onDone }) {
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [copied, setCopied]       = useState({})
  const [form, setForm]           = useState({ max_uses: 10, expiry_days: 30 })
  const [error, setError]         = useState('')

  const generate = async () => {
    setLoading(true); setError('')
    try {
      const res = await clientsAPI.generatePortalLink(clientId, form)
      setResult(res.data)
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(p => ({ ...p, [key]: true }))
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000)
    } catch { alert('Clipboard unavailable') }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-4 py-2.5 bg-primary text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 shadow-lg shadow-primary/20 flex items-center gap-2">
        <Key size={14} /> Generate New Portal Link
      </button>
      <Modal isOpen={open} onClose={() => { setOpen(false); setResult(null); setError('') }} title="Generate Portal Link">
        {!result ? (
          <div className="space-y-4">
            {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 text-xs font-semibold">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Uses</label>
                <input type="number" min="1" value={form.max_uses} onChange={e => setForm(p => ({ ...p, max_uses: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Expiry (days)</label>
                <input type="number" min="1" value={form.expiry_days} onChange={e => setForm(p => ({ ...p, expiry_days: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
              <button onClick={generate} disabled={loading} className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />} Generate
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200 font-semibold">Save this password — it won't be shown again.</p>
            </div>
            {[
              { label: 'Portal URL', value: result.portal_url, key: 'url' },
              { label: 'Temporary Password', value: result.password_plain, key: 'pwd' },
            ].map(item => (
              <div key={item.key} className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{item.label}</label>
                <div className="flex items-center gap-2">
                  <input readOnly value={item.value || ''} className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-200" />
                  <button onClick={() => copy(item.value, item.key)} className="px-3 py-2.5 border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5" title="Copy">
                    {copied[item.key] ? <CopyCheck size={16} className="text-emerald-500" /> : <Copy size={16} className="text-slate-500" />}
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => { setOpen(false); setResult(null); setError(''); onDone && onDone() }} className="w-full py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all mt-2">Done</button>
          </div>
        )}
      </Modal>
    </>
  )
}

function DeleteConfirm({ isOpen, onClose, onConfirm, name }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center"><Trash2 size={20} /></div>
          <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Delete Client</h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Are you sure you want to delete <span className="font-semibold text-slate-700 dark:text-slate-200">{name}</span>?</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-rose-500/20">Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [client, setClient]             = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [tab, setTab]                   = useState('orders')
  const [orders, setOrders]             = useState([])
  const [sessions, setSessions]         = useState([])
  const [invoices, setInvoices]         = useState([])
  const [refreshing, setRefreshing]     = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editForm, setEditForm]         = useState({ client_name: '', client_type: 'Company', contact_person: '', email: '', phone: '', country: '', address: '', is_pilot: false, notes: '' })
  const [editSaving, setEditSaving]     = useState(false)
  const [editError, setEditError]       = useState('')
  const [deleteTarget, setDeleteTarget] = useState({ open: false, clientId: null, name: '' })

  const fetchClient = async () => {
    try {
      setLoading(true)
      const [cRes, sRes] = await Promise.all([
        clientsAPI.getOne(clientId).catch(() => ({ data: {} })),
        clientsAPI.getSessions(clientId).catch(() => ({ data: [] })),
      ])
      const clientData = cRes.data || {}
      setClient(clientData)
      setOrders(clientData.orders || [])
      setInvoices((clientData.orders || []).filter(o => o.invoice_id).map(o => o.invoice))
      setSessions(Array.isArray(sRes.data) ? sRes.data : (sRes.data?.sessions || []))
    } catch (e) {
      setError(e.message || 'Failed to load client')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClient() }, [clientId])

  const openEdit = () => {
    if (!client) return
    setEditForm({
      client_name: client.client_name || '', client_type: client.client_type || 'Company',
      contact_person: client.contact_person || '', email: client.email || '', phone: client.phone || '',
      country: client.country || '', address: client.address || '', is_pilot: client.is_pilot || false, notes: client.notes || '',
    })
    setEditError(''); setEditFormOpen(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault(); setEditError('')
    if (!editForm.client_name.trim()) { setEditError('Client name required'); return }
    setEditSaving(true)
    try { await clientsAPI.update(clientId, editForm); setEditFormOpen(false); fetchClient() }
    catch (err) { setEditError(err.message || 'Failed') } finally { setEditSaving(false) }
  }

  const handleDelete = async () => { await clientsAPI.delete(deleteTarget.clientId); navigate('/clients') }
  const copy = async (text) => { try { await navigator.clipboard.writeText(text) } catch { alert('Clipboard unavailable') } }

  if (loading) return <div className="py-12 flex items-center justify-center"><Loader2 size={32} className="text-primary animate-spin" /><span className="ml-4 text-slate-500">Loading client...</span></div>
  if (error || !client) return <div className="py-12 text-center"><div className="text-rose-500 mb-4">{error || 'Client not found'}</div><button onClick={() => navigate('/clients')} className="px-4 py-2 bg-slate-100 dark:bg-white/5 rounded-lg text-sm font-semibold">Back to Clients</button></div>

  return (
    <div className="py-8 px-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                {client.valyze_id || 'NO-ID'}
              </span>
              {client.is_pilot && <Pill color="purple">Pilot</Pill>}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                client.client_type === 'Bank' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20'
                  : client.client_type === 'Third Party' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10'
              }`}>
                {client.client_type || 'Client'}
              </span>
            </div>
            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{client.client_name || 'Untitled Client'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEdit} className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-2"><Edit3 size={14} /> Edit</button>
            <button onClick={() => setDeleteTarget({ open: true, clientId: client.id, name: client.client_name })} className="px-4 py-2.5 bg-rose-500 text-white text-xs font-bold uppercase rounded-lg hover:bg-rose-600 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
          {client.contact_person && <span>{client.contact_person}</span>}
          {client.email && <span>{client.email}</span>}
          {client.phone && <span>{client.phone}</span>}
          {client.country && <span>{client.country}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-white/10 pb-1">
        {[
          { id: 'orders', label: 'Orders', icon: <FileText size={14} /> },
          { id: 'portal', label: 'Portal Access', icon: <ExternalLink size={14} /> },
          { id: 'invoices', label: 'Invoices', icon: <FileText size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 rounded-t-lg text-xs font-semibold transition-all flex items-center gap-2 ${tab === t.id ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            {t.icon} {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <button onClick={async () => { setRefreshing(true); await fetchClient(); setRefreshing(false) }} disabled={refreshing} className="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-all" title="Refresh">
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </div>
      </div>

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">Orders</h2>
            <button className="px-4 py-2.5 bg-primary text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 shadow-lg shadow-primary/20 flex items-center gap-2"><Plus size={14} /> New Order</button>
          </div>
          {orders.length === 0 ? <div className="glass-card p-8 text-center text-slate-400 text-sm">No orders yet for this client.</div> : (
            <div className="glass-card overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Level</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Companies</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyst</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {orders.map(order => (
                    <tr key={order.id} className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all">
                      <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{order.order_number || order.id}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{order.order_date ? new Date(order.order_date).toLocaleDateString('en-US') : '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 font-semibold">{order.service_level || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{order.companies_count ?? '-'}</td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{order.assigned_analyst || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 uppercase tracking-wider">View</button>
                          {order.status === 'completed' && !order.invoice_id && (
                            <button className="px-3 py-1.5 text-[10px] font-bold text-purple-600 bg-purple-500/10 rounded-lg hover:bg-purple-500/20 uppercase tracking-wider">Generate Invoice</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Portal Access Tab */}
      {tab === 'portal' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">Portal Sessions</h2>
            <GeneratePortalModal clientId={clientId} onDone={fetchClient} />
          </div>
          {sessions.length === 0 ? <div className="glass-card p-8 text-center text-slate-400 text-sm">No portal sessions created yet.</div> : (
            <div className="glass-card overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">URL</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expires</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Uses</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {sessions.map(session => {
                    const status = session.revoked_at ? 'revoked' : (new Date(session.expires_at).getTime() < Date.now() ? 'expired' : (session.used >= session.max_uses ? 'full' : 'active'))
                    return (
                      <tr key={session.id} className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-[200px]">{session.portal_url || session.url || '-'}</span>
                            <button onClick={() => copy(session.portal_url || session.url || '')} className="p-1 text-slate-400 hover:text-primary" title="Copy link"><Copy size={14} /></button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{session.created_at ? new Date(session.created_at).toLocaleDateString('en-US') : '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{session.expires_at ? new Date(session.expires_at).toLocaleDateString('en-US') : '-'}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{session.used != null ? `${session.used}/${session.max_uses}` : '-'}</td>
                        <td className="px-4 py-3">
                          {status === 'active' ? <Pill color="green">Active</Pill> : status === 'expired' ? <Pill color="rose">Expired</Pill> : status === 'full' ? <Pill color="amber">Full</Pill> : <Pill>{status}</Pill>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={async () => { await navigator.clipboard.writeText(session.portal_url || session.url || '') }} className="px-2.5 py-1.5 text-[10px] font-bold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 uppercase tracking-wider">Copy Link</button>
                            <button onClick={async () => { if (!window.confirm('Revoke this session?')) return; await clientsAPI.revokeSession(session.id); fetchClient() }} className="px-2.5 py-1.5 text-[10px] font-bold text-rose-600 bg-rose-500/10 rounded-lg hover:bg-rose-500/20 uppercase tracking-wider">Revoke</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">Invoices</h2>
          {invoices.length === 0 ? <div className="glass-card p-8 text-center text-slate-400 text-sm">No invoices for this client yet.</div> : (
            <div className="glass-card overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all">
                      <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{inv.invoice_number || inv.id}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{inv.order_id || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US') : '-'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{inv.total ? `${inv.total}` : '-'}</td>
                      <td className="px-4 py-3"><Pill color={inv.paid ? 'green' : 'amber'}>{inv.paid ? 'Paid' : 'Unpaid'}</Pill></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 uppercase tracking-wider">View</button>
                          {!inv.paid && <button className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 uppercase tracking-wider">Mark Paid</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={editFormOpen} onClose={() => setEditFormOpen(false)} title="Edit Client">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 text-xs font-semibold">{editError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Client Name *</label>
              <input type="text" value={editForm.client_name} onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" /></div>
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Type</label>
              <select value={editForm.client_type} onChange={e => setEditForm(p => ({ ...p, client_type: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white">
                {['Company','Bank','Third Party'].map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Contact Person</label>
              <input type="text" value={editForm.contact_person} onChange={e => setEditForm(p => ({ ...p, contact_person: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" /></div>
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" /></div>
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Phone</label>
              <input type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" /></div>
            <div><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Country</label>
              <input type="text" value={editForm.country} onChange={e => setEditForm(p => ({ ...p, country: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white" /></div>
            <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Address</label>
              <textarea value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white resize-none" /></div>
            <div className="md:col-span-2"><label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white resize-none" /></div>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <div><label className="text-xs font-bold text-slate-700 dark:text-slate-200">Pilot Client</label><p className="text-[10px] text-slate-500 mt-0.5">Mark pilot</p></div>
              <button type="button" onClick={() => setEditForm(p => ({ ...p, is_pilot: !p.is_pilot }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.is_pilot ? 'bg-primary' : 'bg-slate-200 dark:bg-white/10'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.is_pilot ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditFormOpen(false)} className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5" disabled={editSaving}>Cancel</button>
            <button type="submit" disabled={editSaving} className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {editSaving ? <Loader2 size={16} className="animate-spin" /> : null} Update
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirm isOpen={deleteTarget.open} onClose={() => setDeleteTarget({ open: false, clientId: null, name: '' })} onConfirm={handleDelete} name={deleteTarget.name} />
    </div>
  )
}