/**
 * Anthropic model + server-tool versions, in ONE place.
 *
 * Why this file exists: the extractor silently stopped working because
 * `claude-sonnet-4-20250514` was retired and the model id was hardcoded in three
 * separate files. Model ids age out. Keep them here so the next retirement is a
 * one-line fix instead of a hunt.
 *
 * Model ids are complete as written — never append a date suffix.
 */

// Extraction and QA are intelligence-sensitive: a wrong field in a credit report
// is worse than a slower response. Opus 5 also carries a 1M context window, which
// matters when a company ships 5 scanned PDFs.
export const MODEL_EXTRACT = 'claude-opus-5'
export const MODEL_QA = 'claude-opus-5'

// The patch engine only mechanically applies a diff to JSON it is handed —
// no judgement involved, so the cheap fast model is the right call.
export const MODEL_PATCH = 'claude-haiku-4-5'

// Server-tool type strings are versioned too, and the version gates on the model.
// The _20260209 web search (dynamic filtering) requires Opus 4.6+ / Sonnet 4.6+.
export const TOOL_WEB_SEARCH = 'web_search_20260209'

export const ANTHROPIC_VERSION = '2023-06-01'

// Non-streaming ceiling. High enough that a full credit report is never truncated
// mid-object, low enough to stay under the SDK/proxy HTTP timeout.
export const MAX_TOKENS_EXTRACT = 16000
export const MAX_TOKENS_QA = 8000
