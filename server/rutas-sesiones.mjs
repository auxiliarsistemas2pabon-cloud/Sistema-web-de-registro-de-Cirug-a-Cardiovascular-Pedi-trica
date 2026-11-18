import { Router } from 'express'
import { autenticar } from './auth.mjs'
import { exigirReautenticacion } from './permisos.mjs'
import { conTransaccion, pool, una, isoUtc } from './db.mjs'
import { ErrorApi, asincrono, noAutenticado, noEncontrado, validacion } from './errores.mjs'
import { registrarEvento } from './auditoria-seguridad.mjs'
import { rotarSesion } from './sesiones.mjs'

export const rutasSesiones = Router()
rutasSesiones.use(autenticar)
rutasSesiones.get('/', asincrono(async (req, res) => {
  const [filas] = await pool.query(`SELECT sesion_id AS id, dispositivo, creado_en, actividad_en, expira_en, limite_en,
    mfa_verificada, (token_hash = ?) AS actual FROM sesiones
    WHERE usuario_id = ? AND sesion_id IS NOT NULL AND expira_en > UTC_TIMESTAMP() AND limite_en > UTC_TIMESTAMP()
    ORDER BY actual DESC, actividad_en DESC LIMIT 100`, [req.sesionHash, req.usuario.id])
  await registrarEvento(req, 'sesiones_consultadas')
  res.json(filas.map((s) => ({ id:s.id, dispositivo:s.dispositivo, actual:Boolean(s.actual), verificada:Boolean(s.mfa_verificada),
    creado_en:isoUtc(s.creado_en), actividad_en:isoUtc(s.actividad_en), expira_en:isoUtc(s.expira_en), limite_en:isoUtc(s.limite_en) })))
}))

async function cerrar(req, res, otras) {
  if (!otras && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.id)) throw validacion('Sesión no válida.')
  let establecerCookie, cerradas
  await conTransaccion(async (c) => {
    // Mismo orden de bloqueos que MFA y cambios de cuenta: usuario, después sesión.
    const u = await una(c, 'SELECT activo FROM usuarios WHERE id = ? FOR UPDATE', [req.usuario.id])
    const actual = await una(c, `SELECT sesion_id, (mfa_verificada_en > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)) AS reciente FROM sesiones WHERE token_hash = ? AND usuario_id = ?
      AND mfa_verificada = true AND expira_en > UTC_TIMESTAMP() AND limite_en > UTC_TIMESTAMP() FOR UPDATE`, [req.sesionHash, req.usuario.id])
    if (!u?.activo || !actual) throw noAutenticado()
    if (!actual.reciente) throw new ErrorApi(403, 'REAUTENTICACION_REQUERIDA', 'Confirme su contraseña y doble factor antes de cerrar otras sesiones.')
    if (!otras && actual.sesion_id === req.params.id) throw validacion('Use Cerrar sesión para salir de este equipo.')
    const [r] = await c.query(`DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?${otras ? '' : ' AND sesion_id = ?'}`,
      otras ? [req.usuario.id, req.sesionHash] : [req.usuario.id, req.sesionHash, req.params.id])
    if (!otras && !r.affectedRows) throw noEncontrado('No se encontró la sesión.')
    cerradas = r.affectedRows
    establecerCookie = await rotarSesion(c, req, res)
    await registrarEvento(req, otras ? 'otras_sesiones_revocadas' : 'sesion_revocada', { cantidad:cerradas }, c)
  })
  establecerCookie()
  res.json({ cerradas })
}
rutasSesiones.post('/cerrar-otras', exigirReautenticacion, asincrono((req, res) => cerrar(req, res, true)))
rutasSesiones.post('/:id/revocar', exigirReautenticacion, asincrono((req, res) => cerrar(req, res, false)))
