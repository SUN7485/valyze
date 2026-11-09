/**
 * Show or print HTML that came from the server (report PDF view, invoices, order
 * documents) WITHOUT giving it this app's origin.
 *
 * Writing server HTML into an `about:blank` window or a plain iframe makes it
 * same-origin with the app: any script that slipped through server-side escaping
 * could read the staff JWT from localStorage. Here the HTML always lives in an
 * `<iframe sandbox>` WITHOUT `allow-same-origin`, i.e. an opaque origin with no
 * access to our storage, cookies or DOM. `allow-scripts` is granted only so the
 * small print bridge injected below can call window.print() (a parent cannot call
 * print() on a cross-origin frame); `allow-modals` is what print() needs.
 */

const SANDBOX = 'allow-scripts allow-modals allow-popups'

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Runs inside the sandboxed frame. Prints on request (postMessage) or on load,
// then tells the parent it is done so the parent can clean up.
const bridge = (autoPrint) => `<script>(function(){
function p(){try{window.focus();window.print()}catch(e){}try{parent.postMessage('valyze:printed','*')}catch(e){}}
window.addEventListener('message',function(e){if(e&&e.data==='valyze:print')p()});
${autoPrint ? "window.addEventListener('load',function(){setTimeout(p,300)});" : ''}
})();</script>`

const withBridge = (html, autoPrint) => {
    const doc = String(html || '')
    const script = bridge(autoPrint)
    return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${script}</body>`) : doc + script
}

/** Print server HTML from a hidden sandboxed iframe in the current page. */
export function printHtml(html) {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', SANDBOX)
    iframe.setAttribute('aria-hidden', 'true')
    Object.assign(iframe.style, {
        position: 'fixed', left: '-10000px', top: '0', width: '210mm', height: '297mm', border: '0',
    })
    let removed = false
    const cleanup = () => {
        if (removed) return
        removed = true
        window.removeEventListener('message', onMessage)
        iframe.remove()
    }
    const onMessage = (e) => {
        if (e.source === iframe.contentWindow && e.data === 'valyze:printed') setTimeout(cleanup, 500)
    }
    window.addEventListener('message', onMessage)
    // print() blocks until the dialog closes; this is only a backstop.
    setTimeout(cleanup, 10 * 60 * 1000)
    iframe.srcdoc = withBridge(html, true)
    document.body.appendChild(iframe)
}

/**
 * Show server HTML in a tab the caller ALREADY opened (synchronously, inside the
 * click handler — a window.open() after an await is eaten by pop-up blockers).
 * The tab gets a small trusted shell (Blob URL) holding a toolbar and the sandboxed
 * document; `autoPrint` opens the print dialog once it has rendered.
 */
export function showHtmlInWindow(win, html, { title = 'Document', autoPrint = false } = {}) {
    const shell = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(title)}</title>
<style>
html,body{margin:0;height:100%;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.bar{height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;background:#0f172a;color:#fff;box-sizing:border-box}
.bar span{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar button{background:#f59e0b;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer}
iframe{display:block;border:0;width:100%;height:calc(100% - 48px);background:#fff}
@media print{.bar{display:none}iframe{height:100%}}
</style></head><body>
<div class="bar"><span>${escapeText(title)}</span><button id="print" type="button">Print / Save as PDF</button></div>
<iframe id="doc" sandbox="${SANDBOX}" srcdoc="${escapeAttr(withBridge(html, false))}"></iframe>
<script>
try{window.opener=null}catch(e){}
var f=document.getElementById('doc');
document.getElementById('print').onclick=function(){f.contentWindow.postMessage('valyze:print','*')};
${autoPrint ? "f.addEventListener('load',function(){setTimeout(function(){f.contentWindow.postMessage('valyze:print','*')},400)});" : ''}
</script></body></html>`
    const url = URL.createObjectURL(new Blob([shell], { type: 'text/html;charset=utf-8' }))
    win.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
}

/** Open a placeholder tab synchronously. Returns null if the pop-up was blocked. */
export function openPendingWindow(message = 'Preparing document…') {
    const win = window.open('', '_blank')
    if (!win) return null
    try {
        win.document.title = message
        win.document.body.textContent = message
        win.document.body.style.cssText = 'font:16px sans-serif;padding:24px'
    } catch { /* cosmetic only */ }
    return win
}
