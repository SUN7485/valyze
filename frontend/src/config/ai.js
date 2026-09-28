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

// Per-response ceiling, not per-report. Big reports DO hit this and stop mid-JSON
// (stop_reason: "max_tokens"); the extractor detects that and asks Claude to continue
// the JSON in a follow-up turn rather than parsing the truncated half. Raising it is
// not the fix — the proxy and the Vercel function both time out at 300s, and one
// non-streaming response much larger than this will not come back in time.
export const MAX_TOKENS_EXTRACT = 16000
export const MAX_TOKENS_QA = 8000

// Opus 5 THINKS by default, and max_tokens caps thinking PLUS the answer. Sonnet 4 ran
// without thinking, so moving to Opus 5 at the same 16000 silently shrank the room left
// for the JSON — the real cause of the "Expected ',' or ']' after array element"
// failures. Effort is Anthropic's documented lever for how much thinking a request
// spends, and low/medium are unusually strong on Opus 5. Transcribing documents into a
// schema is not deep reasoning, so "medium" buys back output room and time (every call
// must finish inside the proxy's 300s) without giving up the model. Raise to "high"
// only if extraction quality measurably drops. Thinking cannot be switched off here
// instead: that path is deprecated on Opus 5 and removed entirely on newer models.
export const EFFORT_EXTRACT = 'medium'
export const EFFORT_QA = 'medium'
