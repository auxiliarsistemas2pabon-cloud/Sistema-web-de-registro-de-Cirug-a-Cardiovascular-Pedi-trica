import { Router } from 'express'
import { puedeEscribir, requiereRol } from './auth.mjs'
import { conTransaccion, hoyBogota, pool, todas, una } from './db.mjs'
import { asincrono, validacion } from './errores.mjs'
import { filaApi } from './servicios.mjs'
import {
  actualizarPacienteAdulto, crearPacienteAdulto, guardarCirugiaAdulto, guardarDiagnosticoAdulto, guardarPostoperatorioAdulto,
  guardarSeguimientoAdulto, marcarEliminadoAdulto, obtenerCirugiaAdulto, obtenerDiagnosticoAdulto, obtenerPacienteAdulto,
  obtenerPostoperatorioAdulto, obtenerSeguimientoAdulto,
} from './servicios-adultos.mjs'

export const rutasPacientesAdultos = Router()

const SQL_RESUMEN = `
  SELECT
    p.id AS paciente_id, p.numero_paciente, p.nombre_completo, p.identificacion, p.fecha_nacimiento,
    DATEDIFF(?, p.fecha_nacimiento) AS edad_dias,
    c.fecha_cirugia,
    DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_cirugia_dias,
    po.dias_estancia_uci AS dias_uci,
    po.dias_hospitalizacion_total AS dias_hospitalizacion_posqx,
    p.estado_modulo AS estado_m1,
    COALESCE(d.estado_modulo, 'pendiente') AS estado_m2,
    COALESCE(c.estado_modulo, 'pendiente') AS estado_m3,
    COALESCE(po.estado_modulo, 'pendiente') AS estado_m4,
    COALESCE(s.estado_modulo, 'pendiente') AS estado_m5,
    dg.valor AS diagnostico_valor, d.euroscore, eps.valor AS eps_valor,
    pr.valor AS procedencia_valor, cs.valor AS condicion_salida_valor, p.eliminado
  FROM pacientes_adultos p
  LEFT JOIN diagnosticos_adultos d ON d.paciente_id = p.id
  LEFT JOIN cirugias_adultos c ON c.paciente_id = p.id
  LEFT JOIN postoperatorio_adultos po ON po.paciente_id = p.id
  LEFT JOIN seguimientos_adultos s ON s.paciente_id = p.id
  LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
  LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
  LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
  LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id`

const resumenApi = (fila) => (fila ? { ...fila, eliminado: Boolean(fila.eliminado) } : fila)

const escaparLike = (t) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

rutasPacientesAdultos.get('/', asincrono(async (req, res) => {
  const q = req.query
  const condiciones = []
  const parametros = [hoyBogota()]

  // Solo el administrador puede ver eliminados (y únicamente cuando lo pide con ?eliminados=1).
  condiciones.push(req.usuario.rol === 'administrador' && q.eliminados === '1' ? 'p.eliminado = 1' : 'p.eliminado = 0')

  if (typeof q.busqueda === 'string' && q.busqueda.trim()) {
    const palabras = q.busqueda.trim().split(/\s+/).filter(Boolean)
    for (const palabra of palabras) {
      const termino = `%${escaparLike(palabra)}%`
      condiciones.push('(p.nombre_completo LIKE ? OR p.identificacion LIKE ?)')
      parametros.push(termino, termino)
    }
  }
  const porTexto = { eps: 'eps.valor', diagnostico: 'dg.valor', condicionSalida: 'cs.valor' }
  for (const [param, columna] of Object.entries(porTexto)) {
    if (typeof q[param] === 'string' && q[param]) {
      condiciones.push(`${columna} = ?`)
      parametros.push(q[param])
    }
  }
  if (typeof q.fechaCirugiaDesde === 'string' && q.fechaCirugiaDesde) {
    condiciones.push('c.fecha_cirugia >= ?')
    parametros.push(q.fechaCirugiaDesde)
  }
  if (typeof q.fechaCirugiaHasta === 'string' && q.fechaCirugiaHasta) {
    condiciones.push('c.fecha_cirugia <= ?')
    parametros.push(q.fechaCirugiaHasta)
  }

  const filas = await todas(pool, `${SQL_RESUMEN} WHERE ${condiciones.join(' AND ')} ORDER BY p.numero_paciente DESC LIMIT 1000`, parametros)
  res.json(filas.map(resumenApi))
}))

rutasPacientesAdultos.post('/', puedeEscribir, asincrono(async (req, res) => {
  const id = await conTransaccion((conexion) => crearPacienteAdulto(conexion, req.usuario, req.body))
  res.status(201).json({ id })
}))

rutasPacientesAdultos.get('/:id', asincrono(async (req, res) => {
  res.json(filaApi('pacientes_adultos', await obtenerPacienteAdulto(pool, req.params.id, req.usuario)))
}))

rutasPacientesAdultos.get('/:id/resumen', asincrono(async (req, res) => {
  await obtenerPacienteAdulto(pool, req.params.id, req.usuario)
  const fila = await una(pool, `${SQL_RESUMEN} WHERE p.id = ?`, [hoyBogota(), req.params.id])
  res.json(resumenApi(fila))
}))

rutasPacientesAdultos.put('/:id', puedeEscribir, asincrono(async (req, res) => {
  const id = await conTransaccion((conexion) => actualizarPacienteAdulto(conexion, req.usuario, req.params.id, req.body))
  res.json({ id })
}))

rutasPacientesAdultos.put('/:id/eliminado', requiereRol('administrador'), asincrono(async (req, res) => {
  if (typeof req.body?.eliminado !== 'boolean') throw validacion('Indique { "eliminado": true|false }.')
  const id = await conTransaccion((conexion) => marcarEliminadoAdulto(conexion, req.usuario, req.params.id, req.body.eliminado))
  res.json({ id })
}))

// Módulos 2 a 5: GET devuelve el objeto o null si aún no existe; PUT es un upsert.
const modulos = {
  diagnostico: { obtener: obtenerDiagnosticoAdulto, guardar: guardarDiagnosticoAdulto },
  cirugia: { obtener: obtenerCirugiaAdulto, guardar: guardarCirugiaAdulto },
  postoperatorio: { obtener: obtenerPostoperatorioAdulto, guardar: guardarPostoperatorioAdulto },
  seguimiento: { obtener: obtenerSeguimientoAdulto, guardar: guardarSeguimientoAdulto },
}

for (const [ruta, { obtener, guardar }] of Object.entries(modulos)) {
  rutasPacientesAdultos.get(`/:id/${ruta}`, asincrono(async (req, res) => {
    await obtenerPacienteAdulto(pool, req.params.id, req.usuario)
    res.json(await obtener(pool, req.params.id))
  }))

  rutasPacientesAdultos.put(`/:id/${ruta}`, puedeEscribir, asincrono(async (req, res) => {
    const id = await conTransaccion(async (conexion) => {
      await obtenerPacienteAdulto(conexion, req.params.id, req.usuario)
      return guardar(conexion, req.usuario, req.params.id, req.body)
    })
    res.json({ id })
  }))
}
