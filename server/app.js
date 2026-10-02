import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { OAuth2Client } from 'google-auth-library'
import { z } from 'zod'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createStore } from './store.js'
import { createIndianApi, ApiError } from './indianApi/client.js'
import { searchContract } from './indianApi/contracts.js'
import { projectRoot } from './config.js'

function cookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))
  return entry?.slice(name.length + 1) || ''
}
function googleServiceUnavailable(error) {
  const networkCodes = new Set(['EACCES', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'])
  for (let cause = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    if (networkCodes.has(cause.code) || ['TimeoutError', 'AbortError'].includes(cause.name) || (cause.response?.status ?? cause.status) >= 500) return true
  }
  return false
}
export function createApp(config, options = {}) {
  const app = express(), store = options.store || createStore(config)
  const indianApi = createIndianApi(config, options.fetcher)
  const google = new OAuth2Client({ clientId: config.clientId, transporterOptions: { timeout: config.timeout } })
  const verifyGoogle = options.verifyGoogle || (async credential => (await google.verifyIdToken({ idToken: credential, audience: config.clientId })).getPayload())
  const sessionName = config.production ? '__Host-trovan_session' : 'trovan_session'
  const nonceName = config.production ? '__Host-trovan_nonce' : 'trovan_nonce'
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' }
  const allowedOrigins = new Set([config.origin])
  const localHosts = ['localhost', '127.0.0.1', '[::1]']
  const appOrigin = new URL(config.origin)
  const rateLimitMessage = { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } }
  if (!config.production && localHosts.includes(appOrigin.hostname)) {
    for (const hostname of localHosts) {
      appOrigin.hostname = hostname
      allowedOrigins.add(appOrigin.origin)
    }
  }
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, contentSecurityPolicy: config.production ? {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
      imgSrc: ["'self'", 'https:', 'data:'], connectSrc: ["'self'", 'https://accounts.google.com'],
      frameSrc: ['https://accounts.google.com'], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] }
  } : false }))
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: rateLimitMessage }))
  app.use(express.json({ limit: '16kb' }))
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && (!allowedOrigins.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site')) {
      return res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'This request could not be verified. Please refresh and try again.' } })
    }
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/auth/config', rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }), async (_req, res) => {
    const nonce = await store.challenge()
    res.cookie(nonceName, nonce, { ...cookieOptions, maxAge: 600000 })
    res.json({ clientId: config.clientId, nonce })
  })
  app.get('/api/auth/session', async (req, res) => {
    const user = await store.user(cookie(req, sessionName))
    if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } })
    res.json({ user })
  })
  app.post('/api/auth/google', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }), async (req, res) => {
    if (!config.clientId) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Google sign-in is not configured yet. Please contact the application administrator.')
    const parsed = z.object({ credential: z.string().min(1).max(12000) }).safeParse(req.body)
    const nonce = cookie(req, nonceName)
    if (!parsed.success || !nonce || !await store.consumeChallenge(nonce)) throw new ApiError(401, 'AUTH_FAILED', 'Unable to sign in with Google. Please try again.')
    let payload
    try { payload = await verifyGoogle(parsed.data.credential) } catch (error) {
      if (googleServiceUnavailable(error)) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Unable to reach Google to verify your sign-in. Please prepare sign-in again and retry.')
      throw new ApiError(401, 'AUTH_FAILED', 'Unable to sign in with Google. Please try again.')
    }
    if (!payload?.sub || !payload.email || !payload.email_verified || payload.nonce !== nonce) throw new ApiError(401, 'AUTH_FAILED', 'Unable to sign in with Google. Please try again.')
    const profile = { googleId: payload.sub, name: payload.name || payload.email, email: payload.email, picture: payload.picture || '' }
    const token = await store.login(profile, cookie(req, sessionName))
    res.cookie(sessionName, token, { ...cookieOptions, maxAge: config.sessionDays * 86400000 })
    res.clearCookie(nonceName, cookieOptions)
    res.json({ user: profile })
  })
  app.post('/api/auth/guest', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }), async (req, res) => {
    const token = await store.guestLogin(cookie(req, sessionName))
    res.cookie(sessionName, token, { ...cookieOptions, maxAge: config.sessionDays * 86400000 })
    res.json({ user: await store.user(token) })
  })
  app.post('/api/auth/logout', async (req, res) => {
    await store.logout(cookie(req, sessionName))
    res.clearCookie(sessionName, cookieOptions)
    res.status(204).end()
  })
  const marketPrefixes = ['/api/indianapi', '/api/market']
  app.use(marketPrefixes, async (req, res, next) => {
    if (!await store.user(cookie(req, sessionName))) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has expired. Please sign in again.' } })
    next()
  })
  app.get(marketPrefixes.map(prefix => `${prefix}/search`), async (req, res) => {
    const result = searchContract.safeParse(req.query)
    if (!result.success) throw new ApiError(400, 'INVALID_PARAMETERS', 'Enter a company name or stock symbol.')
    // /search is listed in v1 allowed_endpoints, but absent from its OpenAPI and
    // narrative docs. Do not guess its contract. Use documented /stock?name=.
    const value = await indianApi.request('stock', { name: result.data.query })
    res.json({ ...value, data: [value.data], searchMode: 'company-lookup' })
  })
  app.get(marketPrefixes.map(prefix => `${prefix}/:endpoint`), async (req, res) => res.json(await indianApi.request(req.params.endpoint, req.query)))
  app.use(marketPrefixes, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD')
      return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Market data endpoints only support GET requests.' } })
    }
    next()
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This resource could not be found.' } }))
  if (config.production && options.serveStatic !== false) {
    const index = readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8').replaceAll('__APP_ORIGIN__', config.origin)
    const serveIndex = (_req, res) => res.type('html').send(index)
    app.get(['/', '/index.html'], serveIndex)
    app.use(express.static(path.join(projectRoot, 'dist')))
    app.get('/{*path}', serveIndex)
  }
  app.use((error, _req, res, _next) => {
    const known = error instanceof ApiError
    const status = known ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500
    if (known && error.retryAfter) res.set('Retry-After', String(error.retryAfter))
    res.status(status).json({ error: { code: known ? error.code : 'REQUEST_FAILED', message: known ? error.message : 'Unable to complete this request. Please try again.', ...(known && error.retryAfter ? { retryAfter: error.retryAfter } : {}) } })
  })
  return { app, store }
}
