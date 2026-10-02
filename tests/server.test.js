import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createApp } from '../server/app.js'
import { getConfig } from '../server/config.js'
import { createIndianApi } from '../server/indianApi/client.js'
import { contracts } from '../server/indianApi/contracts.js'
import { createStore } from '../server/store.js'

const config = () => ({ ...getConfig({}), clientId: 'test.apps.googleusercontent.com', apiKey: 'test-server-key', databasePath: ':memory:' })
const stock = { tickerId: 'TEST', companyName: 'Test company', currentPrice: { NSE: 123 }, percentChange: 1, yearHigh: 150, yearLow: 100 }
const jsonResponse = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
async function fixture(t, overrides = {}) {
  let nonce
  const settings = { ...config(), ...overrides.config }
  const { app, store } = createApp(settings, { fetcher: async () => jsonResponse(stock), verifyGoogle: async token => {
    if (token === 'invalid') throw new Error('SECRET upstream details')
    return { sub: 'google-test-id', name: 'Test User', email: 'test@example.test', email_verified: true, nonce }
  }, ...overrides.options })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (path, opts = {}) => fetch(`${base}${path}`, opts)
  async function login(token = 'valid', origin = settings.origin) {
    const challenge = await request('/api/auth/config')
    nonce = (await challenge.json()).nonce
    const response = await request('/api/auth/google', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: challenge.headers.get('set-cookie').split(';')[0] }, body: JSON.stringify({ credential: token }) })
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  return { request, login, store, settings }
}

test('unauthenticated users cannot access market endpoints or a session', async t => {
  const f = await fixture(t)
  for (const path of ['/api/auth/session', '/api/market/stock?name=Test', '/api/market/search?query=Test']) assert.equal((await f.request(path)).status, 401)
})
test('verified Google profile creates a persistent, HttpOnly session; logout revokes it', async t => {
  const f = await fixture(t), { response, cookie } = await f.login()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/)
  assert.doesNotMatch(cookie, /test@example|google-test/)
  const user = await f.request('/api/auth/session', { headers: { Cookie: cookie } })
  assert.equal((await user.json()).user.googleId, 'google-test-id')
  const market = await f.request('/api/market/stock?name=Test', { headers: { Cookie: cookie } })
  assert.equal((await market.json()).data.companyName, 'Test company')
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { Origin: f.settings.origin, Cookie: cookie } })
  assert.equal(logout.status, 204)
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: cookie } })).status, 401)
})
test('existing users are updated; login rotates and invalidates the previous token', () => {
  const store = createStore(config())
  try {
    const profile = { googleId: 'id', name: 'First', email: 'first@example.test', picture: '' }
    const first = store.login(profile), second = store.login({ ...profile, name: 'Updated' }, first)
    assert.equal(store.user(first), null)
    assert.equal(store.user(second).name, 'Updated')
  } finally { store.close() }
})

test('guests can sign in without Google configuration, restore their session, access markets and sign out', async t => {
  const f = await fixture(t, { config: { clientId: '' } })
  const response = await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: f.settings.origin } })
  assert.equal(response.status, 200)
  const user = (await response.json()).user
  assert.equal(user.isGuest, true)
  assert.equal(user.name, 'Guest')
  assert.equal(user.googleId, undefined)
  const sessionCookie = response.headers.get('set-cookie')
  assert.match(sessionCookie, /HttpOnly/)
  assert.match(sessionCookie, /SameSite=Lax/)
  assert.match(sessionCookie, /Max-Age=/)
  const headers = { Cookie: sessionCookie.split(';')[0] }
  const restored = await f.request('/api/auth/session', { headers })
  assert.deepEqual((await restored.json()).user, user)
  const market = await f.request('/api/market/stock?name=Test', { headers })
  assert.equal(market.status, 200)
  assert.equal((await market.json()).data.companyName, 'Test company')
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers: { ...headers, Origin: f.settings.origin } })).status, 204)
  assert.equal((await f.request('/api/auth/session', { headers })).status, 401)
  assert.equal((await f.request('/api/market/stock?name=Test', { headers })).status, 401)
})

