import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { parse } from 'node:querystring'
import { createVercelHandler } from '../server/vercel.js'
import { getConfig } from '../server/config.js'
import { contracts } from '../server/indianApi/contracts.js'
import { stocks, market, funds } from '../src/api/services.js'
import { redisFixture } from './helpers/redis.js'

const env = () => ({ VERCEL: '1', VERCEL_URL: 'trovan.example', SESSION_SECRET: 'test-vercel-session-'.repeat(3),
  INDIAN_API_KEY: 'test-vercel-provider-key', GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-redis-token' })
const stock = { companyName: 'Test Company', tickerId: 'TEST', currentPrice: { NSE: 100 } }
async function fixture(t, overrides = {}) {
  const redis = overrides.redis || redisFixture(), calls = [], settings = { ...env(), ...overrides.env }
  const handler = createVercelHandler(settings, { storeFetcher: redis.fetcher, fetcher: async (url, options) => { calls.push({ url, options }); return Response.json(stock) },
    verifyGoogle: async token => ({ sub: 'google-id', name: 'Google User', email: 'user@example.test', email_verified: true, nonce: token }), ...overrides.options })
  const server = createServer((req, res) => {
    // Model Vercel's lazy helper which captures the URL before normalization.
    const captured = parse(new URL(req.url, 'https://test.example').search.slice(1))
    Object.defineProperty(req, 'query', { configurable: true, get: () => captured })
    Object.defineProperty(req, 'body', { configurable: true, get: () => { throw new Error('Vercel body helper must be removed before Express parses the stream') } })
    handler(req, res)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (path, options = {}) => fetch(`${base}${path}`, options)
  const route = (path, params = {}) => `/api/index?${new URLSearchParams({ __trovan_path: path, ...params })}`
  async function guest() {
    const response = await request(route('auth/guest'), { method: 'POST', headers: { Origin: 'https://trovan.example', 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  return { request, route, guest, calls, redis }
}
test('Vercel adapter routes authenticated market calls through the existing client and supports all service paths', async t => {
  const f = await fixture(t), Cookie = await f.guest()
  const response = await f.request(f.route('indianapi/stock', { name: 'Test' }), { headers: { Cookie } })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, stock)
  assert.equal(f.calls[0].url, 'https://stock.indianapi.in/stock?name=Test')
  assert.equal(f.calls[0].options.headers['X-Api-Key'], 'test-vercel-provider-key')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  const paths = [...Object.values(market), funds.list, funds.search('Test'), funds.details('Test'), stocks.search('Test'), stocks.details('Test'), stocks.industry('Test'),
    stocks.history('Test', '1yr'), stocks.stats('Test', 'quarter_results'), stocks.statement('Test', 'cashflow'), stocks.actions('Test'), stocks.announcements('Test'),
    stocks.forecasts({ stock_id: '1' }), stocks.target('1')]
  for (const path of paths) {
    assert.ok(path.startsWith('/api/indianapi/'))
    const endpoint = new URL(path, 'https://test.example').pathname.split('/').at(-1)
    assert.ok(endpoint === 'search' || Object.hasOwn(contracts, endpoint))
  }
  const search = await f.request(f.route('indianapi/search', { query: 'Test' }), { headers: { Cookie } })
  assert.equal(search.status, 200)
  assert.deepEqual((await search.json()).data, [stock])
  assert.equal((await f.request('/api/market/stock?name=Test', { headers: { Cookie } })).status, 200)
})
test('Google challenge, session, and logout remain valid across cold function instances', async t => {
  const redis = redisFixture(), first = await fixture(t, { redis }), second = await fixture(t, { redis })
  const challenge = await first.request(first.route('auth/config')), body = await challenge.json()
  const nonceCookie = challenge.headers.get('set-cookie').split(';')[0]
  assert.match(nonceCookie, /^__Host-trovan_nonce=/)
  const login = await second.request(second.route('auth/google'), { method: 'POST', headers: { Origin: 'https://trovan.example', Cookie: nonceCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: body.nonce }) })
  assert.equal(login.status, 200)
  const sessionCookie = login.headers.get('set-cookie').split(';')[0]
  const restored = await first.request(first.route('auth/session'), { headers: { Cookie: sessionCookie } })
  assert.equal((await restored.json()).user.name, 'Google User')
  const logout = await second.request(second.route('auth/logout'), { method: 'POST', headers: { Origin: 'https://trovan.example', Cookie: sessionCookie } })
  assert.equal(logout.status, 204)
  assert.equal((await first.request(first.route('auth/session'), { headers: { Cookie: sessionCookie } })).status, 401)
  const replay = await first.request(first.route('auth/google'), { method: 'POST', headers: { Origin: 'https://trovan.example', Cookie: nonceCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: body.nonce }) })
  assert.equal(replay.status, 401)
})
test('new API routes reject unauthenticated, invalid, unsupported-method and cross-origin requests', async t => {
  const f = await fixture(t)
  assert.equal((await f.request(f.route('indianapi/stock', { name: 'Test' }))).status, 401)
  const Cookie = await f.guest()
  assert.equal((await f.request(f.route('indianapi/unknown'), { headers: { Cookie } })).status, 404)
  assert.equal((await f.request(f.route('indianapi/stock', { name: 'Test', extra: 'bad' }), { headers: { Cookie } })).status, 400)
  assert.equal((await f.request(f.route('indianapi/historical_data', { stock_name: 'Test', period: '1D', filter: 'price' }), { headers: { Cookie } })).status, 400)
  const method = await f.request(f.route('indianapi/stock', { name: 'Test' }), { method: 'POST', headers: { Cookie, Origin: 'https://trovan.example' } })
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'GET, HEAD')
  assert.equal((await f.request(f.route('auth/guest'), { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403)
  assert.equal((await f.request('/api/unknown')).status, 404)
  assert.equal((await f.request('/api/index?__trovan_path=indianapi/stock&__trovan_path=auth/guest')).status, 400)
  assert.equal(f.calls.length, 0)
})
test('missing credentials and provider failures return safe JSON with useful status codes', async t => {
  const missing = await fixture(t, { env: { INDIAN_API_KEY: '' } }), Cookie = await missing.guest()
  const response = await missing.request(missing.route('indianapi/stock', { name: 'Test' }), { headers: { Cookie } })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'API_NOT_CONFIGURED')
  for (const [status, expected] of [[401, 502], [403, 502], [404, 404], [429, 429], [500, 502]]) {
    const f = await fixture(t, { options: { fetcher: async () => new Response('SECRET upstream details', { status, headers: { 'Retry-After': '30' } }) } })
    const Cookie = await f.guest()
    const failure = await f.request(f.route('indianapi/stock', { name: 'Test' }), { headers: { Cookie } })
    assert.equal(failure.status, expected)
    assert.doesNotMatch(await failure.text(), /SECRET|test-vercel-provider-key|test-redis-token/)
    if (status === 429) assert.equal(failure.headers.get('retry-after'), '30')
  }
  const broken = await fixture(t, { env: { SESSION_SECRET: '' } })
  const configuration = await broken.request('/api/health')
  assert.equal(configuration.status, 503)
  assert.equal((await configuration.json()).error.code, 'SERVER_NOT_CONFIGURED')
  const noRedis = await fixture(t, { env: { UPSTASH_REDIS_REST_TOKEN: '' } })
  const storage = await noRedis.request(noRedis.route('auth/guest'), { method: 'POST', headers: { Origin: 'https://trovan.example' } })
  assert.equal(storage.status, 503)
  assert.equal((await storage.json()).error.code, 'SESSION_STORE_NOT_CONFIGURED')
})

test('serverless JSON parsing and auth rate limits return safe JSON errors', async t => {
  const f = await fixture(t)
  const malformed = await f.request(f.route('auth/guest'), { method: 'POST', headers: { Origin: 'https://trovan.example', 'Content-Type': 'application/json' }, body: '{"SECRET":' })
  assert.equal(malformed.status, 400)
  const failure = await malformed.text()
  assert.doesNotMatch(failure, /SECRET/)
  assert.equal(JSON.parse(failure).error.code, 'REQUEST_FAILED')
  for (let i = 0; i < 20; i++) assert.equal((await f.request(f.route('auth/config'))).status, 200)
  const limited = await f.request(f.route('auth/config'))
  assert.equal(limited.status, 429)
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED')
  assert.ok(limited.headers.get('retry-after'))
})
test('an upstream response cannot echo the IndianAPI key into browser JSON', async t => {
  const f = await fixture(t, { options: { fetcher: async () => Response.json({ ...stock, diagnostics: { key: 'test-vercel-provider-key' } }) } })
  const Cookie = await f.guest()
  const response = await f.request(f.route('indianapi/stock', { name: 'Test' }), { headers: { Cookie } })
  assert.equal(response.status, 502)
  assert.doesNotMatch(await response.text(), /test-vercel-provider-key/)
})
test('Vercel settings preserve Vite assets, API routing and trusted environment origins', () => {
  const settings = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(settings.framework, 'vite')
  assert.equal(settings.outputDirectory, 'dist')
  assert.equal(settings.functions['api/index.js'].includeFiles, 'docs/indian-api-v1.openapi.json')
  const fallback = new RegExp(`^${settings.rewrites.at(-1).source}$`)
  assert.equal(fallback.test('/market'), true)
  assert.equal(fallback.test('/api/indianapi/stock'), false)
  assert.equal(fallback.test('/assets/index-test.js'), false)
  const config = getConfig({ ...env(), NODE_ENV: 'development' })
  assert.equal(config.production, true)
  assert.equal(config.origin, 'https://trovan.example')
})
