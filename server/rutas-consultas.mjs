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

// El módulo de adultos no guarda una fecha de llamada (solo Sí/No en llamado_15_dias, ver
// server/schema.mjs), así que la "fecha de referencia" del recordatorio se calcula como
// fecha_salida + 15 días en vez de leerse de una columna — mismo criterio que el pediátrico
// (recordar la llamada de los 15 días hasta que quede confirmada), con el dato que sí existe.
rutasAlertas.get('/adultos', asincrono(async (_req, res) => {
  const hoy = hoyBogota()
  const filas = await todas(pool, `
    SELECT p.id AS paciente_id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'llamada_15_dias' AS tipo_alerta, DATE_ADD(po.fecha_salida, INTERVAL 15 DAY) AS fecha_referencia,
           DATEDIFF(?, DATE_ADD(po.fecha_salida, INTERVAL 15 DAY)) AS dias_desde_referencia
    FROM pacientes_adultos p
    JOIN postoperatorio_adultos po ON po.paciente_id = p.id
    JOIN seguimientos_adultos s ON s.paciente_id = p.id
    WHERE p.eliminado = 0 AND s.no_aplica = 0 AND (s.llamado_15_dias IS NULL OR s.llamado_15_dias <> 'SI') AND po.fecha_salida IS NOT NULL
    UNION ALL
    SELECT p.id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'seguimiento_pendiente_alta', po.fecha_salida, DATEDIFF(?, po.fecha_salida)
    FROM pacientes_adultos p
    JOIN postoperatorio_adultos po ON po.paciente_id = p.id
    JOIN seguimientos_adultos s ON s.paciente_id = p.id
    WHERE p.eliminado = 0 AND s.no_aplica = 0 AND s.estado_modulo <> 'completo'
      AND po.fecha_salida IS NOT NULL AND po.fecha_salida >= DATE_SUB(?, INTERVAL 30 DAY)
    ORDER BY dias_desde_referencia DESC`, [hoy, hoy, hoy])
  res.json(filas)
}))

// ---------------------------------------------------------------------------------------------
// Indicadores (las medianas se calculan aquí: MySQL no tiene percentile_cont)
// ---------------------------------------------------------------------------------------------

const redondear = (n, decimales = 1) => Math.round(n * 10 ** decimales) / 10 ** decimales
const promedio = (valores, decimales = 1) => {
  const v = valores.filter((x) => x !== null && x !== undefined)
  return v.length ? redondear(v.reduce((a, b) => a + b, 0) / v.length, decimales) : null
}
const mediana = (valores, decimales = 1) => {
  const v = valores.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return redondear(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2, decimales)
}
const porcentaje = (parte, total) => (total ? redondear((100 * parte) / total) : 0)

function contarPor(filas, clave, etiquetaVacia) {
  const conteo = new Map()
  for (const fila of filas) conteo.set(fila[clave] ?? etiquetaVacia, (conteo.get(fila[clave] ?? etiquetaVacia) ?? 0) + 1)
  return [...conteo.entries()]
}

/** Superficie corporal en m² por la fórmula de Mosteller: √(peso kg × talla cm ÷ 3600). */
const superficieCorporal = (pesoKg, tallaCm) => (pesoKg && tallaCm ? Math.sqrt((pesoKg * tallaCm) / 3600) : null)

/** Conteo por categoría, de mayor a menor, con la categoría vacía siempre al final. */
function conteoNominal(valores, etiquetaVacia) {
  const conteo = new Map()
  for (const v of valores) conteo.set(v ?? etiquetaVacia, (conteo.get(v ?? etiquetaVacia) ?? 0) + 1)
  return [...conteo.entries()]
    .sort((a, b) => (a[0] === etiquetaVacia) - (b[0] === etiquetaVacia) || b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([categoria, total_cirugias]) => ({ categoria, total_cirugias }))
}

/**
 * Cuenta las cirugías por rangos de un valor numérico. Cada rango declara su límite superior
 * exclusivo (`hasta`); el último va sin límite. Se devuelven todos los rangos, también los vacíos,
 * para que la forma de la distribución se compare entre periodos, y al final "Sin dato" solo si
 * alguna cirugía no tiene el valor.
 */
function distribucion(valores, rangos) {
  if (!valores.length) return []
  const conteo = rangos.map(() => 0)
  let sinDato = 0
  for (const v of valores) {
    if (v === null || v === undefined) sinDato += 1
    else conteo[rangos.findIndex((r) => r.hasta === undefined || v < r.hasta)] += 1
  }
  const salida = rangos.map((r, i) => ({ categoria: r.etiqueta, total_cirugias: conteo[i] }))
  return sinDato ? [...salida, { categoria: 'Sin dato', total_cirugias: sinDato }] : salida
}

