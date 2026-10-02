import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// Read local values solely for comparison. Never print a matched secret or line.
if (existsSync('.env')) process.loadEnvFile('.env')
const names = ['INDIAN_API_KEY', 'SESSION_SECRET', 'JWT_SECRET', 'GOOGLE_CLIENT_SECRET', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN']
const secrets = names.map(name => process.env[name]).filter(value => value && !value.startsWith('replace-with-'))
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))]
const violations = []
const counts = { INDIAN_API_KEY: 0, VITE_INDIAN_API_KEY: 0, 'sk-': 0 }
for (const file of files) {
  if (!existsSync(file) || !/\.(?:js|jsx|mjs|cjs|ts|tsx|json|html|css|md|yml|yaml)$/.test(file) && !file.startsWith('.env')) continue
  const text = readFileSync(file, 'utf8')
  for (const pattern of Object.keys(counts)) if (text.includes(pattern)) counts[pattern]++
  if (secrets.some(secret => text.includes(secret))) violations.push(`${file}: contains a configured server secret`)
  if (file.startsWith('src/') && /INDIAN_API_KEY|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN|stock\.indianapi\.in/.test(text)) violations.push(`${file}: server-only integration referenced by frontend source`)
  if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(text)) violations.push(`${file}: resembles a hardcoded secret`)
  const assignments = [...text.matchAll(/\b(?:VITE_)?INDIAN_API_KEY\s*[:=]\s*['"]([^'"\s]+)['"]/g)]
  if (assignments.some(([, value]) => !file.startsWith('tests/') || !/^(test-|fixture-)/.test(value))) violations.push(`${file}: hardcoded IndianAPI key assignment`)
}
const trackedEnv = execFileSync('git', ['ls-files', '-z', '.env', '.env.*'], { encoding: 'utf8' }).split('\0').filter(file => file && file !== '.env.example')
if (trackedEnv.length) violations.push('A real environment file is tracked by Git')
if (violations.length) {
  violations.forEach(violation => console.error(violation))
  process.exitCode = 1
} else {
  console.log(`Secret scan passed across ${files.length} tracked and unignored files. No matched values were printed.`)
  console.log(`Pattern file counts (including docs and checks): ${JSON.stringify(counts)}`)
  console.log('Real .env files are not tracked; IndianAPI requests remain outside src/.')
}
