/**
 * Drive one Anthropic Messages request to a finished answer, and parse the JSON in it.
 *
 * Shared by the Extractor and QA pages. Each page keeps its own transport (the
 * Extractor gzips through the proxy, QA sends plain JSON) and passes it in as `send`;
 * everything about HOW a turn can end early lives here, once, under test
 * (claudeTurns.test.mjs).
 *
 * A turn can end early three ways, and each needs a different resume:
 *
 *  - max_tokens  The answer was cut off. On Opus 5 this is common: thinking is on by
 *                default and max_tokens caps thinking PLUS the answer, so a budget sized
 *                for Sonnet 4's JSON no longer fits. Resume with the partial assistant
 *                turn followed by a USER turn asking for the rest — Opus 5 rejects an
 *                assistant prefill, so we cannot simply end on the assistant turn.
 *  - pause_turn  A server-side tool (web search) hit its internal iteration limit.
 *                Resume by re-sending the paused assistant turn and NOTHING else — the
 *                API sees the trailing server_tool_use block and picks up where it left off.
 *  - refusal     Terminal. Surfaced with its category.
 */

const DEFAULT_MAX_CONTINUATIONS = 4
const MAX_PAUSES = 3

const CONTINUE_PROMPT =
    'Your previous message was cut off by the output token limit. Continue the JSON from the exact ' +
    'character where you stopped. Do not repeat anything you already wrote, do not restart the ' +
    'object, do not add commentary or code fences — output only the remaining characters.'

const RESTART_PROMPT =
    'Your previous message was cut off before any JSON was produced. Return the complete JSON ' +
    'object now, and nothing else.'

export class ClaudeTurnError extends Error {
    constructor(code, message) {
        super(message)
        this.code = code
    }
}

const textOf = (content) =>
    content.filter(b => b.type === 'text').map(b => b.text).join('')

/**
 * @param {object}   opts
 * @param {(body: object) => Promise<object>} opts.send  POSTs one Messages body, returns the parsed response
 * @param {object}   opts.request            Messages body; `messages` is the starting conversation
 * @param {number}  [opts.maxContinuations]  how many max_tokens resumes before giving up
 * @param {(msg: string) => void} [opts.onProgress]
 * @returns {Promise<{text: string, chunkStarts: number[], hitOutputCap: boolean,
 *                    continuations: number, pauses: number, usage: object}>}
 */
