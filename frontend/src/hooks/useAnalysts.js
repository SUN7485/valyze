import { useEffect, useState } from 'react'
import { ordersAPI } from '../api/client'

// Assignable staff, from GET /api/orders/analysts. Fetched once per page load and
// shared by every dropdown; a new user shows up without a code change.
let cache = null
let inflight = null

function load() {
    if (cache) return Promise.resolve(cache)
    if (!inflight) {
        inflight = ordersAPI.getAnalysts()
            .then(res => {
                const list = Array.isArray(res.data?.analysts) ? res.data.analysts : []
                cache = list.filter(a => a && a.email)
                return cache
            })
            .finally(() => { inflight = null })
    }
    return inflight
}

export function useAnalysts() {
    const [analysts, setAnalysts] = useState(cache || [])
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        load()
            .then(list => { if (!cancelled) setAnalysts(list) })
            .catch(e => { if (!cancelled) setError(e.message || 'Could not load analysts') })
        return () => { cancelled = true }
    }, [])

    return { analysts, error }
}
