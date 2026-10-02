import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRedisStore } from '../server/redisStore.js'
import { getConfig } from '../server/config.js'
import { redisFixture } from './helpers/redis.js'

const settings = () => ({ ...getConfig({}), redisUrl: 'https://test-redis.example', redisToken: 'test-redis-token' })
test('separate serverless stores share revocable guest/Google sessions and updated profiles', async () => {
  const redis = redisFixture(), config = settings(), first = createRedisStore(config, redis.fetcher), second = createRedisStore(config, redis.fetcher)
  const guest = await first.guestLogin()
  assert.equal((await second.user(guest)).isGuest, true)
  const profile = { googleId: 'google-test', name: 'Test User', email: 'test@example.test', picture: '' }
  const google = await second.login(profile, guest)
  assert.equal(await first.user(guest), null)
  assert.deepEqual(await first.user(google), profile)
  const another = await first.login({ ...profile, name: 'Updated' })
  assert.equal((await second.user(google)).name, 'Updated')
  const nextGuest = await first.guestLogin(google)
  assert.equal(await second.user(google), null)
  assert.equal((await second.user(nextGuest)).isGuest, true)
  await second.logout(nextGuest)
  assert.equal(await first.user(nextGuest), null)
  assert.equal((await second.user(another)).name, 'Updated')
  for (const key of redis.values.keys()) assert.doesNotMatch(key, new RegExp(`${guest}|${google}|${nextGuest}`))
  for (const call of redis.calls) { assert.equal(call.options.headers.Authorization, 'Bearer test-redis-token'); assert.equal(call.options.redirect, 'error') }
})
test('single-use challenges and session expiry work across function instances', async () => {
  const redis = redisFixture(), config = settings(), first = createRedisStore(config, redis.fetcher), second = createRedisStore(config, redis.fetcher)
  const nonce = await first.challenge()
  const consumed = await Promise.all([first.consumeChallenge(nonce), second.consumeChallenge(nonce)])
  assert.equal(consumed.filter(Boolean).length, 1)
  const expiredNonce = await first.challenge(), guest = await first.guestLogin()
  redis.advance(600_001)
  assert.equal(await second.consumeChallenge(expiredNonce), false)
  assert.equal((await second.user(guest)).isGuest, true)
  redis.advance(config.sessionDays * 86400_000)
  assert.equal(await second.user(guest), null)
})
test('missing Redis configuration and upstream errors fail closed with safe messages', async () => {
  assert.throws(() => createRedisStore({ ...settings(), redisToken: '' }), error => error.status === 503 && error.code === 'SESSION_STORE_NOT_CONFIGURED')
  assert.throws(() => createRedisStore({ ...settings(), redisUrl: 'http://test.example' }), error => error.status === 503)
  for (const fetcher of [async () => { throw new Error('SECRET upstream info') }, async () => new Response('SECRET', { status: 401 }), async () => Response.json({ error: 'SECRET internal info' }), async () => new Response('not JSON'), async () => Response.json([])]) {
    const store = createRedisStore(settings(), fetcher)
    await assert.rejects(store.guestLogin(), error => error.status === 503 && error.code === 'SESSION_STORE_UNAVAILABLE' && !/SECRET|test-redis-token/.test(error.message))
  }
})
