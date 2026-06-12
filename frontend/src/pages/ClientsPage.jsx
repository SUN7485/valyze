import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Eye, Edit3, Trash2, X, Loader2, CheckSquare, Square } from 'lucide-react'
import { clientsAPI } from '../api/client'

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
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Clients</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {clients.length} total clients
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={savingAction.bulkDelete}
                            className="px-4 py-2.5 bg-rose-500 text-white text-xs font-bold uppercase rounded-lg hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2 transition-all"
                        >
                            {savingAction.bulkDelete ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Delete {selectedIds.size}
                        </button>
                    )}
                    <button
                        onClick={() => { setEditingClient(null); setShowForm(true) }}
                        className="px-4 py-2.5 bg-primary text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
                    >
                        <Plus size={14} /> New Client
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="glass-card p-4 mb-6">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or Valyze ID..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
                    />
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                    <X size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="ml-4 text-slate-500">Loading clients...</span>
                </div>
            ) : clients.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">
                        No Clients Found
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {searchInput ? 'Try adjusting your search' : 'Create a new client to get started'}
                    </p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-200 dark:border-white/10">
                                <th className="w-12 px-4 py-4">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-slate-400 hover:text-primary transition-colors"
                                        title="Select All"
                                    >
                                        {selectedIds.size === clients.length && clients.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Valyze ID</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Country</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Orders</th>
                                <th className="text-left px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessions</th>
                                <th className="text-right px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {clients.map((client) => (
                                <tr
                                    key={client.id}
                                    className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all duration-200 cursor-pointer"
                                    onClick={() => navigate(`/clients/${client.id}`)}
                                >
                                    <td className="px-4 py-4">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(client.id) }}
                                            className="text-slate-300 group-hover:text-slate-400 hover:text-primary transition-colors"
                                        >
                                            {selectedIds.has(client.id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                                            {client.valyze_id || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 min-w-[200px]">
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                            {client.client_name || 'Untitled'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                                            {client.client_type || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                {client.contact_person || '-'}
                                            </span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                                {client.email || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {client.country || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {client.total_orders != null ? client.total_orders : '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {client.active_sessions != null ? client.active_sessions : '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => navigate(`/clients/${client.id}`)}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                title="View"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            <button
                                                onClick={() => { setEditingClient(client); setShowForm(true) }}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Edit3 size={18} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget({ open: true, clientId: client.id, name: client.client_name })}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
