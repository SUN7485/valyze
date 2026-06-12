import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck, UserPlus, RefreshCw, Save, Trash2, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usersAPI } from '../api/client'

const ROLE_OPTIONS = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'analyst', label: 'Analyst' },
    { value: 'reviewer', label: 'Reviewer' },
]

const ROLE_COLORS = {
    super_admin: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    admin: 'bg-primary/10 text-primary border-primary/20',
    analyst: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    reviewer: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10',
}

const inputClasses = 'w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary dark:text-white dark:placeholder-slate-500'
const buttonClasses = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed'

function RoleBadge({ role }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${ROLE_COLORS[role] || ROLE_COLORS.analyst}`}>
            {role.replace(/_/g, ' ')}
        </span>
    )
}

function UserRow({ user, currentUser, onSave, onDelete }) {
    const [row, setRow] = useState({
        name: user.name,
        role: user.role,
        password: '',
    })
    const [saving, setSaving] = useState(false)
    const isSelf = currentUser?.id === user.id

    const updateField = (field, value) => setRow(current => ({ ...current, [field]: value }))

    const handleSave = async () => {
        const payload = {
            name: row.name,
            role: row.role,
        }
        if (row.password.trim()) payload.password = row.password

        setSaving(true)
        try {
            await onSave(user.id, payload)
            setRow(current => ({ ...current, password: '' }))
        } finally {
            setSaving(false)
        }
    }

    return (
        <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
            <td className="p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-xs font-black">
                        {user.name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'VA'}
                    </div>
                    <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-white">{user.name}</div>
                        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">{user.email}</div>
                    </div>
                </div>
            </td>
            <td className="p-4">
                <select
                    value={row.role}
                    onChange={event => updateField('role', event.target.value)}
                    className={inputClasses}
                    aria-label={`Role for ${user.email}`}
                >
                    {ROLE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </td>
            <td className="p-4">
                <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="password"
                        value={row.password}
                        onChange={event => updateField('password', event.target.value)}
                        placeholder="Optional new password"
                        className={`${inputClasses} pl-10`}
                        aria-label={`New password for ${user.email}`}
                    />
                </div>
            </td>
            <td className="p-4">
                <RoleBadge role={user.role} />
            </td>
            <td className="p-4">
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`${buttonClasses} bg-primary text-white shadow-lg shadow-primary/20 hover:opacity-90`}
                        aria-label={`Save ${user.email}`}
                    >
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save
                    </button>
                    <button
                        onClick={() => onDelete(user)}
                        disabled={isSelf}
                        className={`${buttonClasses} border border-rose-200 dark:border-rose-500/20 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-30`}
                        aria-label={`Delete ${user.email}`}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </td>
        </tr>
    )
}

export default function UsersPage() {
    const { user: currentUser } = useAuth()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [form, setForm] = useState({
        email: '',
        name: '',
        role: 'analyst',
        password: '',
    })

    const counts = useMemo(() => {
        const result = { super_admin: 0, admin: 0, analyst: 0, reviewer: 0 }
        users.forEach(item => {
            result[item.role] = (result[item.role] || 0) + 1
        })
        return result
    }, [users])

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true)
            setError('')
            const response = await usersAPI.getAll()
            setUsers(response.data?.users || [])
        } catch (e) {
            setError(e.message || 'Failed to load users')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const updateField = (field, value) => {
        setForm(current => ({ ...current, [field]: value }))
        setMessage('')
    }

    const handleCreate = async event => {
        event.preventDefault()
        setSaving(true)
        setError('')
        setMessage('')
        try {
            const created = await usersAPI.create(form)
            setUsers(current => [...current, created.data])
            setForm({ email: '', name: '', role: 'analyst', password: '' })
            setMessage('User created successfully')
        } catch (e) {
            setError(e.message || 'Failed to create user')
        } finally {
            setSaving(false)
        }
    }

    const handleSave = async (id, payload) => {
        setError('')
        setMessage('')
        const updated = await usersAPI.update(id, payload)
        setUsers(current => current.map(item => item.id === id ? updated.data : item))
        setMessage('User updated successfully')
    }

    const handleDelete = async user => {
        if (!window.confirm(`Remove ${user.email} from Valyze?`)) return

        setError('')
        setMessage('')
        try {
            await usersAPI.delete(user.id)
            setUsers(current => current.filter(item => item.id !== user.id))
            setMessage('User removed successfully')
        } catch (e) {
            setError(e.message || 'Failed to remove user')
        }
    }

    if (currentUser?.role !== 'super_admin') {
        return (
            <div className="glass-card p-8 text-center">
                <ShieldCheck size={48} className="mx-auto text-primary mb-4" />
                <h1 className="text-2xl font-black text-slate-800 dark:text-white">Access denied</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Only a super admin can manage user roles.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">User Access</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Control admin access, reviewer access, and account roles.</p>
                </div>
                <button
                    onClick={fetchUsers}
                    disabled={loading}
                    className={`${buttonClasses} bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10`}
                    aria-label="Refresh users"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ROLE_OPTIONS.map(role => (
                    <div key={role.value} className="glass-card p-5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{role.label}</div>
                        <div className="text-3xl font-black text-slate-800 dark:text-white mt-2">{counts[role.value] || 0}</div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleCreate} className="glass-card p-5">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <UserPlus size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-white">Create user</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Add a new account and assign its role.</p>
                    </div>
                </div>

                <div className="grid md:grid-cols-5 gap-4">
                    <input type="email" required value={form.email} onChange={event => updateField('email', event.target.value)} placeholder="Email" className={inputClasses} />
                    <input value={form.name} onChange={event => updateField('name', event.target.value)} placeholder="Display name" className={inputClasses} />
                    <select value={form.role} onChange={event => updateField('role', event.target.value)} className={inputClasses}>
                        {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <input type="password" required minLength={8} value={form.password} onChange={event => updateField('password', event.target.value)} placeholder="Password" className={inputClasses} />
                    <button disabled={saving} className={`${buttonClasses} bg-primary text-white shadow-lg shadow-primary/20 hover:opacity-90`}>
                        {saving ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />} Create
                    </button>
                </div>
            </form>

            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-sm font-bold">
                    {error}
                </div>
            )}
            {message && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-bold">
                    {message}
                </div>
            )}

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="text-left p-4">User</th>
                                <th className="text-left p-4">Role</th>
                                <th className="text-left p-4">Password</th>
                                <th className="text-left p-4">Current role</th>
                                <th className="text-right p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-slate-500 dark:text-slate-400">Loading users...</td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-slate-500 dark:text-slate-400">No users found</td>
                                </tr>
                            ) : (
                                users.map(item => (
                                    <UserRow key={item.id} user={item} currentUser={currentUser} onSave={handleSave} onDelete={handleDelete} />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
