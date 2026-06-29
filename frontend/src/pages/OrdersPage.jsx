import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Loader2, RefreshCw, Search, User, X } from 'lucide-react'
import { ordersAPI } from '../api/client'

const STATUS_TABS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'invoiced', label: 'Invoiced' },
]

const ANALYST_FILTERS = [
    { value: 'all', label: 'All analysts' },
    { value: 'waleed@valyze.com', label: 'Waleed' },
    { value: 'mohamed@valyze.com', label: 'Mohamed' },
    { value: 'mahmoud@valyze.com', label: 'Mahmoud' },
    { value: 'amani@valyze.com', label: 'Amani' },
    { value: 'sally@valyze.com', label: 'Sally' },
]

const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    invoiced: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
}

const SERVICE_LEVELS = {
    basic: { label: 'Basic', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700' },
    standard: { label: 'Standard', className: 'bg-primary/15 text-primary border-primary/25 dark:bg-primary/20 dark:text-primary' },
    express: { label: 'Express', className: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/40' },
    urgent: { label: 'Urgent', className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40' },
}

function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timeout)
    }, [value, delay])

    return debouncedValue
}

function normalizeStatus(status) {
    return String(status || 'pending').toLowerCase()
}

function normalizeServiceLevel(level) {
    return String(level || 'standard').toLowerCase()
}

function formatShortDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(value) {
    const clean = String(value || 'Valyze')
        .replace('@valyze.com', '')
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(part => part[0])
        .join('')
        .toUpperCase()

    return clean.slice(0, 2) || 'VA'
}

function getAnalystLabel(value) {
    const analyst = ANALYST_FILTERS.find(item => item.value === value)
    return analyst?.label || value || 'Unassigned'
}

function getDueDateState(value) {
    if (!value) return { label: 'No due date', className: 'text-slate-400 dark:text-slate-500' }

    const dueDate = new Date(value)
    if (Number.isNaN(dueDate.getTime())) return { label: 'Due date unavailable', className: 'text-slate-400 dark:text-slate-500' }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)

    if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, className: 'text-rose-600 dark:text-rose-400 font-bold' }
    if (diffDays <= 2) return { label: diffDays === 0 ? 'Due today' : `Due in ${diffDays}d`, className: 'text-orange-500 dark:text-orange-400 font-bold' }

    return { label: formatShortDate(value), className: 'text-slate-500 dark:text-slate-400' }
}

function StatusBadge({ status }) {
    const normalized = normalizeStatus(status)
    const label = normalized === 'in_progress' ? 'In Progress' : normalized.charAt(0).toUpperCase() + normalized.slice(1)

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[normalized] || STATUS_COLORS.pending}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {label}
        </span>
    )
}

