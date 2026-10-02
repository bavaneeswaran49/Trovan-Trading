import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
if (existsSync('.env')) process.loadEnvFile('.env')
const secrets = ['INDIAN_API_KEY', 'SESSION_SECRET', 'JWT_SECRET', 'GOOGLE_CLIENT_SECRET'].map(name => process.env[name]).filter(Boolean)
const forbidden = ['X-Api-Key', 'SESSION_SECRET', 'JWT_SECRET', 'GOOGLE_CLIENT_SECRET', 'test-server-key', ...secrets]
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) check(file)
    else if (/\.(js|html|css)$/.test(file)) {
      const source = readFileSync(file, 'utf8')
      if (forbidden.some(value => source.includes(value))) throw new Error('A server-only value was detected in the frontend build. Do not deploy it.')
      if (source.includes('Download the React DevTools for a better development experience')) throw new Error('React development code was detected in the production bundle.')
    }
  }
}
check('dist')
console.log('Frontend bundle checked: no configured secrets or server-only authentication code detected.')
const assets = readdirSync('dist/assets').filter(name => /^index-.*\.js$/.test(name))
for (const asset of assets) {
  const size = gzipSync(readFileSync(path.join('dist/assets', asset))).byteLength
  if (size > 100 * 1024) throw new Error(`The main JavaScript bundle exceeds the 100 KiB gzip budget: ${size} bytes.`)
  console.log(`Main JavaScript: ${(size / 1024).toFixed(1)} KiB gzip (budget: 100 KiB).`)
}