export async function runToCompletion({
    send, request, maxContinuations = DEFAULT_MAX_CONTINUATIONS, onProgress = () => {},
}) {
    const messages = [...request.messages]
    let text = ''
    const chunkStarts = []
    let continuations = 0
    let pauses = 0
    let hitOutputCap = false
    let resumingCutOff = false
    const usage = { input_tokens: 0, output_tokens: 0 }

    for (;;) {
        const data = await send({ ...request, messages })
        if (!data || !Array.isArray(data.content)) {
            const why = data?.error?.message || data?.detail || JSON.stringify(data)
            throw new ClaudeTurnError('BAD_RESPONSE', `Invalid API response: ${why}`)
        }
        usage.input_tokens += data.usage?.input_tokens || 0
        usage.output_tokens += data.usage?.output_tokens || 0

        let chunk = textOf(data.content)
        // A resumed answer sometimes re-opens its code fence; spliced into the middle of
        // the JSON that would corrupt it.
        if (resumingCutOff) chunk = chunk.replace(/^\s*```(?:json)?\s*\n?/i, '')
        if (chunk) {
            chunkStarts.push(text.length)
            text += chunk
        }

        if (data.stop_reason === 'max_tokens') {
            hitOutputCap = true
            if (continuations >= maxContinuations) break
            continuations += 1
            resumingCutOff = true
            onProgress(`Output limit reached — continuing (${continuations}/${maxContinuations})…`)
            messages.push({ role: 'assistant', content: data.content })
            messages.push({ role: 'user', content: text.trim() ? CONTINUE_PROMPT : RESTART_PROMPT })
            continue
        }

        if (data.stop_reason === 'pause_turn') {
            if (pauses >= MAX_PAUSES) break
            pauses += 1
            resumingCutOff = false
            onProgress('Claude is still searching the web…')
            messages.push({ role: 'assistant', content: data.content })
            continue
        }

        if (data.stop_reason === 'refusal') {
            const why = data.stop_details?.category ? ` (${data.stop_details.category})` : ''
            throw new ClaudeTurnError('REFUSAL',
                `Claude declined to complete this request${why}.\n\n` +
                '• Re-run it — this is usually not repeatable\n' +
                '• If it repeats, send the documents in smaller batches')
        }

        // end_turn, stop_sequence, or anything unknown: this is the final answer.
        hitOutputCap = false
        break
    }

    return { text, chunkStarts, hitOutputCap, continuations, pauses, usage }
}

/**
 * Find the first complete, balanced JSON object in `text`, starting at `from`.
 * Braces inside strings are skipped. Returns null when the object never closes —
 * the old greedy-regex fallback manufactured a broken string here, which is how a
 * truncation used to surface as "Expected ',' or ']' after array element".
 */
export function extractJsonObject(text, from = 0) {
    const start = text.indexOf('{', from)
    if (start === -1) return null
    let depth = 0, inStr = false, esc = false
    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (esc) { esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
    }
    return null
}

function truncatedError(continuations) {
    return new ClaudeTurnError('TRUNCATED',
        'Claude ran out of output room before it finished the JSON' +
        (continuations
            ? ` — ${continuations} continuation ${continuations === 1 ? 'attempt was' : 'attempts were'} not enough.`
            : '.') +
        '\n\nThe report is too large for one pass:\n' +
        '• Extract fewer documents at once\n' +
        '• Split large PDFs and run each part separately\n' +
        '• Turn OFF web search if it is on')
}

/**
 * Parse the JSON answer out of a runToCompletion result, or throw a ClaudeTurnError
 * whose message tells the analyst what to DO — never a raw JSON syntax error.
 */
export function parseJsonResult({ text, chunkStarts = [0], hitOutputCap, continuations }) {
    // Still cut off at the end means the answer never finished. Do not go hunting for
    // "some" object in the fragment: a truncated report is full of complete nested
    // objects (every shareholder row), and returning one of those as the report is a
    // silent wrong answer — far worse than an error.
    if (hitOutputCap) {
        throw truncatedError(continuations)
    }

    // Try the whole stream first. If a continuation restarted the object from scratch
    // instead of continuing it, the complete copy begins exactly at that chunk's first
    // character — so a later boundary only counts when its chunk OPENS with "{". A "{"
    // found mid-chunk is a nested object, never the answer.
    const restarts = [...chunkStarts].reverse().filter(s =>
        s > 0 && /^\s*(?:```(?:json)?\s*)?\{/i.test(text.slice(s, s + 20)))
    let lastError = null
    for (const from of [0, ...restarts]) {
        const candidate = extractJsonObject(text, from)
        if (!candidate) continue
        try {
            return JSON.parse(candidate)
        } catch (e) {
            lastError = e
        }
    }

    if (lastError === null && extractJsonObject(text) === null && text.includes('{')) {
        // An object opened and never closed, yet the turn ended normally.
        throw truncatedError(continuations)
    }
    if (lastError) {
        console.error('[claudeTurns] JSON parse failed', { error: lastError.message, tail: text.slice(-400) })
        throw new ClaudeTurnError('MALFORMED',
            `Claude returned malformed JSON (${lastError.message}).\n\n` +
            '• Run it again — this usually clears on a retry\n' +
            '• If it repeats, split the documents into smaller batches')
    }
    throw new ClaudeTurnError('NO_JSON',
        text.trim()
            ? 'Claude replied without a JSON object.\n\n• Run it again\n• If it repeats, try fewer or smaller documents'
            : 'No valid JSON returned. Try again — if it persists, try splitting large PDFs.')
}
