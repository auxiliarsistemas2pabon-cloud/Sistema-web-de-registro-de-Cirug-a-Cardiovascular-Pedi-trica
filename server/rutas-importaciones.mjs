import { Router } from 'express'
import { puedeEscribir } from './auth.mjs'
import { conTransaccion, nuevoId, pool, todas, una } from './db.mjs'
import { ErrorApi, asincrono, noEncontrado, sinPermiso, validacion } from './errores.mjs'
import {
  crearPaciente, guardarCirugia, guardarDiagnostico, guardarPostoperatorio, guardarSeguimiento,
} from './servicios.mjs'

export const rutasImportaciones = Router()
rutasImportaciones.use(puedeEscribir)

const TAMANO_MAXIMO_LOTE = 5000

rutasImportaciones.post('/identificaciones-existentes', asincrono(async (req, res) => {
  const ids = req.body?.identificaciones
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw validacion('Envíe { "identificaciones": string[] }.')
  if (ids.length === 0) return res.json({ existentes: [] })
  const filas = await todas(pool, 'SELECT identificacion FROM pacientes WHERE identificacion IN (?)', [ids])
  res.json({ existentes: filas.map((f) => f.identificacion) })
}))

rutasImportaciones.post('/lotes', asincrono(async (req, res) => {
  const { archivo_nombre: archivo, filas } = req.body ?? {}
  if (typeof archivo !== 'string' || !archivo.trim() || !Array.isArray(filas)) throw validacion('Envíe archivo_nombre y filas.')
  if (filas.length > TAMANO_MAXIMO_LOTE) throw validacion(`Un lote admite hasta ${TAMANO_MAXIMO_LOTE} filas.`)

  const resultado = await conTransaccion(async (conexion) => {
    const loteId = nuevoId()
    await conexion.query('INSERT INTO importaciones_lote (id, archivo_nombre, cargado_por) VALUES (?, ?, ?)', [loteId, archivo.trim().slice(0, 255), req.usuario.id])
    const creadas = []
    for (const fila of filas) {
      if (!Number.isInteger(fila?.numero_fila) || !['valido', 'con_errores'].includes(fila?.estado)) throw validacion('Fila de importación no válida.')
      const id = nuevoId()
      await conexion.query(
        'INSERT INTO importaciones_filas (id, lote_id, numero_fila, datos_originales, datos_normalizados, errores, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, loteId, fila.numero_fila, JSON.stringify(fila.datos_originales ?? {}), fila.datos_normalizados ? JSON.stringify(fila.datos_normalizados) : null,
          fila.errores?.length ? JSON.stringify(fila.errores) : null, fila.estado],
      )
      creadas.push({ numero_fila: fila.numero_fila, id })
    }
    return { lote_id: loteId, filas: creadas }
  })
  res.status(201).json(resultado)
}))

/** Aplica una fila validada en una sola transacción. Si falla, la fila queda en `con_errores` con el motivo. */
rutasImportaciones.post('/filas/:id/aplicar', asincrono(async (req, res) => {
  const fila = await una(pool, `SELECT f.*, l.cargado_por FROM importaciones_filas f JOIN importaciones_lote l ON l.id = f.lote_id WHERE f.id = ?`, [req.params.id])
  if (!fila) throw noEncontrado('No se encontró la fila de importación.')
  if (req.usuario.rol !== 'administrador' && fila.cargado_por !== req.usuario.id) throw sinPermiso('Solo puede aplicar sus propios lotes de importación.')
  if (fila.estado !== 'valido') throw new ErrorApi(409, 'FILA_NO_VALIDA', 'La fila no está validada para importación.')
  const datos = fila.datos_normalizados

  try {
    const pacienteId = await conTransaccion(async (conexion) => {
      const id = await crearPaciente(conexion, req.usuario, datos.paciente, { origen: 'importado', lote_importacion_id: fila.lote_id })
      if (datos.diagnostico) await guardarDiagnostico(conexion, req.usuario, id, datos.diagnostico)
      if (datos.cirugia) await guardarCirugia(conexion, req.usuario, id, datos.cirugia)
      if (datos.postoperatorio) await guardarPostoperatorio(conexion, req.usuario, id, datos.postoperatorio)
      if (datos.seguimiento) {
        const seguimiento = await una(conexion, 'SELECT no_aplica FROM seguimientos WHERE paciente_id = ?', [id])
        if (seguimiento && !seguimiento.no_aplica) await guardarSeguimiento(conexion, req.usuario, id, datos.seguimiento)
      }
      await conexion.query("UPDATE importaciones_filas SET estado = 'importado', paciente_id = ?, errores = NULL WHERE id = ?", [id, fila.id])
      return id
    })
    await pool.query(
      `UPDATE importaciones_lote SET estado = 'aplicado'
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM importaciones_filas WHERE lote_id = ? AND estado = 'valido')`,
      [fila.lote_id, fila.lote_id],
    )
    res.json({ paciente_id: pacienteId })
  } catch (error) {
    const mensaje = error instanceof ErrorApi ? error.message
      : error?.code === 'ER_DUP_ENTRY' ? 'Ya existe un paciente con esta identificación.'
      : 'No se pudo importar la fila.'
    const errores = [...(Array.isArray(fila.errores) ? fila.errores : []), mensaje]
    await pool.query("UPDATE importaciones_filas SET estado = 'con_errores', errores = ? WHERE id = ?", [JSON.stringify(errores), fila.id])
    if (error instanceof ErrorApi) throw error
    if (error?.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'IDENTIFICACION_DUPLICADA', mensaje)
    throw error
  }
}))
