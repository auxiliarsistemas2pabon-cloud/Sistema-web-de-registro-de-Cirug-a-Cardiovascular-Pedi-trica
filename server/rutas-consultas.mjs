// Alertas, indicadores y exportación (solo lectura).
import { Router } from 'express'
import { hoyBogota, pool, todas } from './db.mjs'
import { asincrono, validacion } from './errores.mjs'
import { esFechaIso } from './validar.mjs'

export const rutasAlertas = Router()
export const rutasIndicadores = Router()
export const rutasExportacion = Router()

// ---------------------------------------------------------------------------------------------
// Alertas de seguimiento
// ---------------------------------------------------------------------------------------------

rutasAlertas.get('/', asincrono(async (_req, res) => {
  const hoy = hoyBogota()
  const filas = await todas(pool, `
    SELECT p.id AS paciente_id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'llamada_15_dias' AS tipo_alerta, s.fecha_llamada_15_dias AS fecha_referencia,
           DATEDIFF(?, s.fecha_llamada_15_dias) AS dias_desde_referencia
    FROM pacientes p JOIN seguimientos s ON s.paciente_id = p.id
    WHERE p.eliminado = 0 AND s.no_aplica = 0 AND s.persona_recibe_llamada IS NULL AND s.fecha_llamada_15_dias IS NOT NULL
    UNION ALL
    SELECT p.id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'seguimiento_pendiente_alta', po.fecha_salida, DATEDIFF(?, po.fecha_salida)
    FROM pacientes p
    JOIN postoperatorio po ON po.paciente_id = p.id
    JOIN seguimientos s ON s.paciente_id = p.id
    WHERE p.eliminado = 0 AND s.no_aplica = 0 AND s.estado_modulo <> 'completo'
      AND po.fecha_salida IS NOT NULL AND po.fecha_salida >= DATE_SUB(?, INTERVAL 30 DAY)
    ORDER BY dias_desde_referencia DESC`, [hoy, hoy, hoy])
  res.json(filas)
}))

// ---------------------------------------------------------------------------------------------
// Indicadores (las medianas se calculan aquí: MySQL no tiene percentile_cont)
// ---------------------------------------------------------------------------------------------

const redondear = (n) => Math.round(n * 10) / 10
const promedio = (valores) => {
  const v = valores.filter((x) => x !== null && x !== undefined)
  return v.length ? redondear(v.reduce((a, b) => a + b, 0) / v.length) : null
}
const mediana = (valores) => {
  const v = valores.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return redondear(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2)
}
const porcentaje = (parte, total) => (total ? redondear((100 * parte) / total) : 0)

function contarPor(filas, clave, etiquetaVacia) {
  const conteo = new Map()
  for (const fila of filas) conteo.set(fila[clave] ?? etiquetaVacia, (conteo.get(fila[clave] ?? etiquetaVacia) ?? 0) + 1)
  return [...conteo.entries()]
}

