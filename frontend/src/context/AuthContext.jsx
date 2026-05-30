import React, { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    // On mount, check if token exists and verify it
    useEffect(() => {
        const token = localStorage.getItem('valyze_token')
        if (token) {
            authAPI.me()
                .then(res => {
                    setUser(res.data)
                })
                .catch(() => {
                    localStorage.removeItem('valyze_token')
                    setUser(null)
                })
                .finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
    }, [])

    const login = async (email, password) => {
        const res = await authAPI.login(email, password)
        const { token, user: userData } = res.data
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

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}