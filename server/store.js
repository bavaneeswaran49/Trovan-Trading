import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'

export function createStore(config) {
  if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true })
  const db = new DatabaseSync(config.databasePath)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (google_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, picture TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, google_id TEXT NOT NULL REFERENCES users(google_id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guest_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);`)
  const hash = token => createHmac('sha256', config.secret).update(token).digest('hex')
  const clean = () => {
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
    db.prepare('DELETE FROM guest_sessions WHERE expires <= ?').run(Date.now())
    db.prepare('DELETE FROM challenges WHERE expires <= ?').run(Date.now())
  }
  const logout = token => {
    if (!token) return
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token))
    db.prepare('DELETE FROM guest_sessions WHERE token_hash=?').run(hash(token))
  }
  return {
    challenge() {
      clean()
      const nonce = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO challenges VALUES (?, ?)').run(hash(nonce), Date.now() + 600000)
      return nonce
    },
    consumeChallenge(nonce) {
      return Boolean(db.prepare('DELETE FROM challenges WHERE token_hash = ? AND expires > ? RETURNING token_hash').get(hash(nonce), Date.now()))
    },
    login(profile, previousToken) {
      clean()
      logout(previousToken)
      db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?) ON CONFLICT(google_id) DO UPDATE SET
        name=excluded.name, email=excluded.email, picture=excluded.picture`).run(profile.googleId, profile.name, profile.email, profile.picture)
      const token = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), profile.googleId, Date.now() + config.sessionDays * 86400000)
      return token
    },
    guestLogin(previousToken) {
      clean()
      logout(previousToken)
      const token = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO guest_sessions VALUES (?, ?)').run(hash(token), Date.now() + config.sessionDays * 86400000)
      return token
    },
    user(token) {
      if (!token || token.length > 100) return null
      if (db.prepare('SELECT token_hash FROM guest_sessions WHERE token_hash=? AND expires>?').get(hash(token), Date.now())) {
        return { name: 'Guest', email: '', picture: '', isGuest: true }
      }
      return db.prepare(`SELECT u.google_id AS googleId, u.name, u.email, u.picture FROM users u
        JOIN sessions s ON s.google_id=u.google_id WHERE s.token_hash=? AND s.expires>?`).get(hash(token), Date.now()) || null
    },
    logout,
    close() { db.close() },
  }
}