rutasIndicadores.get('/', asincrono(async (req, res) => {
  const { desde, hasta } = req.query
  if (!esFechaIso(desde) || !esFechaIso(hasta)) throw validacion('Indique desde y hasta con formato aaaa-mm-dd.')

  const filas = await todas(pool, `
    SELECT c.id AS cirugia_id, c.fecha_cirugia, c.tiempo_cec_min, c.tiempo_clamp_min,
      CASE WHEN po.fecha_traslado_intermedio IS NOT NULL THEN DATEDIFF(po.fecha_traslado_intermedio, c.fecha_cirugia)
           WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia) END AS dias_uci,
      CASE WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia) END AS dias_hosp,
      po.horas_ventilacion_mecanica AS horas_vm,
      (cs.codigo = 'MUERTE') AS muerte,
      (c.complicacion_intraqx_id IS NOT NULL AND (ci.codigo IS NULL OR ci.codigo <> 'NINGUNA')) AS comp_intraqx,
      (po.complicacion_pop_id IS NOT NULL AND (cp.codigo IS NULL OR cp.codigo <> 'NO')) AS comp_pop,
      (s.reingreso_30_dias = 'SI') AS reingreso,
      dg.valor AS diagnostico, rc.valor AS rachs, eps.valor AS eps, pr.valor AS procedencia
    FROM cirugias c
    JOIN pacientes p ON p.id = c.paciente_id
    LEFT JOIN diagnosticos d ON d.paciente_id = p.id
    LEFT JOIN postoperatorio po ON po.paciente_id = p.id
    LEFT JOIN seguimientos s ON s.paciente_id = p.id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista ci ON ci.id = c.complicacion_intraqx_id
    LEFT JOIN opciones_lista cp ON cp.id = po.complicacion_pop_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista rc ON rc.id = d.rachs_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia IS NOT NULL AND c.fecha_cirugia BETWEEN ? AND ?`, [desde, hasta])

  const total = filas.length
  const cuenta = (fn) => filas.filter(fn).length

  const porMes = new Map()
  for (const f of filas) {
    const [anio, mes] = f.fecha_cirugia.split('-').map(Number)
    const clave = `${anio}-${mes}`
    porMes.set(clave, { anio, mes, total_cirugias: (porMes.get(clave)?.total_cirugias ?? 0) + 1 })
  }

  const porProcedimiento = await todas(pool, `
    SELECT o.valor AS procedimiento, COUNT(DISTINCT c.id) AS total_cirugias
    FROM cirugias c
    JOIN pacientes p ON p.id = c.paciente_id
    JOIN cirugias_procedimientos cp ON cp.cirugia_id = c.id
    JOIN opciones_lista o ON o.id = cp.procedimiento_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia BETWEEN ? AND ?
    GROUP BY o.valor ORDER BY total_cirugias DESC, o.valor`, [desde, hasta])

  const ordenarConteo = (pares) => pares.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))

  const rachs = new Map()
  for (const f of filas) {
    const clave = f.rachs ?? 'Sin RACHS'
    const acumulado = rachs.get(clave) ?? { total: 0, muertes: 0 }
    acumulado.total += 1
    if (f.muerte) acumulado.muertes += 1
    rachs.set(clave, acumulado)
  }

  res.json({
    resumen: {
      total_cirugias: total,
      mortalidad_hospitalaria_pct: porcentaje(cuenta((f) => f.muerte), total),
      dias_uci_promedio: promedio(filas.map((f) => f.dias_uci)),
      dias_uci_mediana: mediana(filas.map((f) => f.dias_uci)),
      dias_hospitalizacion_promedio: promedio(filas.map((f) => f.dias_hosp)),
      dias_hospitalizacion_mediana: mediana(filas.map((f) => f.dias_hosp)),
      horas_ventilacion_promedio: promedio(filas.map((f) => f.horas_vm)),
      horas_ventilacion_mediana: mediana(filas.map((f) => f.horas_vm)),
      tasa_complicacion_intraqx_pct: porcentaje(cuenta((f) => f.comp_intraqx), total),
      tasa_complicacion_pop_pct: porcentaje(cuenta((f) => f.comp_pop), total),
      tasa_reingreso_30d_pct: porcentaje(cuenta((f) => f.reingreso), total),
      tiempo_cec_promedio: promedio(filas.map((f) => f.tiempo_cec_min)),
      tiempo_clamp_promedio: promedio(filas.map((f) => f.tiempo_clamp_min)),
    },
    por_mes: [...porMes.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes),
    por_diagnostico: ordenarConteo(contarPor(filas, 'diagnostico', 'Sin diagnóstico')).map(([diagnostico, n]) => ({ diagnostico, total_cirugias: n })),
    por_procedimiento: porProcedimiento.map((f) => ({ procedimiento: f.procedimiento, total_cirugias: Number(f.total_cirugias) })),
    por_rachs: [...rachs.entries()]
      .sort((a, b) => (a[0] === 'Sin RACHS') - (b[0] === 'Sin RACHS') || a[0].localeCompare(b[0]))
      .map(([nombre, r]) => ({ rachs: nombre, total_cirugias: r.total, mortalidad_pct: porcentaje(r.muertes, r.total) })),
    por_eps: ordenarConteo(contarPor(filas, 'eps', 'Sin EPS')).map(([eps, n]) => ({ eps, total_cirugias: n })),
    por_procedencia: ordenarConteo(contarPor(filas, 'procedencia', 'Sin procedencia')).map(([procedencia, n]) => ({ procedencia, total_cirugias: n })),
  })
}))

