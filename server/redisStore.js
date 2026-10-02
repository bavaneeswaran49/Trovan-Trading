import { createHmac, randomBytes } from 'node:crypto'
import { ApiError } from './indianApi/client.js'

// The SQLite store remains the local default. Vercel instances share this store
// over HTTPS, preserving opaque sessions, revocation, and single-use challenges.
export function createRedisStore(config, fetcher = fetch) {
  let url
  try { url = new URL(config.redisUrl) } catch { /* Report only safe configuration guidance. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !config.redisToken) {
    throw new ApiError(503, 'SESSION_STORE_NOT_CONFIGURED', 'Shared session storage is not configured. Set the Redis REST URL and token on the server.')
  }
  const hash = value => createHmac('sha256', config.secret).update(value).digest('hex')
  const key = (type, value) => `trovan:${type}:${hash(value)}`
  const ttl = Math.floor(config.sessionDays * 86400)
  const unavailable = () => new ApiError(503, 'SESSION_STORE_UNAVAILABLE', 'Unable to access your session. Please try again in a moment.')
  async function request(commands, transaction = false) {
    try {
      const response = await fetcher(transaction ? `${url.href.replace(/\/$/, '')}/multi-exec` : url.href, {
        method: 'POST', headers: { Authorization: `Bearer ${config.redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands), signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      })
      if (!response.ok) throw unavailable()
      const body = await response.json()
      const entries = transaction ? body : [body]
      if (!Array.isArray(entries) || transaction && entries.length !== commands.length || entries.some(entry => !entry || entry.error || !Object.hasOwn(entry, 'result'))) throw unavailable()
      return transaction ? entries.map(entry => entry.result) : body.result
    } catch { throw unavailable() }
  }
  async function saveSession(value, previousToken, profile) {
    const token = randomBytes(32).toString('base64url')
    const commands = []
    if (profile) commands.push(['SET', key('user', profile.googleId), JSON.stringify(profile)])
    if (previousToken && previousToken.length <= 100) commands.push(['DEL', key('session', previousToken)])
    commands.push(['SET', key('session', token), JSON.stringify(value), 'EX', ttl])
    await request(commands, true)
    return token
  }
  function parse(value) {
    try { return JSON.parse(value) } catch { throw unavailable() }
  }
  return {
    async challenge() {
      const nonce = randomBytes(32).toString('base64url')
      if (await request(['SET', key('challenge', nonce), '1', 'EX', 600, 'NX']) !== 'OK') throw unavailable()
      return nonce
    },
    async consumeChallenge(nonce) {
      if (!nonce || nonce.length > 100) return false
      return await request(['GETDEL', key('challenge', nonce)]) === '1'
    },
    login(profile, previousToken) { return saveSession({ googleId: profile.googleId }, previousToken, profile) },
    guestLogin(previousToken) { return saveSession({ isGuest: true }, previousToken) },
    async user(token) {
      if (!token || token.length > 100) return null
      const stored = await request(['GET', key('session', token)])
      if (!stored) return null
      const session = parse(stored)
      if (session?.isGuest === true) return { name: 'Guest', email: '', picture: '', isGuest: true }
      if (typeof session?.googleId !== 'string') throw unavailable()
      const user = await request(['GET', key('user', session.googleId)])
      if (!user) return null
      const profile = parse(user)
      if (typeof profile?.googleId !== 'string' || typeof profile.name !== 'string' || typeof profile.email !== 'string' || typeof profile.picture !== 'string') throw unavailable()
      return { googleId: profile.googleId, name: profile.name, email: profile.email, picture: profile.picture }
    },
    async logout(token) { if (token && token.length <= 100) await request(['DEL', key('session', token)]) },
    close() { /* HTTP transport has no database connection to close. */ },
  }
}
