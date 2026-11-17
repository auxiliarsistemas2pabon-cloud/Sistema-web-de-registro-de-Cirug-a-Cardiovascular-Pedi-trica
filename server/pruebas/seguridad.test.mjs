import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request } from 'node:http'
import { after, before, test } from 'node:test'
import { escaparCsv } from '../../src/lib/csv.ts'

Object.assign(process.env, { NODE_ENV: 'development', LOCAL_HTTPS: 'false', TRUST_PROXY: '0', SESSION_MINUTES: '15', SESSION_MAX_HOURS: '12',
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'prueba', DB_PASSWORD: 'prueba', DB_NAME: 'prueba', MFA_ENCRYPTION_KEY: 'ab'.repeat(32) })
const { app } = await import('../app.mjs')
const { pool } = await import('../db.mjs')
const { validarClave } = await import('../auth.mjs')
const { cifrarSecreto, descifrarSecreto, crearRecuperacion, consumirRecuperacion, comprobarTotp } = await import('../mfa.mjs')
let servidor, base
before(async () => { servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening'); base = `http://127.0.0.1:${servidor.address().port}/api` })
after(async () => { await new Promise((r) => servidor.close(r)); await pool.end() })
async function pedir(ruta, { method = 'GET', body, headers = {} } = {}) {
  return fetch(base + ruta, { method, headers: { ...(method === 'GET' || method === 'OPTIONS' ? {} : { 'Content-Type': 'application/json', 'X-Cardio-Request': '1' }), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
}
test('ninguna familia clínica permite datos sin sesión ni analiza cuerpos grandes sin autenticar', async () => {
  for (const ruta of ['/pacientes', '/pacientes-adultos', '/listas/opciones', '/alertas', '/indicadores', '/exportacion/pacientes', '/admin/usuarios']) assert.equal((await pedir(ruta)).status, 401)
  assert.equal((await pedir('/importaciones/lotes', { method: 'POST', body: { datos: 'x'.repeat(300_000) } })).status, 401)
})
test('bloquea CSRF, formularios, otros orígenes y hosts de DNS rebinding', async () => {
  assert.equal((await pedir('/auth/logout', { method: 'POST', body: {}, headers: { 'X-Cardio-Request': '' } })).status, 403)
  assert.equal((await pedir('/auth/login', { method: 'POST', body: 'email=a', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415)
  for (const sitio of ['cross-site', 'same-site']) assert.equal((await pedir('/auth/me', { headers: { 'Sec-Fetch-Site': sitio } })).status, 403)
  const hostAjeno = await new Promise((resolve, reject) => {
    const r = request(base + '/salud', { headers: { Host: 'externo.example' } }, (res) => { res.resume(); resolve(res.statusCode) })
    r.on('error', reject); r.end()
  })
  assert.equal(hostAjeno, 403)
  const preflight = await pedir('/auth/logout', { method: 'OPTIONS', headers: { Origin: 'https://externo.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-cardio-request' } })
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null)
})
test('JSON inválido y cuerpos excesivos producen errores acotados', async () => {
  assert.equal((await pedir('/auth/login', { method: 'POST', body: '{' })).status, 400)
  assert.equal((await pedir('/auth/login', { method: 'POST', body: { email: 'x'.repeat(9000) } })).status, 413)
})
test('protege caché, marcos, contenido y referente', async () => {
  const r = await pedir('/auth/me')
  assert.equal(r.headers.get('Cache-Control'), 'no-store')
  assert.equal(r.headers.get('X-Powered-By'), null)
  assert.equal(r.headers.get('Referrer-Policy'), 'no-referrer')
  assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  assert.match(r.headers.get('Content-Security-Policy'), /object-src 'none'/)
})
test('cifra semillas con autenticación y rechaza alteraciones', () => {
  const cifrado = cifrarSecreto('SEMILLA-DE-PRUEBA')
  assert.notEqual(cifrado, cifrarSecreto('SEMILLA-DE-PRUEBA'))
  assert.equal(descifrarSecreto(cifrado), 'SEMILLA-DE-PRUEBA')
  const partes = cifrado.split('.'); partes[2] = 'AAAA' + partes[2].slice(4)
  assert.throws(() => descifrarSecreto(partes.join('.')))
  assert.equal(comprobarTotp(cifrado, 'incorrecto'), null)
})
test('los códigos de recuperación son aleatorios, solo se guardan hashes y se consumen', () => {
  const r = crearRecuperacion(); assert.equal(new Set(r.codigos).size, 8)
  assert.ok(r.codigos.every((c) => /^[a-f0-9]{32}$/.test(c)))
  const restantes = consumirRecuperacion(r.hashes, r.codigos[0])
  assert.equal(restantes.length, 7)
  assert.equal(consumirRecuperacion(restantes, r.codigos[0]), null)
})
test('contraseñas respetan bytes UTF-8; CSV neutraliza fórmulas y controles', () => {
  assert.equal(validarClave('Aa1' + 'ñ'.repeat(34) + 'b'), null)
  assert.ok(validarClave('Aa1' + 'ñ'.repeat(35)))
  assert.ok(validarClave('Abc12345678'))
  for (const v of ['=1+1', '  =1+1', '\t=1+1', '\r@SUM(A1)', '+CMD', '-1+1']) assert.ok(escaparCsv(v).includes("'"))
  assert.equal(escaparCsv('Texto\rOtra fila'), '"Texto\rOtra fila"')
  assert.equal(escaparCsv(-10), '-10')
})