test('guest and Google login rotate sessions across both session types; expired guests are rejected', () => {
  const store = createStore(config())
  try {
    const guest = store.guestLogin(), anotherGuest = store.guestLogin()
    assert.notEqual(guest, anotherGuest)
    const profile = { googleId: 'id', name: 'Test', email: 'test@example.test', picture: '' }
    const google = store.login(profile, guest)
    assert.equal(store.user(guest), null)
    assert.equal(store.user(google).googleId, 'id')
    const nextGuest = store.guestLogin(google)
    assert.equal(store.user(google), null)
    const rotated = store.guestLogin(nextGuest)
    assert.equal(store.user(nextGuest), null)
    assert.equal(store.user(rotated).isGuest, true)
    assert.equal(store.user(anotherGuest).isGuest, true)
  } finally { store.close() }
  const expired = createStore({ ...config(), sessionDays: -1 })
  try { assert.equal(expired.user(expired.guestLogin()), null) } finally { expired.close() }
})
test('invalid Google tokens fail without disclosing provider details', async t => {
  const f = await fixture(t), { response } = await f.login('invalid')
  assert.equal(response.status, 401)
  assert.doesNotMatch(JSON.stringify(await response.json()), /SECRET/)
})
test('Google verification network failures show a service error without exposing credentials or internal details', async t => {
  for (const error of [Object.assign(new Error('SECRET network details'), { code: 'EACCES' }), new Error('Wrapper', { cause: Object.assign(new Error('SECRET'), { code: 'ENOTFOUND' }) }), Object.assign(new Error('SECRET'), { response: { status: 503 } })]) {
    const f = await fixture(t, { options: { verifyGoogle: async () => { throw error } } })
    const response = (await f.login()).response
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.error.code, 'AUTH_UNAVAILABLE')
    assert.match(body.error.message, /reach Google/)
    assert.doesNotMatch(JSON.stringify(body), /SECRET|EACCES|ENOTFOUND/)
  }
})
test('missing or mismatched nonce and unverified email are rejected', async t => {
  const f = await fixture(t, { options: { verifyGoogle: async () => ({ sub: 'x', email: 'x@example.test', email_verified: true, nonce: 'wrong' }) } })
  assert.equal((await f.login()).response.status, 401)
  const direct = await f.request('/api/auth/google', { method: 'POST', headers: { Origin: f.settings.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'valid' }) })
  assert.equal(direct.status, 401)
  const unverified = await fixture(t, { options: { verifyGoogle: async () => ({ sub: 'x', email: 'x@example.test', email_verified: false }) } })
  assert.equal((await unverified.login()).response.status, 401)
})
test('login challenge is single use and cannot be replayed', () => {
  const store = createStore(config())
  try { const nonce = store.challenge(); assert.equal(store.consumeChallenge(nonce), true); assert.equal(store.consumeChallenge(nonce), false) } finally { store.close() }
})
test('cross-origin Google login, guest login and logout are rejected', async t => {
  const f = await fixture(t)
  for (const path of ['/api/auth/google', '/api/auth/guest', '/api/auth/logout']) {
    assert.equal((await f.request(path, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403)
    assert.equal((await f.request(path, { method: 'POST' })).status, 403)
  }
})

test('development accepts equivalent loopback origins for guest and Google login and logout', async t => {
  const f = await fixture(t)
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']) {
    const response = await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })
    assert.equal(response.status, 200, origin)
    const cookie = response.headers.get('set-cookie').split(';')[0]
    const restored = await f.request('/api/auth/session', { headers: { Cookie: cookie } })
    assert.equal((await restored.json()).user.isGuest, true)
    const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } })
    assert.equal(logout.status, 204)
    assert.equal((await f.request('/api/auth/session', { headers: { Cookie: cookie } })).status, 401)
    assert.equal((await f.login('valid', origin)).response.status, 200)
  }
})

test('development origin aliases reject other ports, protocols, hosts and cross-site requests', async t => {
  const f = await fixture(t)
  for (const origin of ['http://127.0.0.1:5174', 'https://127.0.0.1:5173', 'http://localhost.evil.example:5173', 'http://192.168.1.2:5173', 'null']) {
    assert.equal((await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: origin } })).status, 403, origin)
  }
  assert.equal((await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
})

