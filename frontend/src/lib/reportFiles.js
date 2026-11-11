// Getting a report out of the app as a file. Shared by the Editor and the
// Reports list so both use the same, working path.
//
// PDF is rendered in the browser: the backend returns the report HTML and we
// open the print dialog ("Save as PDF"). There is no server-side PDF file to
// download: serverless disk doesn't persist between requests.
import { reportAPI } from '../api/client'

const EXPORTERS = {
    json: reportAPI.exportJSON,
    xml: reportAPI.exportXML,
    xlsx: reportAPI.exportExcel,
    csv: reportAPI.exportCSV,
    docx: reportAPI.exportWord,
}

const BINARY_MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const EXPORT_FORMATS = Object.keys(EXPORTERS)

/** Open the browser print dialog for the rendered report. Resolves once the dialog was triggered. */
export async function printReportPdf(reportId) {
    const res = await reportAPI.generatePDF(reportId)
    const html = res.data?.html
    if (!html) throw new Error('Failed to generate PDF: no HTML returned.')

    // A hidden iframe avoids about:blank tabs and browser header/footer issues.
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-9999px'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    await new Promise(resolve => setTimeout(resolve, 1000)) // let fonts/images load
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => iframe.remove(), 1000)
}

/** Fetch an export from the API and save it as a file. */
export async function downloadReportExport(reportId, format, companyName = '') {
    const exporter = EXPORTERS[format]
    if (!exporter) throw new Error(`Unknown export format: ${format}`)

    // Excel/Word come back as JSON with base64; JSON/XML/CSV as the file itself.
    const res = await exporter(reportId, { responseType: BINARY_MIME[format] ? 'json' : 'blob' })

    let blob, filename
    if (res.data?.base64) {
        const binary = atob(res.data.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        blob = new Blob([bytes], { type: BINARY_MIME[format] || 'application/octet-stream' })
        filename = res.data.filename || `CreditReport.${format}`
    } else {
        blob = res.data instanceof Blob ? res.data : new Blob([res.data])
        const slug = String(companyName || 'Report').replace(/\s+/g, '_').slice(0, 30)
        filename = `CreditReport_${slug}.${format}`
    }

    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}
