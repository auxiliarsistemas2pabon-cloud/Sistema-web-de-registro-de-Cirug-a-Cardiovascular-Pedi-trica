import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import * as OTPAuth from 'otpauth'

if (process.env.SECURITY_TEST_DB !== '1' || process.env.DB_NAME !== 'cardio_pruebas') throw new Error('Ejecute npm run test:security:mysql para usar una base aislada.')
const { pool, una } = await import('../db.mjs')
const { nuevoTotp, cifrarSecreto, crearRecuperacion, claveIntentos } = { ...await import('../mfa.mjs'), ...await import('../limites-auth.mjs') }
const BASE = `${process.env.API_URL}/api`
after(async () => pool.end())

async function pedir(ruta, { method = 'GET', cookie, body, headers = {} } = {}) {
  const res = await fetch(BASE + ruta, { method, headers: { 'X-Cardio-Request': '1', 'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const texto = await res.text()
  const nuevaCookie = res.headers.getSetCookie().find((c) => !c.includes('Expires='))?.split(';')[0]
  return { status: res.status, datos: texto ? JSON.parse(texto) : null, cookie: nuevaCookie, headers: res.headers }
}
async function usuario(rol = 'consulta', pendiente = false) {
  const id = randomUUID(), email = `${id}@example.test`, password = 'CuentaPruebaSegura123'
  const secreto = nuevoTotp(email).secret.base32
  const recuperacion = crearRecuperacion()
  await pool.query('INSERT INTO usuarios (id, email, nombre_completo, password_hash, rol, clave_temporal, mfa_secret, mfa_recuperacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, email, rol, await bcrypt.hash(password, 4), rol, pendiente, pendiente ? null : cifrarSecreto(secreto), JSON.stringify(recuperacion.hashes)])
  return { id, email, password, secreto, codigos: recuperacion.codigos }
}
async function entrar(u, recovery = true) {
  const login = await pedir('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } })
  assert.equal(login.status, 200, JSON.stringify(login.datos))
  assert.equal(login.datos.token, undefined)
  assert.equal(login.datos.perfil.password_hash, undefined)
  if (login.datos.paso !== 'mfa') return login
  const codigo = recovery ? u.codigos.shift() : OTPAuth.TOTP.generate({ secret: u.secreto })
  const verificacion = await pedir('/auth/mfa/verificar', { method: 'POST', cookie: login.cookie, body: { codigo } })
  assert.equal(verificacion.status, 200, JSON.stringify(verificacion.datos))
  assert.notEqual(verificacion.cookie, login.cookie)
  assert.equal((await pedir('/auth/me', { cookie: login.cookie })).status, 401)
  return verificacion
}

test('el alta exige cambiar clave y MFA antes de revelar datos; inscripción cifrada y códigos de un solo uso', async () => {
  const u = await usuario('consulta', true)
  const login = await entrar(u)
  assert.equal(login.datos.paso, 'clave')
  assert.equal((await pedir('/pacientes', { cookie: login.cookie })).status, 403)
  assert.equal((await pedir('/auth/mfa/enrolar', { method: 'POST', cookie: login.cookie, body: {} })).status, 403)
  const nueva = 'NuevaClavePrueba456'
  const limiteInicial = await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ?', [u.id])
  const cambioClave = await pedir('/auth/clave', { method: 'POST', cookie: login.cookie, body: { password_actual: u.password, password_nueva: nueva } })
  assert.equal(cambioClave.status, 200)
  assert.notEqual(cambioClave.cookie, login.cookie)
  assert.equal((await pedir('/auth/me', { cookie: login.cookie })).status, 401)
  login.cookie = cambioClave.cookie
  assert.equal((await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ?', [u.id])).limite_en, limiteInicial.limite_en)
  const enrolar = await pedir('/auth/mfa/enrolar', { method: 'POST', cookie: login.cookie, body: {} })
  assert.equal(enrolar.status, 200)
  assert.match(enrolar.datos.qr, /^data:image\/png;base64,/)
  assert.equal((await pedir('/pacientes', { cookie: login.cookie })).status, 403)
  const codigo = OTPAuth.TOTP.generate({ secret: enrolar.datos.secreto })
  const activar = await pedir('/auth/mfa/activar', { method: 'POST', cookie: login.cookie, body: { codigo } })
  assert.equal(activar.status, 200, JSON.stringify(activar.datos))
  assert.equal(activar.datos.codigos_recuperacion.length, 8)
  const fila = await una(pool, 'SELECT * FROM usuarios WHERE id = ?', [u.id])
  assert.ok(!fila.mfa_secret.includes(enrolar.datos.secreto))
  assert.ok(!JSON.stringify(fila.mfa_recuperacion).includes(activar.datos.codigos_recuperacion[0]))
  assert.equal((await pedir('/pacientes', { cookie: activar.cookie })).status, 200)
  u.password = nueva
  const desafio = await pedir('/auth/login', { method: 'POST', body: { email: u.email, password: nueva } })
  assert.equal((await pedir('/auth/mfa/verificar', { method: 'POST', cookie: desafio.cookie, body: { codigo } })).status, 401)
  const backup = activar.datos.codigos_recuperacion[0]
  assert.equal((await pedir('/auth/mfa/verificar', { method: 'POST', cookie: desafio.cookie, body: { codigo: backup } })).status, 200)
  const otro = await pedir('/auth/login', { method: 'POST', body: { email: u.email, password: nueva } })
  assert.equal((await pedir('/auth/mfa/verificar', { method: 'POST', cookie: otro.cookie, body: { codigo: backup } })).status, 401)
})

test('consulta y registro no pueden administrar, importar, exportar ni eliminar por API', async () => {
  for (const rol of ['consulta', 'registrador']) {
    const u = await usuario(rol); const sesion = await entrar(u)
    for (const ruta of ['/admin/usuarios', '/exportacion/pacientes', '/indicadores/exportar?desde=2020-01-01&hasta=2030-01-01', '/indicadores/adultos/exportar?desde=2020-01-01&hasta=2030-01-01']) {
      assert.equal((await pedir(ruta, { cookie: sesion.cookie })).status, 403, `${rol} ${ruta}`)
    }
    for (const ruta of ['/importaciones/lotes', '/pacientes/falso/eliminado', '/pacientes-adultos/falso/eliminado']) {
      assert.equal((await pedir(ruta, { method: ruta.includes('importaciones') ? 'POST' : 'PUT', cookie: sesion.cookie, body: { eliminado: true } })).status, 403)
    }
    const guardar = await pedir('/pacientes', { method: 'POST', cookie: sesion.cookie, body: {} })
    assert.equal(guardar.status, rol === 'consulta' ? 403 : 400)
    assert.equal((await pedir('/pacientes', { cookie: sesion.cookie })).status, 200)
  }
})

test('administración exige reautenticación reciente y conserva un último administrador ante concurrencia', async () => {
  // El administrador inicial se desactiva solo en esta base temporal.
  const a = await usuario('administrador'), b = await usuario('administrador')
  const sa = await entrar(a), sb = await entrar(b)
  await pool.query('UPDATE sesiones SET mfa_verificada_en = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 11 MINUTE) WHERE usuario_id = ?', [a.id])
  assert.equal((await pedir('/admin/usuarios', { method: 'POST', cookie: sa.cookie, body: {} })).status, 403)
  await pool.query('UPDATE sesiones SET mfa_verificada_en = UTC_TIMESTAMP() WHERE usuario_id = ?', [a.id])
  await pool.query("UPDATE usuarios SET activo = false WHERE rol = 'administrador' AND id NOT IN (?, ?)", [a.id, b.id])
  const resultados = await Promise.all([
    pedir(`/admin/usuarios/${a.id}`, { method: 'PATCH', cookie: sb.cookie, body: { rol: 'consulta' } }),
    pedir(`/admin/usuarios/${b.id}`, { method: 'PATCH', cookie: sa.cookie, body: { rol: 'consulta' } }),
  ])
  assert.deepEqual(resultados.map((r) => r.status).sort(), [200, 422])
  const [{ n }] = (await pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'administrador' AND activo = true"))[0]
  assert.equal(n, 1)
  await pool.query('UPDATE usuarios SET activo = true WHERE email = ?', [process.env.INITIAL_ADMIN_EMAIL])
})

test('logout y cambio de rol revocan cookies; los vencimientos se hacen cumplir en MySQL', async () => {
  const u = await usuario(), s = await entrar(u)
  await pool.query('UPDATE sesiones SET expira_en = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE usuario_id = ?', [u.id])
  assert.equal((await pedir('/auth/me', { cookie: s.cookie })).status, 401)
  const t = await entrar(u)
  await pool.query('UPDATE sesiones SET limite_en = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE usuario_id = ?', [u.id])
  assert.equal((await pedir('/auth/me', { cookie: t.cookie })).status, 401)
  const v = await entrar(u)
  assert.equal((await pedir('/auth/logout', { method: 'POST', cookie: v.cookie, body: {} })).status, 204)
  assert.equal((await pedir('/auth/me', { cookie: v.cookie })).status, 401)
  const admin = await usuario('administrador'), sa = await entrar(admin), valida = await entrar(u)
  assert.equal((await pedir(`/admin/usuarios/${u.id}`, { method: 'PATCH', cookie: sa.cookie, body: { rol: 'registrador' } })).status, 200)
  assert.equal((await pedir('/auth/me', { cookie: valida.cookie })).status, 401)
})

test('limita por cuenta en almacenamiento persistente y registra accesos sin contraseñas ni datos clínicos', async () => {
  const u = await usuario()
  const clave = claveIntentos('login', u.email)
  await pool.query('INSERT INTO intentos_auth (clave, intentos) VALUES (?, 10)', [clave])
  assert.equal((await pedir('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } })).status, 429)
  const [eventos] = await pool.query('SELECT * FROM eventos_seguridad')
  assert.ok(eventos.some((e) => e.evento === 'permiso_denegado'))
  assert.ok(eventos.some((e) => e.evento === 'acceso_autorizado'))
  assert.ok(!JSON.stringify(eventos).includes(u.password))
})

test('el esquema actualizado es repetible sin cambiar roles o MFA ya configurados', async () => {
  const { inicializarBase } = await import('../schema.mjs')
  const { config } = await import('../config.mjs')
  const antes = await una(pool, 'SELECT rol, mfa_secret FROM usuarios WHERE email = ?', [config.admin.email])
  await inicializarBase(pool, config.admin)
  const despues = await una(pool, 'SELECT rol, mfa_secret FROM usuarios WHERE email = ?', [config.admin.email])
  assert.deepEqual(despues, antes)
})

test('cambiar de autenticador exige contraseña y segundo factor, revoca otras sesiones y bloquea datos hasta reinscribir', async () => {
  const u = await usuario(), propia = await entrar(u), otra = await entrar(u)
  const cambio = await pedir('/auth/mfa/reiniciar', { method: 'POST', cookie: propia.cookie, body: { password: u.password, codigo: u.codigos.shift() } })
  assert.equal(cambio.status, 200, JSON.stringify(cambio.datos))
  assert.notEqual(cambio.cookie, propia.cookie)
  assert.equal((await pedir('/auth/me', { cookie: propia.cookie })).status, 401)
  propia.cookie = cambio.cookie
  assert.equal((await pedir('/auth/me', { cookie: otra.cookie })).status, 401)
  assert.equal((await pedir('/pacientes', { cookie: propia.cookie })).status, 403)
  const estado = await pedir('/auth/me', { cookie: propia.cookie })
  assert.equal(estado.datos.paso, 'inscripcion_mfa')
  const enrolar = await pedir('/auth/mfa/enrolar', { method: 'POST', cookie: propia.cookie, body: {} })
  assert.equal(enrolar.status, 200)
  assert.notEqual(enrolar.datos.secreto, u.secreto)
})

test('la cuenta de aplicación no puede alterar tablas ni modificar o borrar auditoría', async () => {
  const mysql = (await import('mysql2/promise')).default
  const { concederPrivilegiosAplicacion, verificarPrivilegiosAplicacion } = await import('../privilegios-db.mjs')
  const administrador = await pool.getConnection()
  const nombre = `test_${randomBytes(5).toString('hex')}`, clave = randomBytes(24).toString('hex')
  let limitada
  try {
    await administrador.query('CREATE USER ?@? IDENTIFIED BY ?', [nombre, '%', clave])
    await concederPrivilegiosAplicacion(administrador, process.env.DB_NAME, nombre)
    limitada = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: nombre, password: clave, database: process.env.DB_NAME })
    await verificarPrivilegiosAplicacion(limitada)
    await limitada.query('SELECT id FROM usuarios LIMIT 1')
    await assert.rejects(limitada.query('CREATE TABLE intento_escalar (id INT)'), (e) => e.code === 'ER_TABLEACCESS_DENIED_ERROR')
    await assert.rejects(limitada.query('UPDATE eventos_seguridad SET evento = evento WHERE 1 = 0'), (e) => e.code === 'ER_TABLEACCESS_DENIED_ERROR')
    await assert.rejects(limitada.query('DELETE FROM auditoria WHERE 1 = 0'), (e) => e.code === 'ER_TABLEACCESS_DENIED_ERROR')
    await assert.rejects(verificarPrivilegiosAplicacion(administrador))
  } finally {
    await limitada?.end()
    await administrador.query('DROP USER IF EXISTS ?@?', [nombre, '%'])
    administrador.release()
  }
})

test('las variantes de mayúsculas y barra final conservan permisos de exportación y eliminación', async () => {
  const u = await usuario('registrador'), s = await entrar(u)
  for (const ruta of ['/indicadores/EXPORTAR', '/indicadores/exportar/', '/INDICADORES/ADULTOS/EXPORTAR/']) {
    assert.equal((await pedir(ruta + '?desde=2020-01-01&hasta=2030-01-01', { cookie: s.cookie })).status, 403, ruta)
    assert.equal((await pedir(ruta + '?desde=2020-01-01&hasta=2030-01-01', { method: 'HEAD', cookie: s.cookie })).status, 403, `HEAD ${ruta}`)
  }
  for (const ruta of ['/pacientes/falso/ELIMINADO', '/pacientes/falso/eliminado/', '/PACIENTES-ADULTOS/falso/ELIMINADO/']) {
    assert.equal((await pedir(ruta, { method: 'PUT', cookie: s.cookie, body: { eliminado: true } })).status, 403, ruta)
  }
})

test('las variantes de rutas sensibles también exigen reautenticación al administrador', async () => {
  const u = await usuario('administrador'), s = await entrar(u)
  await pool.query('UPDATE sesiones SET mfa_verificada_en = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 11 MINUTE) WHERE usuario_id = ?', [u.id])
  for (const ruta of ['/indicadores/EXPORTAR/', '/indicadores/ADULTOS/EXPORTAR/']) {
    const r = await pedir(ruta + '?desde=2020-01-01&hasta=2030-01-01', { cookie: s.cookie })
    assert.equal(r.status, 403)
    assert.equal(r.datos.error.codigo, 'REAUTENTICACION_REQUERIDA')
  }
  for (const ruta of ['/pacientes/falso/ELIMINADO/', '/pacientes-adultos/falso/ELIMINADO/']) {
    const r = await pedir(ruta, { method: 'PUT', cookie: s.cookie, body: { eliminado: true } })
    assert.equal(r.status, 403)
    assert.equal(r.datos.error.codigo, 'REAUTENTICACION_REQUERIDA')
  }
})

test('reautenticarse rota la cookie y conserva el vencimiento absoluto original', async () => {
  const u = await usuario(), s = await entrar(u)
  await pool.query('UPDATE sesiones SET limite_en = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 MINUTE) WHERE usuario_id = ?', [u.id])
  const antes = await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ?', [u.id])
  const r = await pedir('/auth/reauth', { method: 'POST', cookie: s.cookie, body: { password: u.password, codigo: OTPAuth.TOTP.generate({ secret: u.secreto }) } })
  assert.equal(r.status, 200)
  assert.notEqual(r.cookie, s.cookie)
  const despues = await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ?', [u.id])
  assert.equal(despues.limite_en, antes.limite_en)
})

test('cambiar la contraseña revoca también la cookie actual y conserva el límite absoluto', async () => {
  const u = await usuario(), s = await entrar(u), otra = await entrar(u)
  const antes = await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ? ORDER BY limite_en LIMIT 1', [u.id])
  const r = await pedir('/auth/clave', { method: 'POST', cookie: s.cookie, body: { password_actual: u.password,
    password_nueva: 'OtraClaveSegura456', codigo: OTPAuth.TOTP.generate({ secret: u.secreto }) } })
  assert.equal(r.status, 200, JSON.stringify(r.datos))
  assert.ok(r.cookie && r.cookie !== s.cookie)
  assert.equal((await pedir('/auth/me', { cookie: s.cookie })).status, 401)
  assert.equal((await pedir('/auth/me', { cookie: otra.cookie })).status, 401)
  assert.equal((await pedir('/auth/me', { cookie: r.cookie })).datos.paso, 'completo')
  const despues = await una(pool, 'SELECT limite_en FROM sesiones WHERE usuario_id = ?', [u.id])
  assert.equal(despues.limite_en, antes.limite_en)
})

test('una contraseña cambiada durante bcrypt no permite crear una sesión con la credencial anterior', async () => {
  const u = await usuario(), bloqueo = await pool.getConnection()
  let pendiente
  try {
    await bloqueo.beginTransaction()
    await bloqueo.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [u.id])
    pendiente = pedir('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } })
    let verificada = false
    for (let i = 0; i < 200; i++) {
      const evento = await una(pool, "SELECT id FROM eventos_seguridad WHERE usuario_id = ? AND evento = 'password_verificada' LIMIT 1", [u.id])
      if (evento) { verificada = true; break }
      await new Promise((r) => setTimeout(r, 10))
    }
    assert.ok(verificada, 'La petición debe haber verificado el hash antiguo antes del cambio.')
    await bloqueo.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('CambioConcurrente456', 4), u.id])
    await bloqueo.commit()
    assert.equal((await pendiente).status, 401)
    assert.equal((await una(pool, 'SELECT COUNT(*) AS n FROM sesiones WHERE usuario_id = ?', [u.id])).n, 0)
  } finally { await bloqueo.rollback(); bloqueo.release(); await pendiente }
})

test('la colación de MySQL no admite alias con tildes para evadir el contador de la cuenta', async () => {
  const u = await usuario()
  const alias = u.email.replace('@example.test', '@éxample.test')
  // Comprueba que el caso de prueba sí coincide en la colación heredada.
  assert.ok(await una(pool, 'SELECT id FROM usuarios WHERE email = ?', [alias]))
  const r = await pedir('/auth/login', { method: 'POST', body: { email: alias, password: u.password } })
  assert.equal(r.status, 401)
  assert.equal(r.datos.error.codigo, 'CREDENCIALES_INVALIDAS')
})

test('revocar una sesión durante un cambio de clave impide el cambio y revierte sus escrituras', async () => {
  const u = await usuario(), s = await entrar(u), bloqueo = await pool.getConnection()
  const antes = await una(pool, 'SELECT password_hash FROM usuarios WHERE id = ?', [u.id])
  let pendiente
  try {
    await bloqueo.beginTransaction()
    await bloqueo.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [u.id])
    pendiente = pedir('/auth/clave', { method: 'POST', cookie: s.cookie, body: { password_actual: u.password,
      password_nueva: 'ClaveQueNoDebeGuardarse789', codigo: OTPAuth.TOTP.generate({ secret: u.secreto }) } })
    let identificada = false
    for (let i = 0; i < 200; i++) {
      if (await una(pool, 'SELECT intentos FROM intentos_auth WHERE clave = ?', [claveIntentos('cambio_clave', u.id)])) { identificada = true; break }
      await new Promise((r) => setTimeout(r, 10))
    }
    assert.ok(identificada)
    await bloqueo.query('DELETE FROM sesiones WHERE usuario_id = ?', [u.id])
    await bloqueo.commit()
    assert.equal((await pendiente).status, 401)
    assert.equal((await una(pool, 'SELECT password_hash FROM usuarios WHERE id = ?', [u.id])).password_hash, antes.password_hash)
  } finally { await bloqueo.rollback(); bloqueo.release(); await pendiente }
})

test('regenerar recuperación rota la sesión, invalida códigos antiguos y permite usar los nuevos', async () => {
  const u = await usuario(), s = await entrar(u)
  const anterior = u.codigos[0]
  const nuevos = await pedir('/auth/mfa/recuperacion', { method: 'POST', cookie: s.cookie, body: { password: u.password, codigo: OTPAuth.TOTP.generate({ secret: u.secreto }) } })
  assert.equal(nuevos.status, 200)
  assert.ok(nuevos.cookie && nuevos.cookie !== s.cookie)
  assert.equal(nuevos.datos.codigos_recuperacion.length, 8)
  assert.equal((await pedir('/auth/me', { cookie: s.cookie })).status, 401)
  assert.equal((await pedir('/auth/me', { cookie: nuevos.cookie })).status, 200)
  const login = await pedir('/auth/login', { method: 'POST', body: { email: u.email, password: u.password } })
  assert.equal(login.status, 200)
  assert.equal((await pedir('/auth/mfa/verificar', { method: 'POST', cookie: login.cookie, body: { codigo: anterior } })).status, 401)
  assert.equal((await pedir('/auth/mfa/verificar', { method: 'POST', cookie: login.cookie, body: { codigo: nuevos.datos.codigos_recuperacion[0] } })).status, 200)
})
