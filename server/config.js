import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:5173').origin
  const secret = env.SESSION_SECRET || env.JWT_SECRET || (production ? '' : randomBytes(32).toString('hex'))
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  if (production && secret.startsWith('replace-with-')) throw new Error('Replace the example SESSION_SECRET before running in production.')
  if (production && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.')
  const baseUrl = env.INDIAN_API_BASE_URL || 'https://stock.indianapi.in'
  if (!['https://stock.indianapi.in', 'https://dev.indianapi.in', 'https://analyst.indianapi.in', 'https://pro.indianapi.in'].includes(baseUrl)) {
    throw new Error('INDIAN_API_BASE_URL must be an official Indian API origin.')
  }
  return { production, origin, secret, baseUrl, apiKey: env.INDIAN_API_KEY || '', clientId: env.GOOGLE_CLIENT_ID || '',
    databasePath: env.DATABASE_PATH || path.join(projectRoot, 'data', 'trovan.sqlite'), port: Number(env.PORT || 3001),
    trustProxy: Number(env.TRUST_PROXY || 0), timeout: 12000, sessionDays: 30 }
}
