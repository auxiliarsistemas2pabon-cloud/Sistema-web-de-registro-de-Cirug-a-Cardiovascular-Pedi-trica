import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { puedeEscribir, requiereRol, validarClave } from './auth.mjs'
import { aBooleanos, isoUtc, nuevoId, pool, todas, una } from './db.mjs'
import { ErrorApi, asincrono, noEncontrado, reglaNegocio, validacion } from './errores.mjs'
import { Validador, esFechaIso } from './validar.mjs'

const ROLES = ['administrador', 'registrador', 'consulta']

// ---------------------------------------------------------------------------------------------
// Listas desplegables (lectura para todos los roles)
// ---------------------------------------------------------------------------------------------

export const rutasListas = Router()

rutasListas.get('/opciones', asincrono(async (req, res) => {
  const { categoria } = req.query
  const filas = await todas(pool, `
    SELECT o.id, o.categoria_id, c.codigo AS categoria_codigo, o.codigo, o.valor, o.orden, o.activo
    FROM opciones_lista o JOIN categorias_lista c ON c.id = o.categoria_id
    WHERE o.activo = 1 ${typeof categoria === 'string' && categoria ? 'AND c.codigo = ?' : ''}
    ORDER BY c.codigo, o.orden, o.valor`, typeof categoria === 'string' && categoria ? [categoria] : [])
  res.json(filas.map((f) => {
    const { categoria_codigo: categoriaCodigo, ...resto } = aBooleanos(f, ['activo'])
    return typeof categoria === 'string' && categoria ? resto : { ...resto, categoria_codigo: categoriaCodigo }
  }))
}))

/**
 * Crea (o reutiliza, si ya existe) una opción de una lista desde una pantalla que NO es de
 * Administración — hoy el combo de Diagnóstico, cuando se escribe un texto que no está en la
 * lista. A diferencia de `POST /admin/listas/opciones` (solo administrador, pensado para
 * gestionar listas a propósito), esta ruta la puede usar cualquiera que edite la ficha del
 * paciente (Administrador o Registrador): un registro clínico no debe quedar bloqueado
 * esperando que un administrador agregue el término primero. La opción creada queda disponible
 * de inmediato para todos los pacientes, no solo como texto suelto de este.
 */
rutasListas.post('/opciones', puedeEscribir, asincrono(async (req, res) => {
  const v = new Validador(req.body)
  const categoriaCodigo = v.texto('categoria', { obligatorio: true })
  const valor = v.texto('valor', { obligatorio: true, max: 500 })
  v.finalizar()

  const categoria = await una(pool, 'SELECT id FROM categorias_lista WHERE codigo = ?', [categoriaCodigo])
  if (!categoria) throw noEncontrado('No se encontró la lista.')

  // La colación de la tabla ya es insensible a mayúsculas y tildes: "comunicacion" encuentra
  // "Comunicación". No se filtra por activo: si coincide con una opción desactivada, se reactiva
  // en vez de crear un duplicado o dejar seleccionada una opción que ya no aparecería en la lista.
  const existente = await una(pool, 'SELECT id, valor, activo FROM opciones_lista WHERE categoria_id = ? AND valor = ?', [categoria.id, valor])
  if (existente) {
    if (!existente.activo) await pool.query('UPDATE opciones_lista SET activo = 1 WHERE id = ?', [existente.id])
    return res.json({ id: existente.id, valor: existente.valor, creada: false })
  }

  const { maximo } = await una(pool, 'SELECT COALESCE(MAX(orden), 0) AS maximo FROM opciones_lista WHERE categoria_id = ?', [categoria.id])
  const id = nuevoId()
  try {
    await pool.query('INSERT INTO opciones_lista (id, categoria_id, valor, orden) VALUES (?, ?, ?, ?)', [id, categoria.id, valor, maximo + 10])
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      const otra = await una(pool, 'SELECT id, valor FROM opciones_lista WHERE categoria_id = ? AND valor = ?', [categoria.id, valor])
      if (otra) return res.json({ id: otra.id, valor: otra.valor, creada: false })
    }
    throw error
  }
  res.status(201).json({ id, valor, creada: true })
}))

// ---------------------------------------------------------------------------------------------
// Administración (solo administrador)
// ---------------------------------------------------------------------------------------------

export const rutasAdmin = Router()
rutasAdmin.use(requiereRol('administrador'))

const usuarioApi = (f) => aBooleanos({ id: f.id, email: f.email, nombre_completo: f.nombre_completo, rol: f.rol, activo: f.activo }, ['activo'])

rutasAdmin.get('/usuarios', asincrono(async (_req, res) => {
  const filas = await todas(pool, 'SELECT id, email, nombre_completo, rol, activo FROM usuarios ORDER BY nombre_completo')
  res.json(filas.map(usuarioApi))
}))

rutasAdmin.post('/usuarios', asincrono(async (req, res) => {
  const v = new Validador(req.body)
  const email = v.texto('email', { obligatorio: true })?.toLowerCase() ?? null
  const nombre = v.texto('nombre_completo', { obligatorio: true })
  const rol = v.opcion('rol', ROLES, { obligatorio: true })
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) v.error('email', 'Correo no válido.')
  const problema = validarClave(password)
  if (problema) v.error('password', problema)
  v.finalizar()

  const id = nuevoId()
  try {
    await pool.query('INSERT INTO usuarios (id, email, password_hash, nombre_completo, rol) VALUES (?, ?, ?, ?, ?)',
      [id, email, await bcrypt.hash(password, 12), nombre, rol])
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'EMAIL_DUPLICADO', 'Ya existe un usuario con ese correo.')
    throw error
  }
  res.status(201).json({ id })
}))