// ---------------------------------------------------------------------------------------------
// Exportación plana (el .xlsx / .csv se genera en el cliente). Los nombres de columna son el formato
// canónico que también reconoce la importación.
// ---------------------------------------------------------------------------------------------

rutasExportacion.get('/pacientes', asincrono(async (_req, res) => {
  const conexion = await pool.getConnection()
  try {
    await conexion.query('SET SESSION group_concat_max_len = 1000000')
    const [filas] = await conexion.query(`
      SELECT p.numero_paciente, p.nombre_completo, p.identificacion, sexo.valor AS sexo, p.fecha_nacimiento, p.peso_kg, p.talla_cm,
        procedencia.valor AS procedencia, municipio.valor AS municipio_narino, p.telefonos, p.sin_telefono, eps.valor AS eps,
        diagnostico.valor AS diagnostico, valvulopatia.valor AS valvulopatia,
        (SELECT GROUP_CONCAT(o.valor ORDER BY dr.id SEPARATOR ' | ') FROM diagnosticos_riesgos dr JOIN opciones_lista o ON o.id = dr.riesgo_id WHERE dr.diagnostico_id = d.id) AS riesgos,
        rachs.valor AS rachs, c.fecha_cirugia,
        (SELECT GROUP_CONCAT(o.valor ORDER BY cp.orden SEPARATOR ' | ') FROM cirugias_procedimientos cp JOIN opciones_lista o ON o.id = cp.procedimiento_id WHERE cp.cirugia_id = c.id) AS procedimientos,
        implante.valor AS implante, c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min, complicacion_intraqx.valor AS complicacion_intraqx,
        c.cierre_esternal_diferido, c.extubacion_quirofano, unidad_pop.valor AS unidad_pop, po.horas_ventilacion_mecanica,
        complicacion_pop.valor AS complicacion_pop, po.fecha_traslado_intermedio, po.fecha_salida, condicion_salida.valor AS condicion_salida,
        s.fecha_control_cirugia, s.rehabilitacion_cardiaca, estado_herida.valor AS estado_herida, s.fecha_llamada_15_dias,
        s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso, causa_reingreso.valor AS causa_reingreso, s.observaciones
      FROM pacientes p
      LEFT JOIN diagnosticos d ON d.paciente_id = p.id
      LEFT JOIN cirugias c ON c.paciente_id = p.id
      LEFT JOIN postoperatorio po ON po.paciente_id = p.id
      LEFT JOIN seguimientos s ON s.paciente_id = p.id
      LEFT JOIN opciones_lista sexo ON sexo.id = p.sexo_id
      LEFT JOIN opciones_lista procedencia ON procedencia.id = p.procedencia_id
      LEFT JOIN opciones_lista municipio ON municipio.id = p.municipio_narino_id
      LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
      LEFT JOIN opciones_lista diagnostico ON diagnostico.id = d.diagnostico_id
      LEFT JOIN opciones_lista valvulopatia ON valvulopatia.id = d.valvulopatia_id
      LEFT JOIN opciones_lista rachs ON rachs.id = d.rachs_id
      LEFT JOIN opciones_lista implante ON implante.id = c.implante_id
      LEFT JOIN opciones_lista complicacion_intraqx ON complicacion_intraqx.id = c.complicacion_intraqx_id
      LEFT JOIN opciones_lista unidad_pop ON unidad_pop.id = po.unidad_pop_id
      LEFT JOIN opciones_lista complicacion_pop ON complicacion_pop.id = po.complicacion_pop_id
      LEFT JOIN opciones_lista condicion_salida ON condicion_salida.id = po.condicion_salida_id
      LEFT JOIN opciones_lista estado_herida ON estado_herida.id = s.estado_herida_id
      LEFT JOIN opciones_lista causa_reingreso ON causa_reingreso.id = s.causa_reingreso_id
      WHERE p.eliminado = 0
      ORDER BY p.numero_paciente`)
    res.json(filas.map((f) => ({
      ...f,
      telefonos: Array.isArray(f.telefonos) ? f.telefonos.join(' | ') : '',
      sin_telefono: Boolean(f.sin_telefono),
    })))
  } finally {
    conexion.release()
  }
}))
