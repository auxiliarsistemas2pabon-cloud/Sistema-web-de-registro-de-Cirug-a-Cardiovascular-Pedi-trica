import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { aBooleanos, conTransaccion, pool, una } from './db.mjs'
import { ErrorApi, asincrono, noAutenticado, validacion } from './errores.mjs'
import { completarSesion, crearSesion, leerSesion, revocarSesion, rotarSesion } from './sesiones.mjs'
import { cifrarSecreto, codigoMfaInvalido, comprobarTotp, consumirRecuperacion, crearRecuperacion, nuevoTotp } from './mfa.mjs'
import { limpiarIntentos, limitarCuenta } from './limites-auth.mjs'
import { registrarEvento } from './auditoria-seguridad.mjs'

const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente', 12)

export function validarClave(clave) {
  if (typeof clave !== 'string' || clave.length < 12) return 'La contraseña debe tener al menos 12 caracteres.'
  if (Buffer.byteLength(clave, 'utf8') > 72) return 'La contraseña no puede superar 72 bytes UTF-8.'
  if (!/[a-z]/.test(clave) || !/[A-Z]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe incluir mayúsculas, minúsculas y números.'
  return null
}

export const perfilPublico = (fila) => aBooleanos({
  id: fila.id, email: fila.email, nombre_completo: fila.nombre_completo, activo: fila.activo,
  rol: fila.rol, clave_temporal: fila.clave_temporal, mfa_activo: fila.mfa_activo ?? Boolean(fila.mfa_secret),
}, ['activo', 'clave_temporal', 'mfa_activo'])

function paso(usuario) {
  if (usuario.clave_temporal) return 'clave'
  if (!(usuario.mfa_activo ?? usuario.mfa_secret)) return 'inscripcion_mfa'
  return usuario.mfa_verificada ? 'completo' : 'mfa'
}

export const identificar = asincrono(async (req, _res, next) => {
  const usuario = await leerSesion(req)
  if (!usuario) throw noAutenticado()
  req.usuario = perfilPublico(usuario)
  req.pasoAuth = paso(usuario)
  req.reautenticacionReciente = Boolean(usuario.reautenticacion_reciente)
  next()
})

export const autenticar = [identificar, (req, _res, next) => {
  if (req.pasoAuth !== 'completo') return next(new ErrorApi(403, 'AUTENTICACION_INCOMPLETA', 'Complete el cambio de contraseña y la verificación de doble factor.'))
  next()
}]

const limitadorLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espere 15 minutos.' } }),
})
export const rutasAuth = Router()

rutasAuth.post('/login', limitadorLogin, asincrono(async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password
    || email.length > 255 || Buffer.byteLength(password, 'utf8') > 72) throw validacion('Ingrese correo y contraseña válidos.')
  const correo = email.trim().toLowerCase()
  await limitarCuenta('login', correo)
  // La comparación exacta impide usar variantes con tildes de una colación insensible a acentos
  // para autenticar la misma cuenta con distintos contadores de intentos.
  const usuario = await una(pool, 'SELECT * FROM usuarios WHERE email = ? AND BINARY email = BINARY ?', [correo, correo])
  const coincide = await bcrypt.compare(password, usuario?.password_hash ?? HASH_FALSO)
  if (!usuario || !coincide || !usuario.activo) {
    await registrarEvento(req, 'login_fallido')
    throw new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.')
  }
  await registrarEvento(req, 'password_verificada', {}, pool, usuario.id)
  await crearSesion(req, res, usuario)
  res.json({ perfil: perfilPublico(usuario), paso: paso({ ...usuario, mfa_verificada: false }) })
}))

rutasAuth.get('/me', identificar, (req, res) => res.json({ perfil: req.usuario, paso: req.pasoAuth }))
rutasAuth.post('/logout', asincrono(async (req, res) => {
  const usuario = await leerSesion(req)
  if (usuario) await registrarEvento(req, 'logout', {}, pool, usuario.id)
  await revocarSesion(req, res)
  res.status(204).end()
}))

