import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { config } from './config.mjs'
import { aBooleanos, pool, una } from './db.mjs'
import { ErrorApi, asincrono, noAutenticado, sinPermiso, validacion } from './errores.mjs'

const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente', 12)

/** Política de contraseñas: devuelve un mensaje si no cumple, o null si es válida. */
export function validarClave(clave) {
  if (typeof clave !== 'string' || clave.length < 10) return 'La contraseña debe tener al menos 10 caracteres.'
  if (clave.length > 72) return 'La contraseña no puede superar 72 caracteres.'
  if (!/[a-z]/.test(clave) || !/[A-Z]/.test(clave) || !/\d/.test(clave)) {
    return 'La contraseña debe incluir mayúsculas, minúsculas y números.'
  }
  return null
}

const firmarToken = (usuario) =>
  jwt.sign({ sub: usuario.id, rol: usuario.rol }, config.jwtSecret, { expiresIn: `${config.minutosSesion}m` })

const perfilPublico = (fila) => aBooleanos({
  id: fila.id, email: fila.email, nombre_completo: fila.nombre_completo, rol: fila.rol, activo: fila.activo,
}, ['activo'])

/** Exige un JWT válido y un usuario activo; siempre relee el usuario para respetar cambios de rol/estado. */
export const autenticar = asincrono(async (req, res, next) => {
  const cabecera = req.headers.authorization ?? ''
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null
  if (!token) throw noAutenticado()

  let carga
  try {
    carga = jwt.verify(token, config.jwtSecret)
  } catch {
    throw noAutenticado()
  }

  const usuario = await una(pool, 'SELECT id, email, nombre_completo, rol, activo FROM usuarios WHERE id = ?', [carga.sub])
  if (!usuario || !usuario.activo) throw noAutenticado()
  req.usuario = perfilPublico(usuario)

  // Sesión deslizante: si el token tiene más de 5 minutos se entrega uno nuevo. Sin actividad, expira.
  if (Date.now() / 1000 - carga.iat > 300) res.setHeader('X-Token-Renovado', firmarToken(usuario))
  next()
})

export const requiereRol = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.usuario.rol)) return next(sinPermiso())
  next()
}

export const puedeEscribir = requiereRol('administrador', 'registrador')

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos de inicio de sesión. Espere 15 minutos.' } }),
})

export const rutasAuth = Router()

rutasAuth.post('/login', limitadorLogin, asincrono(async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw validacion('Ingrese correo y contraseña.')
  }
  const usuario = await una(pool, 'SELECT * FROM usuarios WHERE email = ?', [email.trim().toLowerCase()])
  const coincide = await bcrypt.compare(password, usuario?.password_hash ?? HASH_FALSO)
  if (!usuario || !coincide) {
    throw new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.')
  }
  if (!usuario.activo) throw new ErrorApi(403, 'USUARIO_INACTIVO', 'Su usuario está desactivado. Contacte a un Administrador.')
  res.json({ token: firmarToken(usuario), perfil: perfilPublico(usuario) })
}))

rutasAuth.get('/me', autenticar, (req, res) => res.json(req.usuario))