rutasAdmin.patch('/usuarios/:id', asincrono(async (req, res) => {
  const v = new Validador(req.body)
  const rol = v.opcion('rol', ROLES)
  const tieneActivo = typeof req.body?.activo === 'boolean'
  if (req.body?.activo !== undefined && !tieneActivo) v.error('activo', 'Debe ser verdadero o falso.')
  v.finalizar()

  const usuario = await una(pool, 'SELECT * FROM usuarios WHERE id = ?', [req.params.id])
  if (!usuario) throw noEncontrado('No se encontró el usuario.')

  const seraAdminActivo = (rol ?? usuario.rol) === 'administrador' && (tieneActivo ? req.body.activo : Boolean(usuario.activo))
  if (usuario.rol === 'administrador' && usuario.activo && !seraAdminActivo) {
    const otro = await una(pool, "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'administrador' AND activo = 1 AND id <> ?", [usuario.id])
    if (otro.n === 0) throw reglaNegocio('Debe quedar al menos un Administrador activo.')
  }
  const cambios = []
  const valores = []
  if (rol) { cambios.push('rol = ?'); valores.push(rol) }
  if (tieneActivo) { cambios.push('activo = ?'); valores.push(req.body.activo) }
  if (cambios.length) await pool.query(`UPDATE usuarios SET ${cambios.join(', ')} WHERE id = ?`, [...valores, usuario.id])
  res.json({ id: usuario.id })
}))

rutasAdmin.get('/listas/categorias', asincrono(async (_req, res) => {
  res.json(await todas(pool, 'SELECT id, codigo, nombre FROM categorias_lista ORDER BY nombre'))
}))

rutasAdmin.get('/listas/categorias/:id/opciones', asincrono(async (req, res) => {
  const filas = await todas(pool, 'SELECT id, categoria_id, codigo, valor, orden, activo FROM opciones_lista WHERE categoria_id = ? ORDER BY orden, valor', [req.params.id])
  res.json(filas.map((f) => aBooleanos(f, ['activo'])))
}))

rutasAdmin.post('/listas/opciones', asincrono(async (req, res) => {
  const v = new Validador(req.body)
  const categoriaId = v.id('categoria_id', { obligatorio: true })
  const valor = v.texto('valor', { obligatorio: true, max: 500 })
  const orden = v.entero('orden') ?? 0
  v.finalizar()
  if (req.body?.codigo) throw reglaNegocio('El código de una opción no se puede definir desde la aplicación.')
  if (!(await una(pool, 'SELECT id FROM categorias_lista WHERE id = ?', [categoriaId]))) throw noEncontrado('No se encontró la lista.')
  const id = nuevoId()
  try {
    await pool.query('INSERT INTO opciones_lista (id, categoria_id, valor, orden) VALUES (?, ?, ?, ?)', [id, categoriaId, valor, orden])
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'OPCION_DUPLICADA', 'Ya existe una opción con ese texto en esta lista.')
    throw error
  }
  res.status(201).json({ id })
}))

rutasAdmin.patch('/listas/opciones/:id', asincrono(async (req, res) => {
  if (req.body && 'codigo' in req.body) throw reglaNegocio('El código de una opción de lista no se puede modificar.')
  const v = new Validador(req.body)
  const valor = v.texto('valor', { max: 500 })
  const orden = v.entero('orden')
  const tieneActivo = typeof req.body?.activo === 'boolean'
  v.finalizar()
  const opcion = await una(pool, 'SELECT id FROM opciones_lista WHERE id = ?', [req.params.id])
  if (!opcion) throw noEncontrado('No se encontró la opción.')
  const cambios = []
  const valores = []
  if (valor !== null) { cambios.push('valor = ?'); valores.push(valor) }
  if (orden !== null) { cambios.push('orden = ?'); valores.push(orden) }
  if (tieneActivo) { cambios.push('activo = ?'); valores.push(req.body.activo) }
  if (cambios.length) {
    try {
      await pool.query(`UPDATE opciones_lista SET ${cambios.join(', ')} WHERE id = ?`, [...valores, opcion.id])
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'OPCION_DUPLICADA', 'Ya existe una opción con ese texto en esta lista.')
      throw error
    }
  }
  res.json({ id: opcion.id })
}))

rutasAdmin.get('/auditoria', asincrono(async (req, res) => {
  const { tabla, usuario_id: usuarioId, desde, hasta } = req.query
  const condiciones = []
  const parametros = []
  if (typeof tabla === 'string' && tabla) { condiciones.push('a.tabla = ?'); parametros.push(tabla) }
  if (typeof usuarioId === 'string' && usuarioId) { condiciones.push('a.usuario_id = ?'); parametros.push(usuarioId) }
  if (typeof desde === 'string' && desde) {
    if (!esFechaIso(desde)) throw validacion('Fecha "desde" no válida.')
    condiciones.push('a.fecha >= ?'); parametros.push(`${desde} 00:00:00`)
  }
  if (typeof hasta === 'string' && hasta) {
    if (!esFechaIso(hasta)) throw validacion('Fecha "hasta" no válida.')
    condiciones.push('a.fecha <= ?'); parametros.push(`${hasta} 23:59:59`)
  }
  const limite = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 200)
  const filas = await todas(pool, `
    SELECT a.id, a.tabla, a.registro_id, a.operacion, a.usuario_id, u.nombre_completo AS usuario_nombre, a.fecha,
           a.valores_anteriores, a.valores_nuevos
    FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
    ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
    ORDER BY a.id DESC LIMIT ${limite}`, parametros)
  res.json(filas.map((f) => ({ ...f, fecha: isoUtc(f.fecha) })))
}))
