// Pure helpers behind the Extractor. Run: npm test (no API key, no browser).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { isSessionError, sessionIsExpired, readProxyError, buildApiHeaders } = await import('./proxy.js')
const { referenceSubset, priorReportPromptBlock } = await import('./prompt.js')

const jwt = (payload) =>
  ['h', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

beforeEach(() => store.clear())

test('session errors are recognised by the server detail, not the status code', () => {
  assert.ok(isSessionError('[401] Token expired'))
  assert.ok(isSessionError('[401] Not authenticated'))
  assert.equal(isSessionError('[401] Missing or invalid Anthropic API key'), false)
})

test('sessionIsExpired reads exp locally', () => {
  assert.equal(sessionIsExpired(), true, 'no token')
  store.set('valyze_token', jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }))
  assert.equal(sessionIsExpired(), false)
  store.set('valyze_token', jwt({ exp: Math.floor(Date.now() / 1000) - 1 }))
  assert.equal(sessionIsExpired(), true)
  store.set('valyze_token', jwt({ sub: 'x' }))
  assert.equal(sessionIsExpired(), false, 'no exp claim: let the server decide')
  store.set('valyze_token', 'garbage')
  assert.equal(sessionIsExpired(), true)
})

test('readProxyError decodes both FastAPI and Anthropic error shapes', async () => {
  const res = (status, body) => ({ status, json: async () => body })
  assert.equal(await readProxyError(res(401, { detail: 'Token expired' })), '[401] Token expired')
  assert.equal(await readProxyError(res(400, { error: { message: 'bad request' } })), '[400] bad request')
  assert.equal(
    await readProxyError(res(401, { error: { message: 'invalid x-api-key' }, valyze_key_source: 'server' })),
    'SERVER_KEY_REJECTED [401] invalid x-api-key',
  )
  assert.equal(await readProxyError({ status: 502, json: async () => { throw new Error('not json') } }), '[502] HTTP 502')
})

test('proxy headers carry the Valyze JWT and gzip; direct headers never do', () => {
  store.set('valyze_token', 'jwt-123')
  const proxied = buildApiHeaders('sk-ant-x', false)
  assert.equal(proxied.Authorization, 'Bearer jwt-123')
  assert.equal(proxied['Content-Encoding'], 'gzip')
  const direct = buildApiHeaders('sk-ant-x', true)
  assert.equal(direct.Authorization, undefined)
  assert.equal(direct['anthropic-dangerous-direct-browser-access'], 'true')
})

test('referenceSubset keeps only non-empty identity fields and shareholders', () => {
  assert.equal(referenceSubset(null), null)
  assert.equal(referenceSubset({ fields: { company_name: { value: '  ' } } }), null)
  const out = referenceSubset({
    fields: { company_name: { value: 'Acme' }, cr_number: '123', revenue: { value: '9m' }, city: { value: null } },
    arrays: { shareholders: [{ name: 'A' }] },
  })
  assert.deepEqual(out, { company_name: 'Acme', cr_number: '123', shareholders: [{ name: 'A' }] })
})

test('prior-report block is empty without data and dated when present', () => {
  assert.equal(priorReportPromptBlock(null), '')
  const block = priorReportPromptBlock({ company_name: 'Acme', report_date: '2025-01-01' })
  assert.match(block, /dated 2025-01-01/)
  assert.match(block, /"company_name": "Acme"/)
  assert.match(block, /Never copy a value from the prior report/)
})
