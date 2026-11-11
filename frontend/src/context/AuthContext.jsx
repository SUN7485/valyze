import React, { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

const hasStoredToken = () => {
    const token = localStorage.getItem('valyze_token')
    return Boolean(token && token !== 'null' && token !== 'undefined')
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    // Only show the loading state when there is a token to verify
    const [loading, setLoading] = useState(hasStoredToken)

    // On mount, check if token exists and verify it
    useEffect(() => {
        if (hasStoredToken()) {
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
                .catch(() => {
                    localStorage.removeItem('valyze_token')
                    setUser(null)
                })
                .finally(() => setLoading(false))
        } else {
            // user already starts null and loading already starts false
            localStorage.removeItem('valyze_token')
        }
    }, [])

    const login = async (email, password) => {
        const res = await authAPI.login(email, password)
        const data = res.data
        if (!data || typeof data !== 'object' || !data.token || !data.user) {
            throw new Error('Invalid server response — please try again')
        }
        const { token, user: userData } = data
        localStorage.setItem('valyze_token', token)
        setUser(userData)
        return userData
    }

    const logout = () => {
        localStorage.removeItem('valyze_token')
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is colocated with its provider; splitting would touch every consumer's import
export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}