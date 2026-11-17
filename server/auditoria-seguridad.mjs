import { pool } from './db.mjs'

// Solo se aceptan detalles construidos por el servidor: nunca cuerpos, búsquedas, cookies o contraseñas.
export async function registrarEvento(req, evento, detalles = {}, conexion = pool, usuarioId = req.usuario?.id ?? null) {
  await conexion.query(`INSERT INTO eventos_seguridad (evento, usuario_id, ip, recurso, detalles)
    VALUES (?, ?, ?, ?, ?)`, [evento, usuarioId, req.ip?.slice(0, 64) ?? null,
    (req.baseUrl + req.path).slice(0, 255), JSON.stringify(detalles)])
}

export function auditarAcceso(evento = 'acceso_autorizado') {
  return async (req, _res, next) => {
    try {
      // Se registra antes de entregar datos: un fallo de auditoría impide la entrega.
      await registrarEvento(req, evento, { metodo: req.method })
      next()
    } catch (error) { next(error) }
  }
}
