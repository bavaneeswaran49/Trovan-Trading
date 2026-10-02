import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createApp } from '../server/app.js'
import { createStore } from '../server/store.js'
import { getConfig, projectRoot } from '../server/config.js'

test('a session and profile survive closing and reopening the database with the same secret', () => {
  const directory = path.join(projectRoot, 'test-results')
  mkdirSync(directory, { recursive: true })
  const settings = { ...getConfig({ SESSION_SECRET: 'test-persistence-secret-'.repeat(3) }), databasePath: path.join(directory, `${randomUUID()}.sqlite`) }
  let store = createStore(settings)
  try {
    const token = store.login({ googleId: 'persistent-test', name: 'Persisted', email: 'persisted@example.test', picture: '' })
    store.close()
    store = createStore(settings)
    assert.equal(store.user(token).name, 'Persisted')
    store.logout(token)
    store.close()
    store = createStore(settings)
    assert.equal(store.user(token), null)
  } finally { store.close(); unlinkSync(settings.databasePath) }
})
test('production serves built assets and trusted metadata; unknown API paths stay JSON', async t => {
  const settings = { ...getConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://trovan.example', SESSION_SECRET: 'test-production-secret-'.repeat(3) }), databasePath: ':memory:' }
  const { app, store } = createApp(settings)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const index = await fetch(base, { headers: { Host: 'attacker.example' } }), html = await index.text()
  assert.equal(index.status, 200)
  assert.match(html, /https:\/\/trovan.example\/og-premium.png/)
  assert.doesNotMatch(html, /attacker.example|__APP_ORIGIN__/)
  assert.match(index.headers.get('content-security-policy'), /accounts.google.com/)
  assert.match(index.headers.get('strict-transport-security'), /max-age/)
  assert.equal((await fetch(`${base}/og.png`)).status, 200)
  assert.equal((await fetch(`${base}/og-premium.png`)).status, 200)
  assert.equal((await fetch(`${base}/favicon.svg`)).status, 200)
  const unknown = await fetch(`${base}/api/unknown`)
  assert.equal(unknown.status, 404)
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND')
  const challenge = await fetch(`${base}/api/auth/config`)
  assert.match(challenge.headers.get('set-cookie'), /__Host-trovan_nonce=/)
  assert.match(challenge.headers.get('set-cookie'), /Secure;.*SameSite=Lax/)
})
