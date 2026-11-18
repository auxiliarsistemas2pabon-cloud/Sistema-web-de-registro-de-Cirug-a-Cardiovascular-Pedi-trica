export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, campos) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
    this.campos = campos
  }
}

export const validacion = (mensaje, campos) => new ErrorApi(400, 'VALIDACION', mensaje, campos)
export const noAutenticado = (mensaje = 'Su sesión no es válida o expiró. Inicie sesión de nuevo.') =>
  new ErrorApi(401, 'NO_AUTENTICADO', mensaje)
export const noEncontrado = (mensaje = 'No se encontró el recurso solicitado.') => new ErrorApi(404, 'NO_ENCONTRADO', mensaje)
export const reglaNegocio = (mensaje) => new ErrorApi(422, 'REGLA_NEGOCIO', mensaje)

/** Envuelve un handler async para que cualquier error llegue al manejador central. */
export const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function manejadorErrores(err, _req, res, _next) {
  if (res.headersSent) return _next(err)
  if (err instanceof ErrorApi) {
    return res.status(err.estado).json({ error: { codigo: err.codigo, mensaje: err.message, ...(err.campos ? { campos: err.campos } : {}) } })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'VALIDACION', mensaje: 'El cuerpo de la petición no es un JSON válido.' } })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'La petición supera el tamaño permitido.' } })
  }
  if (err?.status === 415) {
    return res.status(415).json({ error: { codigo: 'TIPO_NO_ADMITIDO', mensaje: 'Codificación de petición no admitida.' } })
  }
  if (err?.message === 'Queue limit reached.') {
    return res.status(503).json({ error: { codigo: 'SERVICIO_OCUPADO', mensaje: 'El servicio está ocupado. Intente de nuevo en unos segundos.' } })
  }
  if (err?.code === 'ER_DUP_ENTRY' && /identificacion/.test(err.sqlMessage ?? '')) {
    return res.status(409).json({ error: { codigo: 'IDENTIFICACION_DUPLICADA', mensaje: 'Ya existe un paciente con esa identificación.' } })
  }
  if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: { codigo: 'VALIDACION', mensaje: 'Una de las opciones seleccionadas no existe.' } })
  }
  if (err?.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(422).json({ error: { codigo: 'REGLA_NEGOCIO', mensaje: 'Los datos no cumplen una restricción de integridad.' } })
  }
  // Los errores MySQL pueden incluir SQL con historias clínicas, contraseñas o identificaciones.
  console.error({ evento: 'error_api', tipo: err?.name ?? 'Error' })
  return res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intente de nuevo.' } })
}
