import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock, Loader2, RefreshCw, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { ordersAPI } from '../api/client'

const STATUS_TABS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' },
]

const SPEED_LEVELS = {
    '7_days': { label: '7 Days', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700' },
    '5_days': { label: '5 Days', className: 'bg-primary/15 text-primary border-primary/25 dark:bg-primary/20 dark:text-primary' },
    '3_days': { label: '3 Days', className: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/40' },
    '2_days': { label: '2 Days', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40' },
    '1_day': { label: '1 Day', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/40' },
    '24_hours': { label: '24 Hours', className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40' },
}

const COUNTRY_FLAGS = {
    egypt: '🇪🇬', 'eg': '🇪🇬',
    'saudi arabia': '🇸🇦', 'sa': '🇸🇦', saudi: '🇸🇦',
    uae: '🇦🇪', 'ae': '🇦🇪', 'united arab emirates': '🇦🇪',
    jordan: '🇯🇴', jo: '🇯🇴',
    qatar: '🇶🇦', qa: '🇶🇦',
    bahrain: '🇧🇭', bh: '🇧🇭',
    oman: '🇴🇲', om: '🇴🇲',
}

const SUPPORTED_COUNTRIES = [
    { value: '', label: 'All Countries' },
    { value: 'Egypt', label: 'Egypt' },
    { value: 'Saudi Arabia', label: 'Saudi Arabia' },
    { value: 'UAE', label: 'UAE' },
    { value: 'Jordan', label: 'Jordan' },
    { value: 'Qatar', label: 'Qatar' },
    { value: 'Bahrain', label: 'Bahrain' },
    { value: 'Oman', label: 'Oman' },
]

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

function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getCountryFlag(country) {
    if (!country) return '🌍'
    const key = String(country).trim().toLowerCase().replace(/\s+/g, ' ')
    return COUNTRY_FLAGS[key] || '🌍'
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
    if (diffDays === 0) return { label: 'Due today', className: 'text-orange-500 dark:text-orange-400 font-bold' }
    if (diffDays <= 2) return { label: `Due in ${diffDays}d`, className: 'text-orange-500 dark:text-orange-400 font-bold' }
    return { label: formatDate(value), className: 'text-slate-500 dark:text-slate-400' }
}

function StatusBadge({ status, dueDate }) {
    const normalized = normalizeStatus(status)
    const dueState = dueDate ? getDueDateState(dueDate) : null
    
    const getBadgeStyle = () => {
        if (normalized === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40'
        if (normalized === 'in_progress') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40'
        if (dueState && dueState.label.startsWith('Overdue')) return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40'
        if (dueState && dueState.label.startsWith('Due in')) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40'
        return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40'
    }

    const label = normalized === 'in_progress' ? 'In Progress' : normalized === 'completed' ? 'Complete' : normalized.charAt(0).toUpperCase() + normalized.slice(1)

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getBadgeStyle()}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {label}
        </span>
    )
}

function SpeedBadge({ level, dueDate }) {
    const getDaysLeft = () => {
        if (!dueDate) return null
        const due = new Date(dueDate)
        if (Number.isNaN(due.getTime())) return null
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000)
        if (diff < 0) return 'OVERDUE'
        if (diff === 0) return 'TODAY'
        return `${diff}d`
    }

    const daysLeft = getDaysLeft()
    
    if (daysLeft === 'OVERDUE') {
        return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40">
                Overdue
            </span>
        )
    }

    return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700">
            <CalendarClock size={10} className="mr-1" />
            {daysLeft || '-'}
        </span>
    )
}

function ReportTypeBadge({ type }) {
    if (!type) return null
    const types = String(type).split(',').map(t => t.trim()).filter(Boolean)
    if (types.length === 0) return null
    
    return (
        <div className="flex flex-wrap gap-1">
            {types.map((t, i) => (
                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                    {t.replace('_', ' ')}
                </span>
            ))}
        </div>
    )
}

function OrderRow({ order }) {
    const navigate = useNavigate()
    const dueDate = getDueDateState(order.due_date)

    return (
        <tr className="group hover:bg-slate-50/80 dark:hover:bg-white/5 transition-all duration-200 cursor-default">
            <td className="px-4 py-4">
                <span className="font-mono text-sm font-black text-primary">
                    {order.order_number || order.id?.slice(0, 8)}
                </span>
            </td>
            <td className="px-4 py-4">
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {order.client_name || 'Unknown Client'}
                    </span>
                </div>
            </td>
            <td className="px-4 py-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {order.client_id || '-'}
                </span>
            </td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{getCountryFlag(order.country)}</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {order.company_name || '-'}
                    </span>
                </div>
            </td>
            <td className="px-4 py-4">
                <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {order.country || '-'}
                </span>
            </td>
            <td className="px-4 py-4">
                <span className="font-mono text-xs">
                    {order.report_id || '-'}
                </span>
            </td>
            <td className="px-4 py-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(order.date_received || order.created_at)}
                </span>
            </td>
            <td className="px-4 py-4">
                <span className={`text-xs font-medium ${dueDate.className}`}>
                    {dueDate.label}
                </span>
            </td>
            <td className="px-4 py-4">
                <ReportTypeBadge type={order.report_types || order.report_type} />
            </td>
            <td className="px-4 py-4">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                    {order.analyst_assigned || order.auto_assigned_analyst || '-'}
                </span>
            </td>
            <td className="px-4 py-4">
                <SpeedBadge level={order.service_level} dueDate={order.due_date} />
            </td>
        </tr>
    )
}

export default function OrderdsPage() {
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [countryFilter, setCountryFilter] = useState('')
    const [researcherFilter, setResearcherFilter] = useState('all')
    const [reportTypeFilter, setReportTypeFilter] = useState('all')
    const [sortBy, setSortBy] = useState('due_date')
    const [sortDir, setSortDir] = useState('asc')

    const search = useDebounce(searchInput, 300)

    const fetchOrderCompanies = useCallback(async () => {
        try {
            setLoading(true)
            setError('')
            const response = await ordersAPI.getAllOrderCompanies({ status: statusFilter, country: countryFilter, search })
            setOrders(response.data || [])
        } catch (e) {
            setError(e.message || 'Failed to load reports')
        } finally {
            setLoading(false)
        }
    }, [statusFilter, countryFilter, search])

    useEffect(() => {
        fetchOrderCompanies()
    }, [fetchOrderCompanies])

    const sortedOrders = useMemo(() => {
        return [...orders].sort((a, b) => {
            let aVal = a[sortBy] || ''
            let bVal = b[sortBy] || ''
            
            if (sortBy === 'due_date' && aVal && bVal) {
                aVal = new Date(aVal).getTime()
                bVal = new Date(bVal).getTime()
            }
            
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    }, [orders, sortBy, sortDir])

    const counts = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(o => normalizeStatus(o.status) === 'pending').length,
        inProgress: orders.filter(o => normalizeStatus(o.status) === 'in_progress').length,
        completed: orders.filter(o => normalizeStatus(o.status) === 'completed').length,
        overdue: orders.filter(o => {
            const due = o.due_date ? new Date(o.due_date) : null
            return due && due < new Date() && normalizeStatus(o.status) !== 'completed'
        }).length,
    }), [orders])

    const SortableHeader = ({ column, label }) => (
        <th className="px-4 py-4">
            <button
                onClick={() => {
                    if (sortBy === column) {
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                    } else {
                        setSortBy(column)
                        setSortDir('asc')
                    }
                }}
                className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap hover:text-primary transition-colors"
            >
                {label}
                {sortBy === column && (
                    sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                )}
            </button>
        </th>
    )

    return (
        <div className="py-8 px-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Reports (Orderds)</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Individual reports sorted by due date. Each row represents one company report.
                    </p>
                </div>
                <button
                    onClick={fetchOrderCompanies}
                    disabled={loading}
                    className="p-3 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                    aria-label="Refresh reports"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Total Reports', value: counts.total, className: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' },
                    { label: 'Pending', value: counts.pending, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
                    { label: 'In Progress', value: counts.inProgress, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
                    { label: 'Complete', value: counts.completed, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
                    { label: 'Overdue', value: counts.overdue, className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
                ].map(stat => (
                    <div key={stat.label} className={`rounded-2xl border border-white/20 dark:border-white/5 p-5 shadow-sm ${stat.className}`}>
                        <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{stat.label}</div>
                        <div className="text-3xl font-black mt-2">{stat.value}</div>
                    </div>
                ))}
            </div>

            <div className="glass-card p-4 mb-6">
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
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Country</label>
                        <select
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white"
                        >
                            {SUPPORTED_COUNTRIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
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
                                placeholder="Order ID, client, company, report ID..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm dark:text-white placeholder-slate-400"
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
                    <span className="ml-4 text-slate-500">Loading reports...</span>
                </div>
            ) : orders.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">No Reports Found</h3>
                    <p className="text-slate-400 text-sm">Try adjusting the status, country, or search filter.</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-200 dark:border-white/10">
                                <SortableHeader column="order_number" label="Order ID" />
                                <SortableHeader column="client_name" label="Client Name" />
                                <SortableHeader column="client_id" label="Client Ref" />
                                <SortableHeader column="company_name" label="Company Name" />
                                <SortableHeader column="country" label="Country" />
                                <SortableHeader column="report_id" label="Report ID" />
                                <SortableHeader column="date_received" label="Order Date" />
                                <SortableHeader column="due_date" label="Due Date" />
                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Report Type</th>
                                <SortableHeader column="analyst_assigned" label="Researcher" />
                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Speed</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {sortedOrders.map(order => (
                                <OrderRow key={order.id} order={order} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}