import { ErrorApi, asincrono } from './errores.mjs'
import { registrarEvento } from './auditoria-seguridad.mjs'

export const ROLES = ['administrador', 'registrador', 'consulta']

export const exigirRoles = (...roles) => asincrono(async (req, _res, next) => {
  if (!roles.includes(req.usuario?.rol)) {
    await registrarEvento(req, 'permiso_denegado', { metodo: req.method })
    throw new ErrorApi(403, 'SIN_PERMISO', 'Su cuenta no tiene permiso para esta operación.')
  }
  next()
})

export function permisosClinicos(req, res, next) {
  if (['GET', 'HEAD'].includes(req.method)) return next()
  // Los permisos específicos de operaciones sensibles se aplican en su propia ruta.
  return exigirRoles('administrador', 'registrador')(req, res, next)
}

export function exigirReautenticacion(req, _res, next) {
  if (!req.reautenticacionReciente) return next(new ErrorApi(403, 'REAUTENTICACION_REQUERIDA',
    'Confirme su contraseña y doble factor en Seguridad de mi cuenta antes de continuar.'))
  next()
}