rutasAuth.post('/clave', identificar, asincrono(async (req, res) => {
  await limitarCuenta('cambio_clave', req.usuario.id)
  const { password_actual: actual, password_nueva: nueva, codigo } = req.body ?? {}
  const problema = validarClave(nueva)
  if (problema) throw validacion(problema)
  if (typeof actual !== 'string' || Buffer.byteLength(actual) > 72) throw validacion('Ingrese la contraseña actual.')
  const nuevaHash = await bcrypt.hash(nueva, 12)
  let establecerCookie
  await conTransaccion(async (conexion) => {
    const usuario = await una(conexion, 'SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    if (!usuario?.activo || !await bcrypt.compare(actual, usuario.password_hash)) throw validacion('Contraseña actual incorrecta.')
    if (await bcrypt.compare(nueva, usuario.password_hash)) throw validacion('La nueva contraseña debe ser diferente de la actual.')
    if (usuario.mfa_secret) {
      const numeroPaso = comprobarTotp(usuario.mfa_secret, codigo, usuario.mfa_ultimo_paso)
      if (numeroPaso === null) throw codigoMfaInvalido()
      await conexion.query('UPDATE usuarios SET mfa_ultimo_paso = ? WHERE id = ?', [numeroPaso, usuario.id])
    }
    await conexion.query('UPDATE usuarios SET password_hash = ?, clave_temporal = false WHERE id = ?', [nuevaHash, usuario.id])
    await conexion.query('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', [usuario.id, req.sesionHash])
    establecerCookie = await rotarSesion(conexion, req, res)
    await registrarEvento(req, 'clave_cambiada', {}, conexion)
  })
  establecerCookie()
  res.json({ ok: true })
}))

rutasAuth.post('/mfa/enrolar', identificar, asincrono(async (req, res) => {
  if (req.pasoAuth !== 'inscripcion_mfa') throw new ErrorApi(403, 'MFA_ESTADO', 'No se puede iniciar la inscripción en este momento.')
  await limitarCuenta('enrolar', req.usuario.id)
  const totp = nuevoTotp(req.usuario.email)
  const [resultado] = await pool.query('UPDATE sesiones SET mfa_pendiente = ? WHERE token_hash = ? AND mfa_verificada = false',
    [cifrarSecreto(totp.secret.base32), req.sesionHash])
  if (!resultado.affectedRows) throw noAutenticado()
  res.json({ secreto: totp.secret.base32, qr: await QRCode.toDataURL(totp.toString(), { width: 240, margin: 2 }) })
}))

rutasAuth.post('/mfa/activar', identificar, asincrono(async (req, res) => {
  if (req.pasoAuth !== 'inscripcion_mfa') throw new ErrorApi(403, 'MFA_ESTADO', 'La cuenta no está pendiente de inscripción.')
  await limitarCuenta('mfa', req.usuario.id)
  const recuperacion = crearRecuperacion()
  let establecerCookie
  await conTransaccion(async (conexion) => {
    const usuario = await una(conexion, 'SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    const sesion = await una(conexion, 'SELECT mfa_pendiente FROM sesiones WHERE token_hash = ? FOR UPDATE', [req.sesionHash])
    if (!usuario?.activo || usuario.mfa_secret || usuario.clave_temporal || !sesion?.mfa_pendiente) throw noAutenticado()
    const numeroPaso = comprobarTotp(sesion.mfa_pendiente, req.body?.codigo)
    if (numeroPaso === null) throw codigoMfaInvalido()
    await conexion.query('UPDATE usuarios SET mfa_secret = ?, mfa_recuperacion = ?, mfa_ultimo_paso = ? WHERE id = ?',
      [sesion.mfa_pendiente, JSON.stringify(recuperacion.hashes), numeroPaso, usuario.id])
    await conexion.query('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', [usuario.id, req.sesionHash])
    establecerCookie = await completarSesion(conexion, req, res)
    await registrarEvento(req, 'mfa_activado', {}, conexion)
  })
  establecerCookie()
  await limpiarIntentos(req.usuario.email, req.usuario.id)
  res.json({ codigos_recuperacion: recuperacion.codigos })
}))

async function verificarSegundoFactor(req, res, reautenticacion = false) {
  await limitarCuenta('mfa', req.usuario.id)
  let establecerCookie
  let invalido = false
  await conTransaccion(async (conexion) => {
    const usuario = await una(conexion, 'SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    if (!usuario?.activo || !usuario.mfa_secret || usuario.clave_temporal) throw noAutenticado()
    if (reautenticacion && (typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 72
      || !await bcrypt.compare(req.body.password, usuario.password_hash))) {
      invalido = true
      return
    }
    const numeroPaso = comprobarTotp(usuario.mfa_secret, req.body?.codigo, usuario.mfa_ultimo_paso)
    const restantes = numeroPaso === null && !reautenticacion ? consumirRecuperacion(usuario.mfa_recuperacion, req.body?.codigo) : null
    if (numeroPaso === null && restantes === null) { invalido = true; return }
    if (numeroPaso !== null) await conexion.query('UPDATE usuarios SET mfa_ultimo_paso = ? WHERE id = ?', [numeroPaso, usuario.id])
    else await conexion.query('UPDATE usuarios SET mfa_recuperacion = ? WHERE id = ?', [JSON.stringify(restantes), usuario.id])
    establecerCookie = await completarSesion(conexion, req, res)
    await registrarEvento(req, restantes !== null ? 'mfa_recuperacion_usada' : reautenticacion ? 'reautenticacion' : 'login_exitoso', {}, conexion)
  })
  if (invalido) {
    throw codigoMfaInvalido()
  }
  establecerCookie()
  await limpiarIntentos(req.usuario.email, req.usuario.id)
  res.json({ ok: true })
}

rutasAuth.post('/mfa/verificar', identificar, asincrono(async (req, res) => {
  if (req.pasoAuth !== 'mfa') throw new ErrorApi(403, 'MFA_ESTADO', 'No hay una verificación pendiente.')
  await verificarSegundoFactor(req, res)
}))
rutasAuth.post('/reauth', autenticar, asincrono(async (req, res) => verificarSegundoFactor(req, res, true)))

rutasAuth.post('/mfa/recuperacion', autenticar, asincrono(async (req, res) => {
  await limitarCuenta('mfa', req.usuario.id)
  const recuperacion = crearRecuperacion()
  let establecerCookie
  await conTransaccion(async (conexion) => {
    const usuario = await una(conexion, 'SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    const codigo = req.body?.codigo
    const numeroPaso = usuario?.activo && usuario.mfa_secret ? comprobarTotp(usuario.mfa_secret, codigo, usuario.mfa_ultimo_paso) : null
    if (numeroPaso === null || typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 72
      || !await bcrypt.compare(req.body.password, usuario.password_hash)) throw codigoMfaInvalido()
    await conexion.query('UPDATE usuarios SET mfa_recuperacion = ?, mfa_ultimo_paso = ? WHERE id = ?',
      [JSON.stringify(recuperacion.hashes), numeroPaso, usuario.id])
    await conexion.query('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', [usuario.id, req.sesionHash])
    establecerCookie = await rotarSesion(conexion, req, res)
    await registrarEvento(req, 'recuperacion_regenerada', {}, conexion)
  })
  establecerCookie()
  res.json({ codigos_recuperacion: recuperacion.codigos })
}))

rutasAuth.post('/mfa/reiniciar', autenticar, asincrono(async (req, res) => {
  await limitarCuenta('mfa', req.usuario.id)
  let establecerCookie
  await conTransaccion(async (conexion) => {
    const usuario = await una(conexion, 'SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    const numeroPaso = usuario?.activo && usuario.mfa_secret ? comprobarTotp(usuario.mfa_secret, req.body?.codigo, usuario.mfa_ultimo_paso) : null
    const recuperacion = usuario?.activo ? consumirRecuperacion(usuario.mfa_recuperacion, req.body?.codigo) : null
    if ((numeroPaso === null && recuperacion === null) || typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 72
      || !await bcrypt.compare(req.body.password, usuario.password_hash)) throw codigoMfaInvalido()
    await conexion.query('UPDATE usuarios SET mfa_secret = NULL, mfa_recuperacion = NULL, mfa_ultimo_paso = -1 WHERE id = ?', [usuario.id])
    await conexion.query('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', [usuario.id, req.sesionHash])
    await conexion.query(`UPDATE sesiones SET mfa_verificada = false, mfa_pendiente = NULL, mfa_verificada_en = NULL,
      expira_en = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), limite_en = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) WHERE token_hash = ?`, [req.sesionHash])
    establecerCookie = await rotarSesion(conexion, req, res)
    await registrarEvento(req, 'mfa_reinscripcion', {}, conexion)
  })
  establecerCookie()
  res.json({ ok: true })
}))

rutasAuth.use((error, req, _res, next) => {
  if (error?.codigo !== 'MFA_INVALIDO') return next(error)
  registrarEvento(req, 'mfa_fallido').then(() => next(error), next)
})
