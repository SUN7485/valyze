import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDarkMode } from '../hooks/useDarkMode'
import { useAuth } from '../context/AuthContext'
import { Sun, Moon, Info, Shield, FileText, ClipboardList, ListChecks, Receipt, LogOut, Building2, Users } from 'lucide-react'

export default function Layout({ children }) {
    const { darkMode, toggleDarkMode } = useDarkMode()
    const { user, logout } = useAuth()
    const location = useLocation()

    return (
        <div className="min-h-screen bg-[var(--color-background)] dark:bg-dark-bg text-[var(--color-text)] transition-colors duration-300">
            {/* Glassmorphism Navbar */}
            <nav className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-white/5 px-6 py-3 shadow-sm bg-white/70 dark:bg-[#0F172A]/70">
                <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
                    <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-all duration-300 group">
                        <Shield className="w-10 h-10 text-primary" />
                        <div className="flex flex-col">
                            <span className="text-xl font-bold tracking-tight leading-none text-slate-900 dark:text-white">
                                Valyze
                            </span>
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                                Credit Intelligence
                            </span>
                        </div>
                    </Link>
                    
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/5 text-[9px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-500">
                            <Info size={11} className="text-primary" />
                            System Active • v2.0
                        </div>

                        <Link
                            to="/reports"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                location.pathname === '/reports'
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                            <FileText size={14} />
                            Reports
                        </Link>

                        <Link
                            to="/clients"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                location.pathname.startsWith('/clients')
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                            <Building2 size={14} />
                            Clients
                        </Link>

                        <Link
                            to="/orders"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                location.pathname.startsWith('/orders') && !location.pathname.startsWith('/orderds')
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                            <ClipboardList size={14} />
                            Orders
                        </Link>

                        <Link
                            to="/orderds"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                location.pathname.startsWith('/orderds')
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                            <ListChecks size={14} />
                            Work Queue
                        </Link>

                        <Link
                            to="/invoices"
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                location.pathname.startsWith('/invoices')
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                            <Receipt size={14} />
                            Invoices
                        </Link>

                        {user?.role === 'super_admin' && (
                            <Link
                                to="/users"
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                    location.pathname.startsWith('/users')
                                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
                                }`}
                            >
                                <Users size={14} />
                                Users
                            </Link>
                        )}

                        {/* User info + logout */}

                        {user && (
                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/5">
                                    <Shield size={12} className="text-primary" />
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                        {user.name || user.email}
                                    </span>
                                    <span className="text-[8px] font-black uppercase tracking-wider text-primary">
                                        {user.role}
                                    </span>
                                </div>
                                <button
                                    onClick={logout}
                                    title="Log out"
                                    className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-rose-400 dark:hover:border-rose-400 transition-all duration-300 shadow-sm cursor-pointer group"
                                >
                                    <LogOut size={18} className="text-slate-600 dark:text-slate-400 group-hover:text-rose-500" />
                                </button>
                            </div>
                        )}

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 
                                     hover:border-primary/40 transition-all duration-300 
                                     shadow-sm cursor-pointer group"
                            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {darkMode ? (
                                <Sun size={18} className="text-primary animate-in spin-in-180 duration-500" />
                            ) : (
                                <Moon size={18} className="text-slate-600 dark:text-slate-400 animate-in spin-in-180 duration-500" />
                            )}
                        </button>
                    </div>
                </div>
            </nav>

            <main className="w-full max-w-screen-2xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {children}
            </main>
            
            {/* Subtle Gradient Background Blurs */}
            <div className="fixed -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-cta/5 rounded-full blur-[120px] pointer-events-none" />
        </div>
    )
}
