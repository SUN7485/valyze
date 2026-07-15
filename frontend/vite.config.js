import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy for the SPA.
// connect-src must include the backend origin (VITE_API_BASE_URL) because the
// Extractor and every page talk to the backend (proxy, uploads, reports); the
// Anthropic API is included for the direct-browser fallback path.
export function buildCsp(backendOrigin) {
  const connect = ["'self'", backendOrigin, 'https://api.anthropic.com']
    .filter(Boolean)
    .join(' ')
  return [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `connect-src ${connect}`,
  ].join('; ')
}

// Inject the CSP meta tag into the built index.html ONLY.
// A static meta tag in index.html would break the dev server, whose HMR relies
// on inline script injection and a websocket that a strict script-src blocks.
function cspPlugin(backendOrigin) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(backendOrigin)}">`
  return {
    name: 'valyze-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('</head>', `    ${tag}\n  </head>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), cspPlugin(env.VITE_API_BASE_URL || '')],
    server: {
      port: 1573,
    },
  }
})