function ServiceLevelBadge({ level }) {
    const normalized = normalizeServiceLevel(level)
    const config = SERVICE_LEVELS[normalized] || SERVICE_LEVELS.standard

    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${config.className}`}>
            {config.label}
        </span>
    )
}

function Avatar({ value }) {
    return (
        <div className="w-9 h-9 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-black shadow-lg shadow-slate-900/10">
            {getInitials(value)}
        </div>
    )
}

function OrderCard({ order }) {
    const navigate = useNavigate()
    const total = Number(order.company_count || order.progress?.total || 0)
    const completed = Number(order.completed_count || order.progress?.completed || 0)
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const dueDate = getDueDateState(order.due_date)

    return (
        <div className="glass-card p-6 bg-white/60 dark:bg-white/5 cursor-default group">
            <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm font-black text-primary tracking-tight">{order.order_number || order.id}</span>
                        <StatusBadge status={order.status} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">{order.client_name || 'Untitled Client'}</h3>
                    {order.client_id && <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-tighter">{order.client_id}</p>}
                </div>
                <ServiceLevelBadge level={order.service_level} />
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        <CalendarClock size={12} /> Due Date
                    </div>
                    <div className={`text-sm font-bold ${dueDate.className}`}>{dueDate.label}</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        <User size={12} /> Analyst
                    </div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{getAnalystLabel(order.auto_assigned_analyst)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 p-3">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        <CheckCircle2 size={12} /> Progress
                    </div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{completed}/{total}</div>
                </div>
            </div>

            <div className="mb-6">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    <span>Company Completion</span>
                    <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
            </div>

            <button
                onClick={() => navigate(`/orders/${order.id}`)}
                className="w-full py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`View order ${order.order_number || order.id}`}
            >
                View Order <ArrowRight size={14} />
            </button>
        </div>
    )
}

export default function OrdersPage() {
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [statusFilter, setStatusFilter] = useState('all')
    const [analystFilter, setAnalystFilter] = useState('all')
    const [searchInput, setSearchInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const search = useDebounce(searchInput, 300)

    const fetchOrders = useCallback(async () => {
        try {
            setLoading(true)
            setError('')
            const response = await ordersAPI.getAll({ status: statusFilter, analyst: analystFilter })
            const data = Array.isArray(response.data) ? response.data : response.data.orders || []
            setOrders(data)
        } catch (e) {
            setError(e.message || 'Failed to load orders')
        } finally {
            setLoading(false)
        }
    }, [statusFilter, analystFilter])

    useEffect(() => {
        fetchOrders()
    }, [fetchOrders])

    const filteredOrders = useMemo(() => {
        if (!search.trim()) return orders

        const query = search.toLowerCase()
        return orders.filter(order => {
            const searchable = [
                order.order_number,
                order.client_name,
                order.client_id,
                order.id,
            ].filter(Boolean).join(' ').toLowerCase()

            return searchable.includes(query)
        })
    }, [orders, search])

    const counts = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(order => order.status === 'pending').length,
        inProgress: orders.filter(order => order.status === 'in_progress').length,
        completed: orders.filter(order => order.status === 'completed').length,
        invoiced: orders.filter(order => order.status === 'invoiced').length,
    }), [orders])

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Batches</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Track client batches, company progress, deadlines, and invoice readiness.
                    </p>
                </div>
                <button
                    onClick={() => fetchOrders()}
                    disabled={loading}
                    className="p-3 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                    aria-label="Refresh orders"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Total Batches', value: counts.total, className: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' },
                    { label: 'Pending', value: counts.pending, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
                    { label: 'In Progress', value: counts.inProgress, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
                    { label: 'Completed', value: counts.completed, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
                ].map(stat => (
                    <div key={stat.label} className={`rounded-2xl border border-white/20 dark:border-white/5 p-5 shadow-sm ${stat.className}`}>
                        <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{stat.label}</div>
                        <div className="text-3xl font-black mt-2">{stat.value}</div>
                    </div>
                ))}
            </div>

            <div className="glass-card p-4 mb-6 cursor-default">
                <div className="flex flex-col xl:flex-row gap-4">
                    <div className="flex-1">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Status</div>
                        <div className="flex flex-wrap gap-2">
                            {STATUS_TABS.map(tab => (
                                <button
                                    key={tab.value}
                                    onClick={() => setStatusFilter(tab.value)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                        statusFilter === tab.value
                                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-full xl:w-56">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Analyst</label>
                        <select
                            value={analystFilter}
                            onChange={(e) => setAnalystFilter(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                            aria-label="Filter orders by analyst"
                        >
                            {ANALYST_FILTERS.map(analyst => (
                                <option key={analyst.value} value={analyst.value}>{analyst.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="w-full xl:flex-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Search</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Order number or client name"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
                                aria-label="Search orders"
                            />
                        </div>
                    </div>
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
                    <span className="ml-4 text-slate-500">Loading orders...</span>
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">No Batches Found</h3>
                    <p className="text-slate-400 text-sm">Try changing the status, analyst, or search filter.</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredOrders.map(order => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </div>
            )}
        </div>
    )
}
