import { validacion } from './errores.mjs'

// Los parámetros se consumen como escalares. No se aceptan duplicados ni objetos ambiguos.
export function validarConsulta(req, _res, next) {
  const entries = Object.entries(req.query)
  if (entries.length > 32 || entries.some(([k,v]) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k) || typeof v !== 'string' || v.length > (k === 'filtros' ? 8000 : 1000))) {
    return next(validacion('Parámetros de consulta no válidos o demasiado extensos.'))
  }
  if (typeof req.query.busqueda === 'string' && (req.query.busqueda.length > 200 || req.query.busqueda.trim().split(/\s+/).length > 12)) {
    return next(validacion('La búsqueda admite hasta 200 caracteres y doce palabras.'))
  }
  next()
}

export function validarObjetoJson(objeto) {
  const pendientes = [{ valor:objeto, nivel:0 }]
  let elementos = 0
  while (pendientes.length) {
    const { valor, nivel } = pendientes.pop()
    if (nivel > 12 || ++elementos > 500_000) throw validacion('El objeto JSON es demasiado complejo.')
    if (valor && typeof valor === 'object') {
      for (const [clave, v] of Object.entries(valor)) {
        if (['__proto__','constructor','prototype'].includes(clave)) throw validacion('El objeto contiene claves no permitidas.')
        pendientes.push({ valor:v, nivel:nivel+1 })
      }
    }
  }
}
export function cuerpoSeguro(req, _res, next) {
  if (req.body === undefined) return next()
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next(validacion('Envíe un objeto JSON.'))
  try { validarObjetoJson(req.body); next() } catch (e) { next(e) }
}