// Rangos de los gráficos de distribución: cortes fijos de uso clínico corriente (no salen de los
// datos), así un rango significa lo mismo en cualquier periodo. Peso, talla y superficie corporal
// tienen cortes propios por grupo porque niños y adultos viven en escalas distintas.
const RANGOS_PEDIATRICOS = {
  peso: [
    { hasta: 2.5, etiqueta: '<2.5 kg' }, { hasta: 5, etiqueta: '2.5–4.9 kg' }, { hasta: 10, etiqueta: '5–9.9 kg' },
    { hasta: 20, etiqueta: '10–19.9 kg' }, { hasta: 40, etiqueta: '20–39.9 kg' }, { etiqueta: '≥40 kg' },
  ],
  talla: [
    { hasta: 50, etiqueta: '<50 cm' }, { hasta: 75, etiqueta: '50–74 cm' }, { hasta: 100, etiqueta: '75–99 cm' },
    { hasta: 125, etiqueta: '100–124 cm' }, { hasta: 150, etiqueta: '125–149 cm' }, { etiqueta: '≥150 cm' },
  ],
  superficie: [
    { hasta: 0.3, etiqueta: '<0.30 m²' }, { hasta: 0.5, etiqueta: '0.30–0.49 m²' }, { hasta: 1, etiqueta: '0.50–0.99 m²' },
    { hasta: 1.5, etiqueta: '1.00–1.49 m²' }, { etiqueta: '≥1.50 m²' },
  ],
}
const RANGOS_ADULTOS = {
  peso: [
    { hasta: 50, etiqueta: '<50 kg' }, { hasta: 60, etiqueta: '50–59.9 kg' }, { hasta: 70, etiqueta: '60–69.9 kg' },
    { hasta: 80, etiqueta: '70–79.9 kg' }, { hasta: 90, etiqueta: '80–89.9 kg' }, { hasta: 100, etiqueta: '90–99.9 kg' },
    { etiqueta: '≥100 kg' },
  ],
  talla: [
    { hasta: 150, etiqueta: '<150 cm' }, { hasta: 160, etiqueta: '150–159 cm' }, { hasta: 170, etiqueta: '160–169 cm' },
    { hasta: 180, etiqueta: '170–179 cm' }, { etiqueta: '≥180 cm' },
  ],
  superficie: [
    { hasta: 1.6, etiqueta: '<1.60 m²' }, { hasta: 1.8, etiqueta: '1.60–1.79 m²' }, { hasta: 2, etiqueta: '1.80–1.99 m²' },
    { hasta: 2.2, etiqueta: '2.00–2.19 m²' }, { etiqueta: '≥2.20 m²' },
  ],
}
const RANGOS_DIAS_UCI = [
  { hasta: 2, etiqueta: '0–1 días' }, { hasta: 4, etiqueta: '2–3 días' }, { hasta: 8, etiqueta: '4–7 días' },
  { hasta: 15, etiqueta: '8–14 días' }, { hasta: 31, etiqueta: '15–30 días' }, { etiqueta: '>30 días' },
]
const RANGOS_HORAS_VM = [
  { hasta: 1, etiqueta: '0 h' }, { hasta: 7, etiqueta: '1–6 h' }, { hasta: 25, etiqueta: '7–24 h' },
  { hasta: 49, etiqueta: '25–48 h' }, { hasta: 169, etiqueta: '49–168 h' }, { etiqueta: '>168 h' },
]

/**
 * Características de los pacientes operados y su evolución postoperatoria: mismos gráficos para
 * pediátricos y adultos, cada grupo con sus rangos. El estado de la herida no cuenta a quienes
 * fallecieron (su seguimiento "no aplica").
 */
function caracteristicasYEvolucion(filas, rangos) {
  const superficies = filas.map((f) => superficieCorporal(f.peso_kg, f.talla_cm))
  return {
    resumen: {
      peso_mediana: mediana(filas.map((f) => f.peso_kg)),
      talla_mediana: mediana(filas.map((f) => f.talla_cm)),
      superficie_corporal_mediana: mediana(superficies, 2),
    },
    graficos: {
      por_sexo: conteoNominal(filas.map((f) => f.sexo), 'Sin dato'),
      por_peso: distribucion(filas.map((f) => f.peso_kg), rangos.peso),
      por_talla: distribucion(filas.map((f) => f.talla_cm), rangos.talla),
      por_superficie_corporal: distribucion(superficies, rangos.superficie),
      por_dias_uci: distribucion(filas.map((f) => f.dias_uci), RANGOS_DIAS_UCI),
      por_horas_vm: distribucion(filas.map((f) => f.horas_vm), RANGOS_HORAS_VM),
      por_estado_herida: conteoNominal(filas.filter((f) => !f.seguimiento_no_aplica).map((f) => f.estado_herida), 'Sin registrar'),
    },
  }
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
      dg.valor AS diagnostico, rc.valor AS rachs, eps.valor AS eps, pr.valor AS procedencia,
      p.peso_kg, p.talla_cm, sx.valor AS sexo, eh.valor AS estado_herida, (s.no_aplica = 1) AS seguimiento_no_aplica
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
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
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

  const pacientes = caracteristicasYEvolucion(filas, RANGOS_PEDIATRICOS)

  res.json({
    resumen: {
      ...pacientes.resumen,
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
    ...pacientes.graficos,
  })
}))

