import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Edit3, Trash2, X, Loader2, CheckSquare, Square,
  Building2, Landmark, Users, MapPin, Mail, Star, FileText, Briefcase,
  CheckCircle2, ArrowRight,
} from 'lucide-react'
import { clientsAPI } from '../api/client'

// Visual config per client type
const TYPE_STYLE = {
  company:     { label: 'Company',     Icon: Building2, ring: 'from-blue-500 to-indigo-500',   badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20' },
  bank:        { label: 'Bank',        Icon: Landmark,  ring: 'from-emerald-500 to-teal-500',  badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20' },
  third_party: { label: 'Third Party', Icon: Users,     ring: 'from-violet-500 to-purple-500', badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20' },
}
const typeStyle = (t) => TYPE_STYLE[t] || TYPE_STYLE.company
const getInitials = (name) =>
  (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

// ---------------------------------------------------------------------------
// Shared Modal
// ---------------------------------------------------------------------------

function Modal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
                    <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto p-6">{children}</div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Delete Confirm
// ---------------------------------------------------------------------------

function DeleteConfirm({ isOpen, onClose, onConfirm, name }) {
    if (!isOpen) return null
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                        <Trash2 size={20} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Delete Client</h3>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                    Are you sure you want to delete <span className="font-semibold text-slate-700 dark:text-slate-200">{name}</span>?
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 px-4 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-rose-500/20 transition-all"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Client Form Modal (create/edit)
// ---------------------------------------------------------------------------

const CLIENT_TYPES = ['company', 'bank', 'third_party']
const CLIENT_TYPE_LABELS = { company: 'Company', bank: 'Bank', third_party: 'Third Party' }

function ClientFormModal({ isOpen, onClose, onSubmit, client }) {
    const [form, setForm] = useState({
        client_name: '', client_type: 'company', contact_person: '',
        email: '', phone: '', country: '', address: '', is_pilot: false, notes: ''
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (client) {
            setForm({
                client_name: client.client_name || '',
                client_type: client.client_type || 'company',
                contact_person: client.contact_person || '',
                email: client.email || '',
                phone: client.phone || '',
                country: client.country || '',
                address: client.address || '',
                is_pilot: client.is_pilot || false,
                notes: client.notes || ''
            })
        } else {
            setForm({
                client_name: '', client_type: 'company', contact_person: '',
                email: '', phone: '', country: '', address: '', is_pilot: false, notes: ''
            })
        }
    }, [client, isOpen])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!form.client_name.trim()) {
            setError('Client name is required')
            return
        }
        setSaving(true)
        try {
            await onSubmit(form)
        } catch (err) {
            setError(err.message || 'Failed to save client')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={client ? 'Edit Client' : 'New Client'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 text-xs font-semibold">
                        {error}
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Client Name *</label>
                        <input
                            type="text"
                            value={form.client_name}
                            onChange={(e) => handleChange('client_name', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            placeholder="Acme Corporation"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Type</label>
                        <select
                            value={form.client_type}
                            onChange={(e) => handleChange('client_type', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                        >
                            {CLIENT_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Contact Person</label>
                        <input
                            type="text"
                            value={form.contact_person}
                            onChange={(e) => handleChange('contact_person', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            placeholder="John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Email</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            placeholder="john@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Phone</label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => handleChange('phone', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            placeholder="+1 555 0100"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Country</label>
                        <input
                            type="text"
                            value={form.country}
                            onChange={(e) => handleChange('country', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            placeholder="Saudi Arabia"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Address</label>
                        <textarea
                            value={form.address}
                            onChange={(e) => handleChange('address', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white resize-none"
                            placeholder="King Fahd Road, Riyadh"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => handleChange('notes', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white resize-none"
                            placeholder="Internal notes..."
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Pilot Client</label>
                        <p className="text-[10px] text-slate-500 mt-0.5">Mark this client as part of the pilot program</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleChange('is_pilot', !form.is_pilot)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_pilot ? 'bg-primary' : 'bg-slate-200 dark:bg-white/10'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_pilot ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 px-4 border border-slate-200 dark:border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                        {client ? 'Update' : 'Create'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ---------------------------------------------------------------------------
// Client Card
// ---------------------------------------------------------------------------

function ClientCard({ client, selected, onToggleSelect, onView, onEdit, onDelete }) {
    const ts = typeStyle(client.client_type)
    const TypeIcon = ts.Icon
    const total = Number(client.total_tasks || 0)
    const done = Number(client.completed_tasks || 0)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0

    return (
        <div
            onClick={onView}
            className={`group relative flex flex-col rounded-2xl border bg-white dark:bg-white/[0.03] p-5 cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 ${
                selected ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 dark:border-white/10 hover:border-primary/40'
            }`}
        >
            {/* select checkbox */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
                className={`absolute top-4 right-4 transition-all ${selected ? 'text-primary' : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-primary'}`}
                title="Select"
            >
                {selected ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>

            {/* header: avatar + name */}
            <div className="flex items-start gap-3 pr-7">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ts.ring} flex items-center justify-center text-white font-black text-sm shadow-lg flex-shrink-0`}>
                    {getInitials(client.client_name)}
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white truncate leading-tight">
                        {client.client_name || 'Untitled'}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight truncate">
                            {client.valyze_id || 'No ID'}
                        </span>
                        {client.is_pilot && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-400/20">
                                <Star size={9} className="fill-current" /> Pilot
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* type badge */}
            <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${ts.badge}`}>
                    <TypeIcon size={12} /> {ts.label}
                </span>
            </div>

            {/* contact / location */}
            <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Briefcase size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="font-semibold truncate">{client.contact_person || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Mail size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{client.email || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <MapPin size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{client.country || '—'}</span>
                </div>
            </div>

            {/* stats: orders + progress */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <FileText size={12} /> {client.total_orders != null ? client.total_orders : 0} orders
                    </span>
                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-300">{done}/{total} done</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            {/* actions */}
            <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={onView}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider hover:bg-primary/20 transition-all"
                >
                    Open <ArrowRight size={13} />
                </button>
                <button
                    onClick={onEdit}
                    className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                    title="Edit"
                >
                    <Edit3 size={16} />
                </button>
                <button
                    onClick={onDelete}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                    title="Delete"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, tint }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
                <Icon size={18} />
            </div>
            <div>
                <div className="text-xl font-black text-slate-800 dark:text-white leading-none">{value}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">{label}</div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClientsPage() {
    const navigate = useNavigate()
    const [clients, setClients] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [editingClient, setEditingClient] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState({ open: false, clientId: null, name: '' })
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [savingAction, setSavingAction] = useState({})

    const search = useMemo(() => searchInput, [searchInput])

    const stats = useMemo(() => {
        const totalOrders = clients.reduce((s, c) => s + Number(c.total_orders || 0), 0)
        const reportsDone = clients.reduce((s, c) => s + Number(c.completed_tasks || 0), 0)
        const pilots = clients.filter(c => c.is_pilot).length
        return { totalClients: clients.length, totalOrders, reportsDone, pilots }
    }, [clients])

    const fetchClients = async () => {
        try {
            setLoading(true)
            const res = await clientsAPI.getAll(search || '')
            setClients(res.data || [])
            setError('')
        } catch (e) {
            setError(e.message || 'Failed to load clients')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchClients()
    }, [search])

    const handleCreate = async (formData) => {
        const res = await clientsAPI.create(formData)
        setShowForm(false)
        fetchClients()
        const newId = res.data?.id
        if (newId) {
            navigate(`/clients/${newId}`)
        }
    }

    const handleUpdate = async (formData) => {
        if (!editingClient) return
        await clientsAPI.update(editingClient.id, formData)
        setEditingClient(null)
        fetchClients()
    }

    const handleDelete = async () => {
        if (!deleteTarget.clientId) return
        await clientsAPI.delete(deleteTarget.clientId)
        setDeleteTarget({ open: false, clientId: null, name: '' })
        fetchClients()
    }

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === clients.length && clients.length > 0) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(clients.map(c => c.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!window.confirm(`Delete ${selectedIds.size} selected client(s)?`)) return
        setSavingAction({ bulkDelete: true })
        try {
            for (const id of selectedIds) {
                await clientsAPI.delete(id)
            }
            setSelectedIds(new Set())
            fetchClients()
        } catch (e) {
            setError('Bulk delete failed: ' + e.message)
        } finally {
            setSavingAction({ bulkDelete: false })
        }
    }

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Clients</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Manage your client base and portal access
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={savingAction.bulkDelete}
                            className="px-4 py-2.5 bg-rose-500 text-white text-xs font-bold uppercase rounded-xl hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-rose-500/20"
                        >
                            {savingAction.bulkDelete ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Delete {selectedIds.size}
                        </button>
                    )}
                    <button
                        onClick={() => { setEditingClient(null); setShowForm(true) }}
                        className="px-4 py-2.5 bg-primary text-white text-xs font-bold uppercase rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
                    >
                        <Plus size={14} /> New Client
                    </button>
                </div>
            </div>

            {/* KPI stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <StatCard icon={Users}        label="Total Clients" value={stats.totalClients} tint="bg-blue-500/10 text-blue-500" />
                <StatCard icon={FileText}     label="Total Orders"  value={stats.totalOrders}  tint="bg-violet-500/10 text-violet-500" />
                <StatCard icon={CheckCircle2} label="Reports Done"  value={stats.reportsDone}  tint="bg-emerald-500/10 text-emerald-500" />
                <StatCard icon={Star}         label="Pilot Clients" value={stats.pilots}       tint="bg-amber-400/15 text-amber-500" />
            </div>

            {/* Toolbar: search + select all */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or Valyze ID..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full pl-10 pr-3 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400 transition-all"
                    />
                </div>
                {clients.length > 0 && (
                    <button
                        onClick={toggleSelectAll}
                        className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-primary/40 hover:text-primary transition-all flex items-center gap-2"
                    >
                        {selectedIds.size === clients.length && clients.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                        {selectedIds.size === clients.length && clients.length > 0 ? 'Clear' : 'Select All'}
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading clients...</span>
                </div>
            ) : clients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-16 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Users size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">
                        No Clients Found
                    </h3>
                    <p className="text-slate-400 text-sm mb-6">
                        {searchInput ? 'Try adjusting your search' : 'Create a new client to get started'}
                    </p>
                    {!searchInput && (
                        <button
                            onClick={() => { setEditingClient(null); setShowForm(true) }}
                            className="px-5 py-2.5 bg-primary text-white text-xs font-bold uppercase rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 inline-flex items-center gap-2 transition-all"
                        >
                            <Plus size={14} /> New Client
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clients.map((client) => (
                        <ClientCard
                            key={client.id}
                            client={client}
                            selected={selectedIds.has(client.id)}
                            onToggleSelect={() => toggleSelect(client.id)}
                            onView={() => navigate(`/clients/${client.id}`)}
                            onEdit={() => { setEditingClient(client); setShowForm(true) }}
                            onDelete={() => setDeleteTarget({ open: true, clientId: client.id, name: client.client_name })}
                        />
                    ))}
                </div>
            )}

            <ClientFormModal
                isOpen={showForm}
                onClose={() => { setShowForm(false); setEditingClient(null) }}
                onSubmit={editingClient ? handleUpdate : handleCreate}
                client={editingClient}
            />

            <DeleteConfirm
                isOpen={deleteTarget.open}
                onClose={() => setDeleteTarget({ open: false, clientId: null, name: '' })}
                onConfirm={handleDelete}
                name={deleteTarget.name}
            />
        </div>
    )
}
