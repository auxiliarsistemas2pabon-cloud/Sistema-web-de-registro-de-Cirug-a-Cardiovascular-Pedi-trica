import { createHash, randomBytes } from 'node:crypto'
import { config } from './config.mjs'
import { conTransaccion, pool, una } from './db.mjs'
import { noAutenticado } from './errores.mjs'

const cookieSegura = config.produccion || config.httpsLocal
export const nombreCookie = cookieSegura ? '__Host-cardio_session' : 'cardio_session'
const opcionesCookie = { httpOnly: true, secure: cookieSegura, sameSite: 'strict', path: '/' }
export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

function tokenPeticion(req) {
  const valores = (req.headers.cookie ?? '').split(';').map((parte) => parte.trim())
    .filter((parte) => parte.startsWith(`${nombreCookie}=`))
  if (valores.length !== 1) return null
  const token = valores[0].slice(nombreCookie.length + 1)
  return /^[a-f0-9]{64}$/.test(token) ? token : null
}

export async function revocarSesion(req, res) {
  const token = tokenPeticion(req)
  if (token) await pool.query('DELETE FROM sesiones WHERE token_hash = ?', [hashToken(token)])
  res.clearCookie(nombreCookie, opcionesCookie)
}

export async function crearSesion(req, res, credenciales) {
  // Una autenticación nueva nunca reutiliza una sesión aportada por el cliente.
  await revocarSesion(req, res)
  await pool.query('DELETE FROM sesiones WHERE expira_en <= UTC_TIMESTAMP() OR limite_en <= UTC_TIMESTAMP()')
  const token = randomBytes(32).toString('hex')
  await conTransaccion(async (conexion) => {
    // Revalida bajo bloqueo: una desactivación durante bcrypt tampoco deja una sesión recuperable.
    const usuario = await una(conexion, 'SELECT activo, password_hash FROM usuarios WHERE id = ? FOR UPDATE', [credenciales.id])
    if (!usuario?.activo || usuario.password_hash !== credenciales.password_hash) throw noAutenticado()
    await conexion.query(`INSERT INTO sesiones (token_hash, usuario_id, expira_en, limite_en)
      VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))`,
    [hashToken(token), credenciales.id])
  })
  // Cookie de sesión: no se persiste con Max-Age; los dos vencimientos se comprueban en MySQL.
  res.cookie(nombreCookie, token, opcionesCookie)
}

export async function leerSesion(req) {
  const token = tokenPeticion(req)
  if (!token) return null
  const tokenHash = hashToken(token)
  const usuario = await una(pool, `SELECT u.id, u.email, u.nombre_completo, u.activo, u.rol, u.clave_temporal,
    (u.mfa_secret IS NOT NULL) AS mfa_activo, s.mfa_verificada,
    (s.mfa_verificada_en > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)) AS reautenticacion_reciente FROM sesiones s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_en > UTC_TIMESTAMP() AND s.limite_en > UTC_TIMESTAMP() AND u.activo = 1`, [tokenHash])
  if (!usuario) return null
  // El UPDATE condicional impide resucitar una sesión vencida o revocada concurrentemente.
  const [resultado] = await pool.query(`UPDATE sesiones
    SET expira_en = IF(mfa_verificada, LEAST(limite_en, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)), expira_en)
    WHERE token_hash = ? AND expira_en > UTC_TIMESTAMP() AND limite_en > UTC_TIMESTAMP()`,
  [config.minutosSesion, tokenHash])
  if (!resultado.affectedRows) return null
  req.sesionHash = tokenHash
  return usuario
}

export async function rotarSesion(conexion, req, res, completarMfa = false) {
  const token = randomBytes(32).toString('hex')
  // MySQL evalúa las asignaciones de izquierda a derecha: calcula límites ANTES de cambiar el estado MFA.
  // Solo la primera verificación de un desafío abre la sesión completa. Reautenticarse no extiende su máximo.
  const [resultado] = await conexion.query(`UPDATE sesiones SET
    expira_en = LEAST(IF(mfa_verificada OR NOT ?, limite_en, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR)), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)),
    limite_en = IF(mfa_verificada OR NOT ?, limite_en, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR)),
    token_hash = ?, mfa_verificada = IF(?, true, mfa_verificada),
    mfa_pendiente = IF(?, NULL, mfa_pendiente), mfa_verificada_en = IF(?, UTC_TIMESTAMP(), mfa_verificada_en)
    WHERE token_hash = ? AND usuario_id = ? AND expira_en > UTC_TIMESTAMP() AND limite_en > UTC_TIMESTAMP()`,
  [completarMfa, config.horasSesionMaximas, config.minutosSesion, completarMfa, config.horasSesionMaximas,
    hashToken(token), completarMfa, completarMfa, completarMfa, req.sesionHash, req.usuario.id])
  if (!resultado.affectedRows) throw noAutenticado()
  // Se establece después del commit por el llamador.
  return () => res.cookie(nombreCookie, token, opcionesCookie)
}

export const completarSesion = (conexion, req, res) => rotarSesion(conexion, req, res, true)
