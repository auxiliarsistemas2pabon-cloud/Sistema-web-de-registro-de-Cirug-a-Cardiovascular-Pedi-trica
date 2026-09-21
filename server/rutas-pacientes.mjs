import { Router } from 'express'
import { puedeEscribir, requiereRol } from './auth.mjs'
import { conTransaccion, hoyBogota, pool, todas, una } from './db.mjs'
import { asincrono, validacion } from './errores.mjs'
import {
  actualizarPaciente, crearPaciente, filaApi, guardarCirugia, guardarDiagnostico, guardarPostoperatorio, guardarSeguimiento,
  marcarEliminado, obtenerCirugia, obtenerDiagnostico, obtenerPaciente, obtenerPostoperatorio, obtenerSeguimiento,
} from './servicios.mjs'

export const rutasPacientes = Router()

const SQL_RESUMEN = `
  SELECT
    p.id AS paciente_id, p.numero_paciente, p.nombre_completo, p.identificacion, p.fecha_nacimiento,
    DATEDIFF(?, p.fecha_nacimiento) AS edad_dias,
    c.fecha_cirugia,
    DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_cirugia_dias,
    CASE
      WHEN po.fecha_traslado_intermedio IS NOT NULL THEN DATEDIFF(po.fecha_traslado_intermedio, c.fecha_cirugia)
      WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia)
      ELSE NULL
    END AS dias_uci,
    CASE WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia) ELSE NULL END AS dias_hospitalizacion_posqx,
    p.estado_modulo AS estado_m1,
    COALESCE(d.estado_modulo, 'pendiente') AS estado_m2,
    COALESCE(c.estado_modulo, 'pendiente') AS estado_m3,
    COALESCE(po.estado_modulo, 'pendiente') AS estado_m4,
    COALESCE(s.estado_modulo, 'pendiente') AS estado_m5,
    dg.valor AS diagnostico_valor, rc.valor AS rachs_valor, eps.valor AS eps_valor,
    pr.valor AS procedencia_valor, cs.valor AS condicion_salida_valor, p.eliminado
  FROM pacientes p
  LEFT JOIN diagnosticos d ON d.paciente_id = p.id
  LEFT JOIN cirugias c ON c.paciente_id = p.id
  LEFT JOIN postoperatorio po ON po.paciente_id = p.id
  LEFT JOIN seguimientos s ON s.paciente_id = p.id
  LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
  LEFT JOIN opciones_lista rc ON rc.id = d.rachs_id
  LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
  LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
  LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id`

const resumenApi = (fila) => (fila ? { ...fila, eliminado: Boolean(fila.eliminado) } : fila)

const escaparLike = (t) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

rutasPacientes.get('/', asincrono(async (req, res) => {
  const q = req.query
  const condiciones = []
  const parametros = [hoyBogota()]

  // Solo el administrador puede ver eliminados (y únicamente cuando lo pide con ?eliminados=1).
  condiciones.push(req.usuario.rol === 'administrador' && q.eliminados === '1' ? 'p.eliminado = 1' : 'p.eliminado = 0')

  if (typeof q.busqueda === 'string' && q.busqueda.trim()) {
    const termino = `%${escaparLike(q.busqueda.trim())}%`
    condiciones.push('(p.nombre_completo LIKE ? OR p.identificacion LIKE ?)')
    parametros.push(termino, termino)
  }
  const porTexto = { eps: 'eps.valor', diagnostico: 'dg.valor', rachs: 'rc.valor', condicionSalida: 'cs.valor' }
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

rutasPacientes.post('/', puedeEscribir, asincrono(async (req, res) => {
  const id = await conTransaccion((conexion) => crearPaciente(conexion, req.usuario, req.body))
  res.status(201).json({ id })
}))

rutasPacientes.get('/:id', asincrono(async (req, res) => {
  res.json(filaApi('pacientes', await obtenerPaciente(pool, req.params.id, req.usuario)))
}))

rutasPacientes.get('/:id/resumen', asincrono(async (req, res) => {
  await obtenerPaciente(pool, req.params.id, req.usuario)
  const fila = await una(pool, `${SQL_RESUMEN} WHERE p.id = ?`, [hoyBogota(), req.params.id])
  res.json(resumenApi(fila))
}))

rutasPacientes.put('/:id', puedeEscribir, asincrono(async (req, res) => {
  const id = await conTransaccion((conexion) => actualizarPaciente(conexion, req.usuario, req.params.id, req.body))
  res.json({ id })
}))

rutasPacientes.put('/:id/eliminado', requiereRol('administrador'), asincrono(async (req, res) => {
  if (typeof req.body?.eliminado !== 'boolean') throw validacion('Indique { "eliminado": true|false }.')
  const id = await conTransaccion((conexion) => marcarEliminado(conexion, req.usuario, req.params.id, req.body.eliminado))
  res.json({ id })
}))

// Módulos 2 a 5: GET devuelve el objeto o null si aún no existe; PUT es un upsert.
const modulos = {
  diagnostico: { obtener: obtenerDiagnostico, guardar: guardarDiagnostico },
  cirugia: { obtener: obtenerCirugia, guardar: guardarCirugia },
  postoperatorio: { obtener: obtenerPostoperatorio, guardar: guardarPostoperatorio },
  seguimiento: { obtener: obtenerSeguimiento, guardar: guardarSeguimiento },
}

for (const [ruta, { obtener, guardar }] of Object.entries(modulos)) {
  rutasPacientes.get(`/:id/${ruta}`, asincrono(async (req, res) => {
    await obtenerPaciente(pool, req.params.id, req.usuario)
    res.json(await obtener(pool, req.params.id))
  }))

  rutasPacientes.put(`/:id/${ruta}`, puedeEscribir, asincrono(async (req, res) => {
    const id = await conTransaccion(async (conexion) => {
      await obtenerPaciente(conexion, req.params.id, req.usuario)
      return guardar(conexion, req.usuario, req.params.id, req.body)
    })
    res.json({ id })
  }))
}

