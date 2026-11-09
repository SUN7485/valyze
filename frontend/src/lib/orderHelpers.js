// Helpers shared by the order list pages (OrdersPage "Batch" and OrderdsPage
// "Work Queue") and the order detail pages.
import { useEffect, useState } from 'react'

export function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timeout)
    }, [value, delay])
    return debouncedValue
}

export function normalizeStatus(status) {
    return String(status || 'pending').toLowerCase()
}

export function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function getDueDateState(value) {
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

// Analyst filter options for the list pages: the two pseudo-filters plus every
// assignable user (from useAnalysts — never a hardcoded list).
export function buildAnalystFilters(analysts, allLabel = 'All analysts') {
    return [
        { value: 'all', label: allLabel },
        { value: 'unassigned', label: 'Unassigned' },
        ...analysts.map(a => ({ value: a.email, label: a.name || a.email })),
    ]
}

export function analystLabel(analysts, email) {
    if (!email) return 'Unassigned'
    const match = analysts.find(a => String(a.email).toLowerCase() === String(email).toLowerCase())
    return match?.name || email
}
