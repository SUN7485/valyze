import React from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error("FATAL UI ERROR:", error, errorInfo)
        this.setState({ errorInfo })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center shadow-inner">
                    <div className="max-w-2xl w-full bg-white p-12 rounded-[3rem] shadow-2xl border border-red-50">
                        <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
                            <AlertTriangle size={48} />
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 mb-4">UI Rendering Crash</h1>
                        <p className="text-gray-500 text-lg mb-8 font-medium italic">
                            A critical error occurred while rendering this page.
                        </p>

                        <div className="bg-red-50/50 rounded-2xl p-6 mb-8 text-left border border-red-100 overflow-hidden">
                            <p className="text-red-600 font-bold mb-2 uppercase text-xs tracking-widest">Error Message:</p>
                            <code className="text-sm font-mono text-red-800 break-words">
                                {this.state.error?.message || "Unknown error"}
                            </code>
                        </div>

                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => window.location.reload()}
                                className="flex items-center justify-center gap-2 w-full py-4 bg-[#1a5f7a] text-white rounded-2xl font-black hover:bg-[#134e64] transition-all active:scale-95 shadow-lg shadow-blue-900/20"
                            >
                                <RefreshCcw size={18} /> RELOAD APPLICATION
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
                            >
                                BACK TO DASHBOARD
                            </button>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                            <pre className="mt-8 text-[10px] text-left text-gray-400 font-mono overflow-auto max-h-40 p-4 bg-gray-100 rounded-xl">
                                {this.state.errorInfo.componentStack}
                            </pre>
                        )}
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
