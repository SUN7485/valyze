// Run: node --test src/lib/claudeTurns.test.mjs   (from frontend/)
//
// Replays scripted Anthropic responses through runToCompletion — the same loop the
// Extractor and QA pages use — so every way a turn can end early is exercised without
// an API key or a network call.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runToCompletion, parseJsonResult } from './claudeTurns.js'

const REPORT = JSON.stringify({
    company_name: 'Acme Trading',
    cr_number: '1010999',
    shareholders: Array.from({ length: 30 }, (_, i) => ({ name: `Owner ${i}`, percentage: 2.5 })),
    financial_data: { revenue_1: 1000000, equity_1: 500000 },
})

const textMsg = (text, stop_reason) => ({
    content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }],
    stop_reason,
    usage: { input_tokens: 100, output_tokens: 50 },
})

// Fake transport: hands out the scripted responses in order and records every request.
function scripted(...responses) {
    const sent = []
    const send = async (body) => {
        sent.push(structuredClone(body))
        if (!responses.length) throw new Error('script exhausted — the loop asked for more turns than expected')
        return responses.shift()
    }
    return { send, sent }
}

const request = { model: 'm', max_tokens: 100, messages: [{ role: 'user', content: 'extract' }] }

test('a complete answer parses first time', async () => {
    const { send, sent } = scripted(textMsg(REPORT, 'end_turn'))
    const out = await runToCompletion({ send, request })
    assert.equal(sent.length, 1)
    assert.equal(parseJsonResult(out).company_name, 'Acme Trading')
})

// The regression. Opus 5 spends part of max_tokens on thinking, so the JSON is cut
// off; the deployed code parsed the fragment and showed the analyst
// "Expected ',' or ']' after array element".
test('an answer cut off by max_tokens is continued, not parsed as a fragment', async () => {
    const cut = Math.floor(REPORT.length * 0.6)
    const { send, sent } = scripted(
        textMsg(REPORT.slice(0, cut), 'max_tokens'),
        textMsg(REPORT.slice(cut), 'end_turn'),
    )
    const out = await runToCompletion({ send, request })
    assert.equal(out.continuations, 1)
    assert.equal(parseJsonResult(out).financial_data.equity_1, 500000)

    // The continuation carries the partial assistant turn (thinking block included,
    // unchanged) and ends on a USER turn — Opus 5 rejects an assistant prefill.
    const second = sent[1].messages
    assert.equal(second.at(-2).role, 'assistant')
    assert.equal(second.at(-2).content[0].type, 'thinking')
    assert.equal(second.at(-1).role, 'user')
})

test('a continuation that re-opens a code fence is spliced cleanly', async () => {
    const cut = Math.floor(REPORT.length * 0.5)
    const { send } = scripted(
        textMsg('```json\n' + REPORT.slice(0, cut), 'max_tokens'),
        textMsg('```json\n' + REPORT.slice(cut) + '\n```', 'end_turn'),
    )
    const out = await runToCompletion({ send, request })
    assert.equal(parseJsonResult(out).cr_number, '1010999')
})

test('a continuation that restarts the whole object still yields the complete one', async () => {
    const { send } = scripted(
        textMsg(REPORT.slice(0, 200), 'max_tokens'),
        textMsg(REPORT, 'end_turn'),
    )
    const out = await runToCompletion({ send, request })
    assert.equal(parseJsonResult(out).company_name, 'Acme Trading')
})

// Web search is a SERVER tool. A long search loop pauses with stop_reason
// "pause_turn"; the deployed code broke out of the loop there and found no JSON.
test('pause_turn from a server-side web search is resumed without an extra user turn', async () => {
    const paused = {
        content: [
            { type: 'text', text: 'Let me check the registry.' },
            { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'Acme CR' } },
        ],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 100, output_tokens: 20 },
    }
    const { send, sent } = scripted(paused, textMsg(REPORT, 'end_turn'))
    const out = await runToCompletion({ send, request })
    assert.equal(out.pauses, 1)
    assert.equal(parseJsonResult(out).company_name, 'Acme Trading')
    // Resumed by re-sending the paused assistant turn — no "Continue." user message.
    assert.equal(sent[1].messages.at(-1).role, 'assistant')
    assert.equal(sent[1].messages.at(-1).content[1].type, 'server_tool_use')
})

test('running out of continuations reports truncation, never a raw JSON syntax error', async () => {
    const { send } = scripted(
        textMsg(REPORT.slice(0, 50), 'max_tokens'),
        textMsg(REPORT.slice(50, 100), 'max_tokens'),
        textMsg(REPORT.slice(100, 150), 'max_tokens'),
    )
    const out = await runToCompletion({ send, request, maxContinuations: 2 })
    assert.equal(out.hitOutputCap, true)
    assert.throws(() => parseJsonResult(out), (e) => {
        assert.equal(e.code, 'TRUNCATED')
        assert.doesNotMatch(e.message, /Expected ','|Unexpected token|position \d+/)
        return true
    })
})

// A cut-off report is full of complete nested objects (every shareholder row).
// Returning one of those as "the report" would be a silent wrong answer.
test('a fragment never yields a nested object as if it were the report', async () => {
    const fragment = REPORT.slice(0, 180)
    assert.match(fragment, /\{"name":"Owner 0","percentage":2\.5\}/)   // the trap is really there
    for (const stop of ['max_tokens', 'end_turn']) {
        const { send } = scripted(textMsg(fragment, stop))
        const out = await runToCompletion({ send, request, maxContinuations: 0 })
        assert.throws(() => parseJsonResult(out), (e) => e.code === 'TRUNCATED', `stop=${stop}`)
    }
})

test('a refusal surfaces as a refusal, with its category', async () => {
    const { send } = scripted({
        content: [], stop_reason: 'refusal', stop_details: { category: 'cyber' },
        usage: { input_tokens: 10, output_tokens: 0 },
    })
    await assert.rejects(runToCompletion({ send, request }), (e) => {
        assert.equal(e.code, 'REFUSAL')
        assert.match(e.message, /cyber/)
        return true
    })
})

test('prose with no JSON at all is reported as such', async () => {
    const { send } = scripted(textMsg('I could not read these documents.', 'end_turn'))
    const out = await runToCompletion({ send, request })
    assert.throws(() => parseJsonResult(out), (e) => e.code === 'NO_JSON')
})

test('usage is summed across every turn, so cost and truncation are visible', async () => {
    const cut = Math.floor(REPORT.length / 2)
    const { send } = scripted(
        textMsg(REPORT.slice(0, cut), 'max_tokens'),
        textMsg(REPORT.slice(cut), 'end_turn'),
    )
    const out = await runToCompletion({ send, request })
    assert.deepEqual(out.usage, { input_tokens: 200, output_tokens: 100 })
})