// ---------------------------------------------------------------------------------------------
// Indicadores · módulo de adultos. Mismo cálculo que arriba sobre las tablas *_adultos, con dos
// diferencias: días de UCI/hospitalización se leen directo de postoperatorio_adultos (se escriben
// a mano, no se calculan con DATEDIFF) y no hay escala categórica como RACHS-1 — el EuroSCORE es un
// porcentaje continuo, así que se agrupa en las categorías de riesgo estándar de la literatura.
// ---------------------------------------------------------------------------------------------

const ORDEN_EUROSCORE = ['Bajo (<2%)', 'Intermedio (2-5%)', 'Alto (5-10%)', 'Muy alto (≥10%)', 'Sin EuroSCORE']
function categoriaEuroscore(valor) {
  if (valor === null || valor === undefined) return 'Sin EuroSCORE'
  if (valor < 2) return 'Bajo (<2%)'
  if (valor < 5) return 'Intermedio (2-5%)'
  if (valor < 10) return 'Alto (5-10%)'
  return 'Muy alto (≥10%)'
}

rutasIndicadores.get('/adultos', asincrono(async (req, res) => {
  const { desde, hasta } = req.query
  if (!esFechaIso(desde) || !esFechaIso(hasta)) throw validacion('Indique desde y hasta con formato aaaa-mm-dd.')

  const filas = await todas(pool, `
    SELECT c.id AS cirugia_id, c.fecha_cirugia, c.tiempo_cec_min, c.tiempo_clamp_min,
      po.dias_estancia_uci AS dias_uci, po.dias_hospitalizacion_total AS dias_hosp,
      po.horas_ventilacion_mecanica AS horas_vm,
      (cs.codigo = 'MUERTE') AS muerte,
      (c.complicacion_intraqx_id IS NOT NULL AND (ci.codigo IS NULL OR ci.codigo <> 'NINGUNA')) AS comp_intraqx,
      (po.complicacion_pop_id IS NOT NULL AND (cp.codigo IS NULL OR cp.codigo <> 'NO')) AS comp_pop,
      (s.reingreso_30_dias = 'SI') AS reingreso,
      dg.valor AS diagnostico, d.euroscore, eps.valor AS eps, pr.valor AS procedencia,
      p.peso_kg, p.talla_cm, sx.valor AS sexo, eh.valor AS estado_herida, (s.no_aplica = 1) AS seguimiento_no_aplica
    FROM cirugias_adultos c
    JOIN pacientes_adultos p ON p.id = c.paciente_id
    LEFT JOIN diagnosticos_adultos d ON d.paciente_id = p.id
    LEFT JOIN postoperatorio_adultos po ON po.paciente_id = p.id
    LEFT JOIN seguimientos_adultos s ON s.paciente_id = p.id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista ci ON ci.id = c.complicacion_intraqx_id
    LEFT JOIN opciones_lista cp ON cp.id = po.complicacion_pop_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
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
    FROM cirugias_adultos c
    JOIN pacientes_adultos p ON p.id = c.paciente_id
    JOIN cirugias_adultos_procedimientos cp ON cp.cirugia_id = c.id
    JOIN opciones_lista o ON o.id = cp.procedimiento_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia BETWEEN ? AND ?
    GROUP BY o.valor ORDER BY total_cirugias DESC, o.valor`, [desde, hasta])

  const ordenarConteo = (pares) => pares.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))

  const euroscoreMap = new Map()
  for (const f of filas) {
    const clave = categoriaEuroscore(f.euroscore)
    const acumulado = euroscoreMap.get(clave) ?? { total: 0, muertes: 0 }
    acumulado.total += 1
    if (f.muerte) acumulado.muertes += 1
    euroscoreMap.set(clave, acumulado)
  }

  const pacientes = caracteristicasYEvolucion(filas, RANGOS_ADULTOS)

  res.json({
    resumen: {
      ...pacientes.resumen,
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
      euroscore_promedio: promedio(filas.map((f) => f.euroscore)),
      euroscore_mediana: mediana(filas.map((f) => f.euroscore)),
    },
    por_mes: [...porMes.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes),
    por_diagnostico: ordenarConteo(contarPor(filas, 'diagnostico', 'Sin diagnóstico')).map(([diagnostico, n]) => ({ diagnostico, total_cirugias: n })),
    por_procedimiento: porProcedimiento.map((f) => ({ procedimiento: f.procedimiento, total_cirugias: Number(f.total_cirugias) })),
    por_euroscore: ORDEN_EUROSCORE.filter((c) => euroscoreMap.has(c)).map((c) => {
      const r = euroscoreMap.get(c)
      return { categoria: c, total_cirugias: r.total, mortalidad_pct: porcentaje(r.muertes, r.total) }
    }),
    por_eps: ordenarConteo(contarPor(filas, 'eps', 'Sin EPS')).map(([eps, n]) => ({ eps, total_cirugias: n })),
    por_procedencia: ordenarConteo(contarPor(filas, 'procedencia', 'Sin procedencia')).map(([procedencia, n]) => ({ procedencia, total_cirugias: n })),
    ...pacientes.graficos,
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
        implante.valor AS implante, c.numero_implante, c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min, complicacion_intraqx.valor AS complicacion_intraqx,
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

rutasExportacion.get('/pacientes-adultos', asincrono(async (_req, res) => {
  const conexion = await pool.getConnection()
  try {
    await conexion.query('SET SESSION group_concat_max_len = 1000000')
    const [filas] = await conexion.query(`
      SELECT p.numero_paciente, p.nombre_completo, p.identificacion, sexo.valor AS sexo, p.fecha_nacimiento, p.peso_kg, p.talla_cm,
        procedencia.valor AS procedencia, municipio.valor AS municipio_narino, p.telefono, eps.valor AS eps,
        diagnostico.valor AS diagnostico, valvulopatia.valor AS valvulopatia, d.euroscore,
        (SELECT GROUP_CONCAT(o.valor ORDER BY dr.id SEPARATOR ' | ') FROM diagnosticos_adultos_riesgos dr JOIN opciones_lista o ON o.id = dr.riesgo_id WHERE dr.diagnostico_id = d.id) AS riesgos,
        c.fecha_cirugia,
        (SELECT GROUP_CONCAT(o.valor ORDER BY cp.orden SEPARATOR ' | ') FROM cirugias_adultos_procedimientos cp JOIN opciones_lista o ON o.id = cp.procedimiento_id WHERE cp.cirugia_id = c.id) AS procedimientos,
        implante.valor AS implante, c.numero_implante, c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min, complicacion_intraqx.valor AS complicacion_intraqx,
        c.cierre_esternal_diferido, c.extubacion_quirofano, unidad_pop.valor AS unidad_pop, po.horas_ventilacion_mecanica,
        complicacion_pop.valor AS complicacion_pop, po.fecha_traslado_intermedio, po.dias_estancia_uci, po.fecha_salida,
        po.dias_hospitalizacion_total, condicion_salida.valor AS condicion_salida,
        s.fecha_control_cirugia, s.rehabilitacion_cardiaca, estado_herida.valor AS estado_herida, s.llamado_15_dias,
        s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso, causa_reingreso.valor AS causa_reingreso, s.observaciones
      FROM pacientes_adultos p
      LEFT JOIN diagnosticos_adultos d ON d.paciente_id = p.id
      LEFT JOIN cirugias_adultos c ON c.paciente_id = p.id
      LEFT JOIN postoperatorio_adultos po ON po.paciente_id = p.id
      LEFT JOIN seguimientos_adultos s ON s.paciente_id = p.id
      LEFT JOIN opciones_lista sexo ON sexo.id = p.sexo_id
      LEFT JOIN opciones_lista procedencia ON procedencia.id = p.procedencia_id
      LEFT JOIN opciones_lista municipio ON municipio.id = p.municipio_narino_id
      LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
      LEFT JOIN opciones_lista diagnostico ON diagnostico.id = d.diagnostico_id
      LEFT JOIN opciones_lista valvulopatia ON valvulopatia.id = d.valvulopatia_id
      LEFT JOIN opciones_lista implante ON implante.id = c.implante_id
      LEFT JOIN opciones_lista complicacion_intraqx ON complicacion_intraqx.id = c.complicacion_intraqx_id
      LEFT JOIN opciones_lista unidad_pop ON unidad_pop.id = po.unidad_pop_id
      LEFT JOIN opciones_lista complicacion_pop ON complicacion_pop.id = po.complicacion_pop_id
      LEFT JOIN opciones_lista condicion_salida ON condicion_salida.id = po.condicion_salida_id
      LEFT JOIN opciones_lista estado_herida ON estado_herida.id = s.estado_herida_id
      LEFT JOIN opciones_lista causa_reingreso ON causa_reingreso.id = s.causa_reingreso_id
      WHERE p.eliminado = 0
      ORDER BY p.numero_paciente`)
    res.json(filas)
  } finally {
    conexion.release()
  }
}))