test('production and custom development origins require an exact match', async t => {
  for (const config of [{ production: true, origin: 'https://localhost:5173' }, { origin: 'http://trovan.test:5173' }]) {
    const f = await fixture(t, { config })
    assert.equal((await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: f.settings.origin } })).status, 200)
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://127.0.0.1:5173']) {
      assert.equal((await f.request('/api/auth/guest', { method: 'POST', headers: { Origin: origin } })).status, 403, origin)
    }
  }
})
test('missing API key produces a clear configuration state behind auth', async t => {
  const f = await fixture(t, { config: { apiKey: '' } }), { cookie } = await f.login()
  const response = await f.request('/api/market/trending', { headers: { Cookie: cookie } })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'API_NOT_CONFIGURED')
})
test('Google public configuration never contains server secrets', async t => {
  const f = await fixture(t), response = await f.request('/api/auth/config'), body = await response.text()
  assert.doesNotMatch(body, /test-server-key|SESSION_SECRET|JWT_SECRET/)
  assert.match(body, /test.apps.googleusercontent.com/)
})
test('search uses documented company lookup and returns a selectable real stock', async t => {
  let upstream
  const f = await fixture(t, { options: { fetcher: async url => { upstream = url; return jsonResponse(stock) } } }), { cookie } = await f.login()
  const response = await f.request('/api/market/search?query=Test', { headers: { Cookie: cookie } }), body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(new URL(upstream).pathname, '/stock')
  assert.equal(new URL(upstream).searchParams.get('name'), 'Test')
  assert.equal(body.data[0].tickerId, 'TEST')
  assert.equal(body.searchMode, 'company-lookup')
})
test('unknown endpoints, extra query keys and invalid periods never reach provider', async () => {
  let calls = 0
  const client = createIndianApi(config(), async () => { calls++; return jsonResponse(stock) })
  await assert.rejects(client.request('not-real'), e => e.status === 404)
  await assert.rejects(client.request('stock', { name: 'X', api_key: 'untrusted' }), e => e.status === 400)
  await assert.rejects(client.request('historical_data', { stock_name: 'X', period: '1D', filter: 'price' }), e => e.status === 400)
  await assert.rejects(client.request('stock', { name: 'a\nb' }), e => e.status === 400)
  assert.equal(calls, 0)
})
test('concurrent and repeated requests are deduplicated and use server-only API headers', async () => {
  let calls = 0, observed
  const client = createIndianApi(config(), async (_url, opts) => { calls++; observed = opts; return jsonResponse(stock) })
  const values = await Promise.all([client.request('stock', { name: 'X' }), client.request('stock', { name: 'X' })])
  await client.request('stock', { name: 'X' })
  assert.equal(calls, 1)
  assert.deepEqual(values[0], values[1])
  assert.equal(observed.headers['X-Api-Key'], 'test-server-key')
  assert.doesNotMatch(JSON.stringify(values), /test-server-key/)
})
for (const status of [401, 403, 429, 500, 404]) test(`upstream ${status} is safely translated`, async () => {
  const client = createIndianApi(config(), async () => jsonResponse({ error: 'SECRET raw error' }, status, { 'retry-after': '2' }))
  await assert.rejects(client.request('stock', { name: 'Test' }), error => {
    assert.equal(error.status, status === 429 ? 429 : status === 404 ? 404 : 502)
    assert.doesNotMatch(error.message, /SECRET/)
    if (status === 429) assert.equal(error.retryAfter, 2)
    return true
  })
})
test('rate-limit cooldown prevents duplicate provider calls', async () => {
  let calls = 0
  const client = createIndianApi(config(), async () => { calls++; return jsonResponse({}, 429, { 'retry-after': '20' }) })
  await assert.rejects(client.request('stock', { name: 'X' }))
  await assert.rejects(client.request('news'), e => e.status === 429)
  assert.equal(calls, 1)
})
test('network failure, timeout, invalid JSON and wrong response shape are safe', async () => {
  for (const fetcher of [async () => { throw new Error('SECRET network') }, async () => { throw new DOMException('SECRET', 'TimeoutError') }, async () => new Response('not-json'), async () => jsonResponse({ unexpected: true })]) {
    const client = createIndianApi(config(), fetcher)
    await assert.rejects(client.request('stock', { name: 'Test' }), e => e.status >= 500 && !e.message.includes('SECRET'))
  }
})
test('all 20 published v1 routes have exact contracts; unsupported search is not guessed', () => {
  assert.equal(Object.keys(contracts).length, 20)
  assert.equal(contracts.search, undefined)
  assert.equal(contracts.mutual_funds_details.safeParse({ stock_name: 'Scheme' }).success, true)
  assert.equal(contracts.mutual_funds_details.safeParse({ fund_id: 'MF123' }).success, false)
  assert.equal(contracts.historical_data.safeParse({ stock_name: 'X', period: '1yr', filter: 'price' }).success, true)
})
test('production requires HTTPS and a persistent secret; arbitrary provider URLs are rejected', () => {
  assert.throws(() => getConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/)
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }), /HTTPS/)
  assert.throws(() => getConfig({ INDIAN_API_BASE_URL: 'http://evil.example' }), /official/)
})
