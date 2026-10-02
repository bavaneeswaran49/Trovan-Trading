import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { api, RequestError } from '../src/api/client.js'
import { authConfigOptions, queryClient, resetSession, resourceOptions, sessionKey } from '../src/api/queryClient.js'
import { closestPrice, priceSeries, samplePrices } from '../src/utils/chart.js'

const originalFetch = globalThis.fetch
const clients = []
function client() {
  const instance = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(instance)
  return instance
}
afterEach(() => { globalThis.fetch = originalFetch; clients.forEach(instance => instance.clear()); clients.length = 0; queryClient.clear() })
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

test('query observers share one request and fresh market data is reused', async () => {
  const instance = client(), options = resourceOptions('/api/market/trending?')
  let requests = 0
  globalThis.fetch = async () => { requests++; return json({ data: { prices: [100] } }) }
  const [first, second] = await Promise.all([instance.fetchQuery(options), instance.fetchQuery(options)])
  assert.equal(requests, 1)
  assert.deepEqual(first, second)
  await instance.fetchQuery(options)
  assert.equal(requests, 1)
  await instance.invalidateQueries({ queryKey: ['market'] })
  await instance.fetchQuery(options)
  assert.equal(requests, 2)
})
test('a React remount shares one Google challenge request instead of aborting and replacing its cookie', async () => {
  const instance = client(), options = authConfigOptions()
  let requests = 0, finish, signal
  globalThis.fetch = (_path, init) => {
    requests++; signal = init.signal
    return new Promise(resolve => { finish = () => resolve(json({ clientId: 'test.apps.googleusercontent.com', nonce: 'same-challenge' })) })
  }
  const first = new QueryObserver(instance, options)
  const unsubscribe = first.subscribe(() => {})
  unsubscribe()
  assert.equal(signal.aborted, false)
  const second = new QueryObserver(instance, options)
  const success = new Promise(resolve => {
    const stop = second.subscribe(result => { if (result.isSuccess) { stop(); resolve(result.data) } })
  })
  finish()
  assert.deepEqual(await success, { clientId: 'test.apps.googleusercontent.com', nonce: 'same-challenge' })
  assert.equal(requests, 1)
})

test('a different history period has an independent query and an abandoned request is aborted', async () => {
  const instance = client(), first = resourceOptions('/api/market/historical_data?stock_name=Test&period=1m')
  const second = resourceOptions('/api/market/historical_data?stock_name=Test&period=1yr')
  assert.notDeepEqual(first.queryKey, second.queryKey)
  let requestSignal
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const pending = instance.fetchQuery(first)
  const rejected = assert.rejects(pending)
  await instance.cancelQueries({ queryKey: first.queryKey })
  await rejected
  assert.equal(requestSignal.aborted, true)
  assert.equal(instance.getQueryData(first.queryKey), undefined)
})

test('session transitions cancel outstanding queries and remove the previous account cache', async () => {
  queryClient.setQueryData(['market', '/old'], { data: 'private previous-session data' })
  queryClient.setQueryData(['auth', 'config'], { nonce: 'old-challenge' })
  let requestSignal
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const pending = queryClient.fetchQuery(resourceOptions('/api/market/trending?'))
  const rejected = assert.rejects(pending)
  await resetSession({ name: 'New user' })
  await rejected
  assert.equal(requestSignal.aborted, true)
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ['market'] }).length, 0)
  assert.equal(queryClient.getQueryData(['auth', 'config']), undefined)
  assert.deepEqual(queryClient.getQueryData(sessionKey), { user: { name: 'New user' } })
  await resetSession()
  assert.deepEqual(queryClient.getQueryData(sessionKey), { user: null })
})

test('rate limits and authentication errors are not automatically retried', () => {
  const retry = queryClient.getDefaultOptions().queries.retry
  for (const status of [400, 401, 403, 404, 429]) assert.equal(retry(0, { status }), false)
  assert.equal(retry(0, { status: 503 }), true)
  assert.equal(retry(1, { status: 503 }), false)
  assert.equal(retry(0, { status: 503, code: 'API_NOT_CONFIGURED' }), false)
  assert.equal(retry(0, { status: 502, code: 'API_AUTH_FAILED' }), false)
})

test('failed background refresh retains the last successful data', async () => {
  const instance = client(), options = resourceOptions('/api/market/news?')
  const previous = { data: [{ title: 'Existing news' }] }
  instance.setQueryData(options.queryKey, previous)
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Limited', code: 'RATE_LIMITED', retryAfter: 30 } }), { status: 429 })
  await assert.rejects(instance.fetchQuery({ ...options, staleTime: 0 }), error => error.status === 429 && error.retryAfter === 30)
  assert.deepEqual(instance.getQueryData(options.queryKey), previous)
})

test('API transport handles empty logout responses and malformed JSON', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 })
  assert.equal(await api('/api/auth/logout', { method: 'POST', body: '{}' }), null)
  globalThis.fetch = async () => new Response('not json', { status: 200 })
  await assert.rejects(api('/api/market/news?'), error => error instanceof RequestError && error.code === 'INVALID_RESPONSE')
})

test('large chart series stays bounded and preserves endpoints and price extremes', () => {
  const values = Array.from({ length: 20_000 }, (_, index) => [new Date(Date.UTC(2000, 0, index + 1)).toISOString().slice(0, 10), index === 501 ? 100_000 : index === 1501 ? -100_000 : index])
  const sampled = samplePrices(values)
  assert.ok(sampled.length <= 800)
  assert.equal(sampled[0], values[0])
  assert.equal(sampled.at(-1), values.at(-1))
  assert.ok(sampled.includes(values[501]))
  assert.ok(sampled.includes(values[1501]))
  const series = priceSeries({ datasets: [{ metric: 'Price', values }] })
  assert.equal(series.values.length, 20_000)
  assert.ok(series.line.length < 20_000)
  assert.equal(closestPrice(series.values, Date.parse(values[1234][0])), 1234)
})

test('chart sorts valid dates, keeps zero prices, and matches volumes by date', () => {
  const series = priceSeries({ datasets: [{ metric: 'Price', values: [['2025-01-03', 4], ['bad', 3], ['2025-01-01', 0], ['2025-01-02', null]] }, { metric: 'Volume', values: [['2025-01-01', 0]] }] })
  assert.deepEqual(series.values, [['2025-01-01', 0], ['2025-01-03', 4]])
  assert.equal(series.volumes.get('2025-01-01'), 0)
  assert.doesNotMatch(series.line, /NaN|Infinity/)
})
