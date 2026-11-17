import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
Object.assign(process.env, { NODE_ENV: 'production', LOCAL_HTTPS: 'false', TRUST_PROXY: '0', DB_USER: 'prueba', DB_PASSWORD: 'prueba', DB_NAME: 'prueba',
  DB_HOST: '127.0.0.1', DB_PORT: '1', MFA_ENCRYPTION_KEY: 'ab'.repeat(32) })
const { app } = await import('../app.mjs')
const { pool } = await import('../db.mjs')
let servidor, base
before(async () => { servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening'); base = `http://127.0.0.1:${servidor.address().port}/api` })
after(async () => { await new Promise((r) => servidor.close(r)); await pool.end() })
test('producción rechaza HTTP y no confía en encabezados de un proxy no autorizado', async () => {
  const r = await fetch(`${base}/salud`, { headers: { 'X-Forwarded-Proto': 'https' } })
  assert.equal(r.status, 400); assert.equal((await r.json()).error.codigo, 'HTTPS_REQUERIDO')
})
test('un proxy autorizado requiere HTTPS y habilita HSTS', async () => {
  app.set('trust proxy', 1)
  const r = await fetch(`${base}/salud`, { headers: { 'X-Forwarded-Proto': 'https' } })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('Strict-Transport-Security'), /max-age=/)
})
