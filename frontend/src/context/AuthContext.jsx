import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { authAPI, clearUserStorage, onUnauthorized } from '../api/client'
import { useReport } from './ReportContext'

const AuthContext = createContext(null)

const ADMIN_ROLES = ['admin', 'super_admin']

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const { clearReport } = useReport()

    // Drop everything that belongs to this user: token, Anthropic key, pending
    // import, current report — and the in-memory report held by ReportContext.
    const endSession = useCallback(() => {
        clearUserStorage()
        clearReport()
        setUser(null)
    }, [clearReport])

    // On mount, check if token exists and verify it
    useEffect(() => {
        const token = localStorage.getItem('valyze_token')
        const isValid = token && token !== 'null' && token !== 'undefined'
        if (isValid) {
            authAPI.me()
                .then(res => {
                    const data = res.data
                    if (data && typeof data === 'object' && data.id) {
                        setUser(data)
                    } else {
                        localStorage.removeItem('valyze_token')
                        setUser(null)
                    }
                })
                .catch((err) => {
                    // Only a 401 means the token is dead. A network blip or a 500
                    // must not log the user out (and wipe their API key) — keep the
                    // token and let them retry by reloading.
                    if (err?.status === 401) {
                        endSession()
                    } else {
                        console.error('[Auth] Could not verify session:', err?.message || err)
                        setUser(null)
                    }
                })
                .finally(() => setLoading(false))
        } else {
            localStorage.removeItem('valyze_token')
            setUser(null)
            setLoading(false)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Any 401 from a staff endpoint: the session is over — clear it and let
    // ProtectedRoute send the user to /login.
    useEffect(() => onUnauthorized(() => endSession()), [endSession])

    const login = useCallback(async (email, password) => {
        const res = await authAPI.login(email, password)
        const data = res.data
        if (!data || typeof data !== 'object' || !data.token || !data.user) {
            throw new Error('Invalid server response — please try again')
        }
        const { token, user: userData } = data
        localStorage.setItem('valyze_token', token)
        setUser(userData)
        return userData
    }, [])

    const logout = useCallback(() => {
        endSession()
    }, [endSession])

    const role = user?.role || null
    const isAdmin = ADMIN_ROLES.includes(role)

    const value = useMemo(
        () => ({ user, role, isAdmin, login, logout, loading }),
        [user, role, isAdmin, login, logout, loading]
    )

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
