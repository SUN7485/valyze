import { useState } from 'react'
import { reportAPI } from '../api/client'

export default function EasyWayImport({ 
  reportId, 
  onComplete, 
  onClose 
}) {
  const [step, setStep] = useState('intro')
  const [jsonInput, setJsonInput] = useState('')
  const [error, setError] = useState('')
  const [parsed, setParsed] = useState(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)

  // ─────────────────────────────────────────────
  // UTILITY: count all non-empty values in any 
  // object, recursively
  // ─────────────────────────────────────────────
  const countDeep = (obj) => {
    if (obj === null || obj === undefined || obj === '') return 0
    if (Array.isArray(obj)) return obj.length > 0 ? 1 : 0
    if (typeof obj === 'object') {
      return Object.values(obj).reduce(
        (sum, v) => sum + countDeep(v), 0
      )
    }
    return 1
  }

  // ── STEP: INTRO ──
  const IntroStep = () => (
    <div className="text-center py-6">
      <div className="text-7xl mb-4">⚡</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">
        The Easy Way
      </h2>
      <p className="text-gray-500 max-w-md mx-auto mb-6">
        Use our custom ChatGPT to extract data from 
        your documents AND search online. Get 220+ fields 
        filled in one click.
      </p>

      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="text-2xl mb-2">📄</div>
          <div className="text-xs font-semibold text-purple-700">
            Upload Files
          </div>
          <div className="text-xs text-gray-500 mt-1">
            PDFs, Word, Excel
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="text-2xl mb-2">🤖</div>
          <div className="text-xs font-semibold text-blue-700">
            GPT Extracts
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Files + Web search
          </div>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <div className="text-2xl mb-2">✅</div>
          <div className="text-xs font-semibold text-green-700">
            220+ Fields
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Filled instantly
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <a
          href="https://chatgpt.com/g/YOUR_GPT_ID"
          target="_blank"
          rel="noreferrer"
          className="px-6 py-3 bg-purple-600 text-white 
                     rounded-xl font-semibold hover:bg-purple-700 
                     flex items-center gap-2"
        >
          🤖 Open Valyze GPT
          <span className="text-xs opacity-80">↗</span>
        </a>
        <button
          onClick={() => setStep('paste')}
          className="px-6 py-3 border-2 border-purple-600 
                     text-purple-600 rounded-xl font-semibold
                     hover:bg-purple-50"
        >
          I have the JSON →
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Don't have the GPT?{' '}
        <button 
          onClick={() => {
            navigator.clipboard.writeText(EXTRACTION_PROMPT)
            alert('Prompt copied! Paste it in ChatGPT.')
          }}
          className="underline ml-1"
        >
          Copy the prompt
        </button>
        {' '}to use with regular ChatGPT
      </p>
    </div>
  )

  // ── STEP: PASTE ──
  const PasteStep = () => (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button 
          onClick={() => setStep('intro')}
          className="text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
        <h3 className="font-bold text-gray-800">
          Paste JSON from GPT
        </h3>
      </div>

      <div className="mb-3 p-3 bg-blue-50 rounded-lg 
                      text-sm text-blue-700 flex gap-2">
        <span>💡</span>
        <span>
          Copy the entire JSON response from ChatGPT 
          and paste it below. It should start with {'{'}
        </span>
      </div>

      <textarea
        value={jsonInput}
        onChange={e => {
          setJsonInput(e.target.value)
          setError('')
        }}
        placeholder={`Paste the complete JSON from ChatGPT here...\n\n{\n  "company_identity": {\n    "company_name": "Infinite Mining FZE",\n    ...\n  },\n  "financial_data": {\n    ...\n  }\n}`}
        className="w-full h-72 font-mono text-xs 
                   border-2 rounded-xl p-4
                   border-gray-200 focus:border-purple-400
                   focus:outline-none resize-none"
      />

      {error && (
        <div className="mt-2 p-3 bg-red-50 border 
                        border-red-200 rounded-lg 
                        text-red-600 text-sm">
          ❌ {error}
        </div>
      )}

      <div className="flex gap-3 mt-4 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 border rounded-lg text-gray-600"
        >
          Cancel
        </button>
        <button
          onClick={handleParse}
          disabled={!jsonInput.trim()}
          className="px-6 py-2 bg-purple-600 text-white 
                     rounded-xl font-semibold hover:bg-purple-700
                     disabled:opacity-50"
        >
          Parse & Preview →
        </button>
      </div>
    </div>
  )

  // ── STEP: PREVIEW ──
  const PreviewStep = () => {
    if (!parsed) return null

    // ── Pull top-level sections from JSON ──────────────────────────
    // Support multiple JSON formats
    const ci  = parsed.company_identity       || parsed.company_info       || {}
    const lr  = parsed.legal_regulatory       || parsed.legal_status       || {}
    const os  = parsed.ownership_structure    || parsed.ownership          || {}
    const mt  = parsed.management_team        || parsed.management          || []
    const fd  = parsed.financial_data         || parsed.financials         || {}
    const fr  = parsed.financial_ratios       || parsed.ratios             || {}
    const ta  = parsed.trend_analysis         || parsed.trends             || {}
    const op  = parsed.operational_profile    || parsed.operations         || {}
    const ia  = parsed.industry_analysis      || parsed.industry            || {}
    const ne  = parsed.news_and_events        || parsed.news               || {}
    const cr  = parsed.credit_risk_assessment || parsed.risk_assessment    || parsed.risk_analysis || {}
    const sw  = parsed.swot_analysis          || parsed.swot               || {}
    const rec = parsed.credit_recommendations || parsed.credit_recommendation || parsed.recommendations || {}
    const bk  = parsed.banking                 || 
                parsed.banking_information    || 
                parsed.bank_details           || {}
    const sc  = parsed.supply_chain           || 
                parsed.supply_chain_info      || {}

    // ── Financial years ────────────────────────────────────────────
    const year_1 = fd.year_1 || {}
    const year_2 = fd.year_2 || {}
    const year_3 = fd.year_3 || {}
    const years = [year_1.year, year_2.year, year_3.year]
                    .filter(Boolean)

    // ── Build sections using countDeep ─────────────────────────────
    // Each section maps to the actual JSON key from GPT output.
    // countDeep recursively counts every non-empty leaf value.
    const sections = [
      {
        name: 'Company Identity',
        icon: '🏢',
        count: countDeep(ci),
      },
      {
        name: 'Location & Contact',
        icon: '📍',
        // These fields usually live inside company_identity
        count: [
          ci.street_address, ci.city, ci.country,
          ci.phone, ci.email, ci.website
        ].filter(Boolean).length,
      },
      {
        name: 'Operations',
        icon: '⚙️',
        count: countDeep(op),
      },
      {
        name: 'Ownership',
        icon: '👥',
        count: countDeep(os) + (Array.isArray(mt) ? mt.length : 0),
      },
      {
        name: 'Financial Data',
        icon: '💰',
        count: countDeep(fd),
      },
      {
        name: 'Financial Ratios',
        icon: '📊',
        count: countDeep(fr) + countDeep(ta),
      },
      {
        name: 'Banking',
        icon: '🏦',
        count: countDeep(bk),
      },
      {
        name: 'Supply Chain',
        icon: '🔗',
        count: countDeep(sc),
      },
      {
        name: 'Legal & Compliance',
        icon: '⚖️',
        count: countDeep(lr),
        warning: (lr.legal_issues?.length > 0) || 
                 (ne.legal_issues?.length > 0),
      },
      {
        name: 'Market Intelligence',
        icon: '🌍',
        count: countDeep(ia),
      },
      {
        name: 'News & Events',
        icon: '📰',
        count: countDeep(ne),
      },
      {
        name: 'Credit Risk',
        icon: '🎯',
        count: countDeep(cr),
      },
      {
        name: 'SWOT Analysis',
        icon: '🧩',
        count: countDeep(sw),
      },
      {
        name: 'Credit Recommendations',
        icon: '💡',
        count: countDeep(rec),
      },
    ]

    // ── Totals: count everything in the whole JSON ─────────────────
    // This is the REAL number, not a hardcoded guess
    const totalFilled = sections.reduce((sum, s) => sum + s.count, 0)
    const pct = Math.min(100, Math.round(
      (totalFilled / Math.max(totalFilled, 1)) * 100
    ))

    const hasLegalIssues = 
      (lr.legal_issues?.length > 0) || 
      (ne.legal_issues?.length > 0)

    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => setStep('paste')}
            className="text-gray-400 hover:text-gray-600"
          >
            ← Back
          </button>
          <h3 className="font-bold text-gray-800">
            Preview Extracted Data
          </h3>
        </div>

        {/* Company header */}
        <div className="bg-gradient-to-r from-purple-600 
                        to-blue-600 rounded-xl p-4 
                        text-white mb-4">
          <div className="font-bold text-lg">
            {ci.legal_name || ci.company_name || 'Company Name'}
          </div>
          <div className="text-sm opacity-80 mt-1">
            {ci.country} • CR: {
              ci.registration_number || 
              ci.cr_number || 'N/A'
            }
          </div>

          {hasLegalIssues && (
            <div className="mt-2 px-3 py-1 bg-red-500 
                            text-white text-xs font-bold 
                            rounded-full inline-flex 
                            items-center gap-1">
              ⚠️ Active Legal Proceedings
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="text-2xl font-bold">
              {totalFilled}
            </div>
            <div className="text-sm opacity-80">
              fields extracted
            </div>
            <div className="ml-auto text-sm font-semibold">
              ✅ Ready to import
            </div>
          </div>

          {/* Progress bar always 100% if we have data */}
          <div className="mt-2 h-2 bg-white/20 rounded-full">
            <div 
              className="h-2 bg-white rounded-full transition-all"
              style={{ width: totalFilled > 0 ? '100%' : '0%' }}
            />
          </div>
        </div>

        {/* Section summary grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {sections.map(s => (
            <div 
              key={s.name} 
              className={`flex items-center gap-2 p-2 rounded-lg
                ${s.warning 
                  ? 'bg-red-50 border border-red-200' 
                  : 'bg-gray-50'}`}
            >
              <span className="text-lg">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium 
                                text-gray-700 truncate">
                  {s.name}
                </div>
                <div className="text-xs text-gray-400">
                  {s.count > 0 
                    ? `${s.count} fields found` 
                    : 'not in JSON'}
                </div>
              </div>
              <div className={`text-xs font-bold
                ${s.count > 0 
                  ? s.warning 
                    ? 'text-red-500' 
                    : 'text-green-600' 
                  : 'text-gray-300'}`}>
                {s.count > 0 
                  ? s.warning ? '⚠️' : '✅' 
                  : '—'}
              </div>
            </div>
          ))}
        </div>

        {/* Financial years found */}
        {years.length > 0 && (
          <div className="p-3 bg-green-50 border 
                          border-green-200 rounded-lg 
                          mb-3 text-sm">
            ✅ Financial data found for years:{' '}
            <strong>{years.join(', ')}</strong>
            {(fd.currency || parsed.currency) && (
              <span className="ml-2 text-gray-500">
                ({fd.currency || parsed.currency}{' '}
                 {fd.unit || parsed.unit})
              </span>
            )}
          </div>
        )}

        {/* SWOT found */}
        {sw.strengths?.length > 0 && (
          <div className="p-3 bg-purple-50 border 
                          border-purple-200 rounded-lg 
                          mb-3 text-sm">
            ✅ SWOT: {sw.strengths.length} strengths, {' '}
            {sw.weaknesses?.length || 0} weaknesses, {' '}
            {sw.opportunities?.length || 0} opportunities, {' '}
            {sw.threats?.length || 0} threats
          </div>
        )}

        {/* Red flags */}
        {(parsed.analyst_notes?.red_flags || []).length > 0 && (
          <div className="p-3 bg-red-50 border 
                          border-red-200 rounded-lg 
                          mb-3 text-sm">
            🚨 Red flags:{' '}
            {parsed.analyst_notes.red_flags.join(', ')}
          </div>
        )}

        {/* Info box: what this does */}
        <div className="p-3 bg-blue-50 border border-blue-200 
                        rounded-lg mb-4 text-xs text-blue-700">
          ℹ️ Your JSON will be imported exactly as-is. 
          No recalculation will happen. All scores, ratings, 
          and limits from your JSON will be preserved.
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button
            onClick={() => setStep('paste')}
            className="px-4 py-2 border rounded-lg text-gray-600"
          >
            ← Back
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-8 py-3 bg-gradient-to-r 
                       from-purple-600 to-blue-600
                       text-white rounded-xl font-bold
                       hover:from-purple-700 
                       hover:to-blue-700
                       disabled:opacity-50
                       flex items-center gap-2"
          >
            {importing ? (
              <>
                <div className="w-4 h-4 border-2 
                                border-white/30 border-t-white 
                                rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>⚡ Import All Fields</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: DONE ──
  const DoneStep = () => (
    <div className="text-center py-8">
      <div className="text-7xl mb-4">🎉</div>
      <h3 className="text-2xl font-bold text-gray-800 mb-2">
        Done!
      </h3>
      {results && (
        <div className="text-gray-500 mb-2">
          <span className="text-3xl font-bold text-purple-600">
            {results.fields_updated}
          </span>
          {' '}fields +{' '}
          <span className="text-3xl font-bold text-blue-600">
            {results.arrays_updated}
          </span>
          {' '}arrays imported successfully
        </div>
      )}
      <p className="text-gray-400 text-sm mb-8">
        Your JSON was imported exactly as-is.
        No recalculation was triggered.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={onComplete}
          className="px-8 py-3 bg-gradient-to-r 
                     from-purple-600 to-blue-600
                     text-white rounded-xl font-bold"
        >
          View Report →
        </button>
      </div>
    </div>
  )

  // ── PARSE ──
  const handleParse = () => {
    setError('')
    try {
      let str = jsonInput.trim()
      // Strip markdown code fences if present
      const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch) str = fenceMatch[1].trim()
      // Find the outermost JSON object
      const objMatch = str.match(/\{[\s\S]*\}/)
      if (objMatch) str = objMatch[0]
      
      const data = JSON.parse(str)
      
      // Basic structure validation - support multiple JSON formats
      const hasData = (
        data.company_identity ||
        data.company_info    ||
        data.financial_data   ||
        data.financials       ||
        data.operations       ||
        data.operational_profile ||
        data.risk_assessment  ||
        data.credit_risk_assessment
      )
      if (!hasData) {
        setError(
          'This does not look like a Valyze JSON. ' +
          'Make sure you used the correct GPT prompt or paste the full JSON.'
        )
        return
      }
      
      setParsed(data)
      setStep('preview')
    } catch (e) {
      setError(`JSON parse error: ${e.message}`)
    }
  }

  // ── IMPORT ──
  const handleImport = async () => {
    setImporting(true)
    try {
      // Send JSON straight to backend — no secondary triggers
      const res = await reportAPI.easyWayImport(reportId, parsed)
      setResults(res.data)
      setStep('done')

      // 🛑 generateNarratives DISABLED
      // It was firing 1 second after import and potentially
      // triggering a backend save that recalculated everything.
      // setTimeout(() => {
      //   reportAPI.generateNarratives(reportId).catch(console.error)
      // }, 1000)

    } catch (e) {
      setError(`Import failed: ${e.message}`)
      setStep('preview')
    } finally {
      setImporting(false)
    }
  }

  const EXTRACTION_PROMPT = `[paste the full extraction prompt here]`

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm
                    flex items-center justify-center 
                    z-50 p-4">
      <div className="bg-[var(--color-surface)] dark:bg-[#111827] rounded-2xl shadow-xl border border-[var(--color-border)]
                      w-full max-w-2xl max-h-[90vh] 
                      overflow-y-auto">
        <div className="p-6">
          {step === 'intro'   && <IntroStep />}
          {step === 'paste'   && <PasteStep />}
          {step === 'preview' && <PreviewStep />}
          {step === 'done'    && <DoneStep />}
        </div>
      </div>
    </div>
  )
}