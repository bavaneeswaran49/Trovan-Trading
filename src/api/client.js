export class RequestError extends Error {
  constructor(message, status, code, retryAfter) { super(message); Object.assign(this, { status, code, retryAfter }) }
}

export async function api(path, options = {}) {
  const timeout = AbortSignal.timeout(20_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }, signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new RequestError('Unable to connect to the server. Check your internet connection and try again.', 0, 'NETWORK_ERROR')
  }
  if (response.status === 204) return null
  let body
  try { body = await response.json() }
  catch { throw new RequestError('Unable to load this page. Please try again.', response.status, 'INVALID_RESPONSE') }
  if (!response.ok) {
    if (response.status === 401 && (path.startsWith('/api/indianapi/') || path.startsWith('/api/market/')) && typeof window !== 'undefined') window.dispatchEvent(new Event('session-expired'))
    throw new RequestError(body.error?.message || 'Unable to load market data. Please try again.', response.status, body.error?.code, body.error?.retryAfter)
  }
  return body
}
export function marketPath(endpoint, params = {}) { return `/api/indianapi/${endpoint}?${new URLSearchParams(params)}` }
