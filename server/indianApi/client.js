import { contracts, validateResponse } from './contracts.js'

export class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message); Object.assign(this, { status, code, retryAfter }) }
}
export function createIndianApi(config, fetcher = fetch) {
  const cache = new Map(), pending = new Map()
  let blockedUntil = 0
  async function request(endpoint, params = {}) {
    if (!contracts[endpoint]) throw new ApiError(404, 'ENDPOINT_NOT_FOUND', 'This data source is unavailable.')
    const parsed = contracts[endpoint].safeParse(params)
    if (!parsed.success) throw new ApiError(400, 'INVALID_PARAMETERS', 'Please check your search or selected options.')
    if (!config.apiKey) throw new ApiError(503, 'API_NOT_CONFIGURED', 'Market data is not configured. Set INDIAN_API_KEY on the server.')
    const query = new URLSearchParams(Object.entries(parsed.data).sort(([a], [b]) => a.localeCompare(b)))
    const key = `${endpoint}?${query}`
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    if (pending.has(key)) return pending.get(key)
    if (blockedUntil > Date.now()) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', Math.ceil((blockedUntil - Date.now()) / 1000))
    const task = (async () => {
      let response
      try { response = await fetcher(`${config.baseUrl}/${key}`, { headers: { 'X-Api-Key': config.apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(config.timeout), redirect: 'error' }) }
      catch (error) { throw new ApiError(504, error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR', 'Unable to connect to the market data service. Please try again.') }
      if (response.status === 401 || response.status === 403) throw new ApiError(502, 'API_AUTH_FAILED', 'Market data access could not be verified. Please contact the application administrator.')
      if (response.status === 429) {
        const header = response.headers.get('retry-after'), seconds = Number(header)
        const retry = Math.min(300, Math.max(1, Number.isFinite(seconds) && header ? seconds : header ? (Date.parse(header) - Date.now()) / 1000 || 60 : 60))
        blockedUntil = Date.now() + retry * 1000
        throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', Math.ceil(retry))
      }
      if (response.status === 404) throw new ApiError(404, 'NO_DATA', 'No data was found for this selection.')
      if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR', 'Unable to load market data. Please try again.')
      let data
      try { data = await response.json() } catch { throw new ApiError(502, 'INVALID_RESPONSE', 'The market data service returned an unexpected response. Please try again.') }
      const valid = validateResponse(endpoint, data)
      if (!valid.success || (data && typeof data === 'object' && ('error' in data || 'detail' in data))) throw new ApiError(502, 'INVALID_RESPONSE', 'The market data service returned an unexpected response. Please try again.')
      // Fail closed even if an upstream response unexpectedly echoes its key.
      if (JSON.stringify(valid.data).includes(config.apiKey)) throw new ApiError(502, 'INVALID_RESPONSE', 'The market data service returned an unexpected response. Please try again.')
      const value = { data: valid.data, fetchedAt: new Date().toISOString(), source: 'Indian API' }
      if (cache.size >= 500) cache.delete(cache.keys().next().value)
      cache.set(key, { value, expires: Date.now() + (['news', 'mutual_funds', 'mutual_funds_details'].includes(endpoint) ? 300000 : 60000) })
      return value
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }
  return { request }
}
