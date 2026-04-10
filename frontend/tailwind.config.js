/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: "#F59E0B",
                "primary-soft": "#FCD34D",
                "primary-muted": "#FEF3C7",
                secondary: "#FBBF24",
                cta: "#8B5CF6",
                "cta-soft": "#A78BFA",
                "cta-muted": "#EDE9FE",
                accent: "#06B6D4",
                "dark-bg": "#0B1120",
            },
            fontFamily: {
                sans: ['"Inter"', '"Fira Sans"', "system-ui", "sans-serif"],
                mono: ['"Fira Code"', "monospace"],
            },
            backdropBlur: {
                xs: "2px",
            },
            boxShadow: {
                'glow': '0 0 40px -10px rgba(245, 158, 11, 0.3)',
                'glow-cta': '0 0 40px -10px rgba(139, 92, 246, 0.3)',
                'inner-soft': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.03)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in': 'fadeIn 300ms ease-out',
                'slide-up': 'slideInBottom 300ms ease-out',
                'slide-down': 'slideInTop 300ms ease-out',
                'zoom-in': 'zoomIn95 300ms ease-out',
                'spin-in': 'spinIn 500ms ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideInBottom: {
                    '0%': { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideInTop: {
                    '0%': { opacity: '0', transform: 'translateY(-8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                zoomIn95: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                spinIn: {
                    '0%': { opacity: '0', transform: 'rotate(-180deg) scale(0)' },
                    '100%': { opacity: '1', transform: 'rotate(0deg) scale(1)' },
                },
            },
        },
    },
    plugins: [],
}
