// Alertas, indicadores y exportación (solo lectura).
import { Router } from 'express'
import { hoyBogota, pool, todas, una } from './db.mjs'
import { asincrono, noEncontrado, validacion } from './errores.mjs'
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

/** Percentil por interpolación lineal sobre valores ya ordenados: el mismo método de CUARTIL.INC
 * de Excel, para que la matriz de resumen coincida con lo que el equipo calcule en una hoja. */
function percentil(ordenados, p) {
  const posicion = (ordenados.length - 1) * p
  const base = Math.floor(posicion)
  const siguiente = ordenados[base + 1]
  return siguiente === undefined ? ordenados[base] : ordenados[base] + (posicion - base) * (siguiente - ordenados[base])
}

/** Medidas de resumen de una variable numérica, sin contar los vacíos: n, promedio, mediana, rango
 * intercuartílico (q1–q3) y rango (mínimo–máximo). Sin ningún dato, todo queda en null. */
function resumenNumerico(valores, decimales = 1) {
  const v = valores.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  if (!v.length) return { n: 0, promedio: null, mediana: null, q1: null, q3: null, minimo: null, maximo: null }
  return {
    n: v.length,
    promedio: redondear(v.reduce((a, b) => a + b, 0) / v.length, decimales),
    mediana: redondear(percentil(v, 0.5), decimales),
    q1: redondear(percentil(v, 0.25), decimales),
    q3: redondear(percentil(v, 0.75), decimales),
    minimo: redondear(v[0], decimales),
    maximo: redondear(v[v.length - 1], decimales),
  }
}

/** Área de superficie corporal en m² a partir del peso: (peso kg × 4 + 7) ÷ (peso kg + 90). */
const superficieCorporal = (pesoKg) => (pesoKg ? (pesoKg * 4 + 7) / (pesoKg + 90) : null)

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

// ---------------------------------------------------------------------------------------------
// Tablero dinámico: al hacer clic en una categoría de cualquier gráfico, todo el tablero se
// recalcula solo con esos pacientes. Cada fila es un paciente operado (cirugias, diagnosticos,
// postoperatorio y seguimientos tienen paciente_id UNIQUE), así que contar filas es contar pacientes.
// ---------------------------------------------------------------------------------------------

/** Campos filtrables: uno por gráfico, y el filtro usa exactamente la etiqueta que ese gráfico muestra. */
const CAMPOS_FILTRO = [
  'mes', 'riesgo', 'diagnostico', 'procedimiento', 'eps', 'procedencia', 'sexo', 'peso', 'talla', 'superficie',
  'dias_uci', 'horas_vm', 'estado_herida', 'herida_grupo',
]

function leerFiltros(texto) {
  if (texto === undefined || texto === '') return []
  let filtros
  try {
    filtros = JSON.parse(texto)
  } catch {
    throw validacion('Los filtros no tienen un formato válido.')
  }
  const validos = Array.isArray(filtros) && filtros.length <= 20 && filtros.every((f) =>
    f && CAMPOS_FILTRO.includes(f.campo) && typeof f.valor === 'string' && f.valor.length <= 300)
  if (!validos) throw validacion('Los filtros no tienen un formato válido.')
  return filtros.map(({ campo, valor }) => ({ campo, valor }))
}

function leerConsulta(req) {
  const { desde, hasta, filtros } = req.query
  if (!esFechaIso(desde) || !esFechaIso(hasta)) throw validacion('Indique desde y hasta con formato aaaa-mm-dd.')
  return { desde, hasta, filtros: leerFiltros(filtros) }
}

/** Etiqueta del rango donde cae un valor, con el mismo corte que distribucion() (o "Sin dato"). */
function etiquetaRango(valor, rangos) {
  if (valor === null || valor === undefined) return 'Sin dato'
  return rangos[rangos.findIndex((r) => r.hasta === undefined || valor < r.hasta)].etiqueta
}

/**
 * El estado de la herida tiene 11 opciones, pero la lectura clínica es "¿cicatrizó bien?": adecuada,
 * con alguna alteración, no aplica o sin registrar. La opción adecuada y "N/A" se reconocen por su
 * texto porque el catálogo no les da un código estable (mismo criterio que la valvulopatía).
 */
const GRUPOS_HERIDA = ['adecuada', 'alteracion', 'no_aplica', 'sin_registrar']
function grupoHerida(estado) {
  if (estado === null || estado === undefined) return 'sin_registrar'
  if (/adecuad/i.test(estado)) return 'adecuada'
  if (/^(n\/?a|no aplica)$/i.test(estado.trim())) return 'no_aplica'
  return 'alteracion'
}

/** Etiquetas de un paciente en cada campo filtrable: las mismas que muestran los gráficos. */
function etiquetarFila(f, rangos) {
  const superficie = superficieCorporal(f.peso_kg)
  // Los fallecidos no tienen seguimiento: no entran en el estado de la herida ni en su filtro.
  const conSeguimiento = !f.seguimiento_no_aplica
  return {
    ...f,
    superficie,
    etiquetas: {
      mes: f.fecha_cirugia.slice(0, 7),
      riesgo: f.riesgo,
      diagnostico: f.diagnostico ?? 'Sin diagnóstico',
      eps: f.eps ?? 'Sin EPS',
      procedencia: f.procedencia ?? 'Sin procedencia',
      sexo: f.sexo ?? 'Sin dato',
      peso: etiquetaRango(f.peso_kg, rangos.peso),
      talla: etiquetaRango(f.talla_cm, rangos.talla),
      superficie: etiquetaRango(superficie, rangos.superficie),
      dias_uci: etiquetaRango(f.dias_uci, RANGOS_DIAS_UCI),
      horas_vm: etiquetaRango(f.horas_vm, RANGOS_HORAS_VM),
      estado_herida: conSeguimiento ? (f.estado_herida ?? 'Sin registrar') : null,
      herida_grupo: conSeguimiento ? grupoHerida(f.estado_herida) : null,
    },
  }
}

const cumple = (fila, filtro) =>
  filtro.campo === 'procedimiento' ? fila.procedimientos.has(filtro.valor) : fila.etiquetas[filtro.campo] === filtro.valor

/** Pares (cantidad por etiqueta) de mayor a menor, y en orden alfabético los empates. */
function contarEtiquetas(filas, campo) {
  const conteo = new Map()
  for (const f of filas) conteo.set(f.etiquetas[campo], (conteo.get(f.etiquetas[campo]) ?? 0) + 1)
  return [...conteo.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
}

/** Procedimientos de cada cirugía del periodo (cirugia_id → Set), para contarlos y filtrar por ellos.
 * Los nombres de tabla son fijos, nunca vienen de la petición. */
async function procedimientosPorCirugia(tablas, desde, hasta) {
  const pares = await todas(pool, `
    SELECT cp.cirugia_id, o.valor AS procedimiento
    FROM ${tablas.cirugias} c
    JOIN ${tablas.pacientes} p ON p.id = c.paciente_id
    JOIN ${tablas.procedimientos} cp ON cp.cirugia_id = c.id
    JOIN opciones_lista o ON o.id = cp.procedimiento_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia BETWEEN ? AND ?`, [desde, hasta])
  const mapa = new Map()
  for (const { cirugia_id, procedimiento } of pares) {
    if (!mapa.has(cirugia_id)) mapa.set(cirugia_id, new Set())
    mapa.get(cirugia_id).add(procedimiento)
  }
  return mapa
}

/**
 * Todos los indicadores de un grupo a partir de sus pacientes operados en el periodo. Con filtros,
 * los totales, las tasas y los tiempos usan solo a los pacientes que cumplen todos. Cada gráfico, en
 * cambio, ignora el filtro de su propio campo: así el gráfico donde se hizo clic sigue mostrando
 * todas sus categorías (con la elegida resaltada en la pantalla) y los demás muestran solo a esos
 * pacientes, como en Power BI. El estado de la herida no cuenta a los fallecidos.
 */
function calcularIndicadores({ filas, filtros, rangos, formatearRiesgo, resumenExtra = () => ({}) }) {
  const filtradas = (...excepto) =>
    filas.filter((f) => filtros.every((filtro) => excepto.includes(filtro.campo) || cumple(f, filtro)))

  const pacientes = filtradas()
  const total = pacientes.length
  const cuenta = (fn) => pacientes.filter(fn).length
  const columna = (lista, clave) => lista.map((f) => f[clave])

  const porMes = new Map()
  for (const f of filtradas('mes')) {
    const [anio, mes] = f.fecha_cirugia.split('-').map(Number)
    const clave = `${anio}-${mes}`
    porMes.set(clave, { anio, mes, total_cirugias: (porMes.get(clave)?.total_cirugias ?? 0) + 1 })
  }

  const porProcedimiento = new Map()
  for (const f of filtradas('procedimiento')) {
    for (const p of f.procedimientos) porProcedimiento.set(p, (porProcedimiento.get(p) ?? 0) + 1)
  }

  const riesgo = new Map()
  for (const f of filtradas('riesgo')) {
    const acumulado = riesgo.get(f.riesgo) ?? { total: 0, muertes: 0 }
    acumulado.total += 1
    if (f.muerte) acumulado.muertes += 1
    riesgo.set(f.riesgo, acumulado)
  }

  const herida = filtradas('estado_herida', 'herida_grupo').filter((f) => !f.seguimiento_no_aplica)
  const peso = filtradas('peso')
  const talla = filtradas('talla')
  const superficie = filtradas('superficie')
  const diasUci = filtradas('dias_uci')
  const horasVm = filtradas('horas_vm')

  return {
    resumen: {
      total_cirugias: total,
      mortalidad_hospitalaria_pct: porcentaje(cuenta((f) => f.muerte), total),
      dias_uci_promedio: promedio(columna(pacientes, 'dias_uci')),
      dias_uci_mediana: mediana(columna(pacientes, 'dias_uci')),
      dias_hospitalizacion_promedio: promedio(columna(pacientes, 'dias_hosp')),
      dias_hospitalizacion_mediana: mediana(columna(pacientes, 'dias_hosp')),
      horas_ventilacion_promedio: promedio(columna(pacientes, 'horas_vm')),
      horas_ventilacion_mediana: mediana(columna(pacientes, 'horas_vm')),
      tasa_complicacion_intraqx_pct: porcentaje(cuenta((f) => f.comp_intraqx), total),
      tasa_complicacion_pop_pct: porcentaje(cuenta((f) => f.comp_pop), total),
      tasa_reingreso_30d_pct: porcentaje(cuenta((f) => f.reingreso), total),
      tiempo_cec_promedio: promedio(columna(pacientes, 'tiempo_cec_min')),
      tiempo_clamp_promedio: promedio(columna(pacientes, 'tiempo_clamp_min')),
      ...resumenExtra(pacientes),
    },
    por_mes: [...porMes.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes),
    por_diagnostico: contarEtiquetas(filtradas('diagnostico'), 'diagnostico').map(([diagnostico, n]) => ({ diagnostico, total_cirugias: n })),
    por_procedimiento: [...porProcedimiento.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([procedimiento, n]) => ({ procedimiento, total_cirugias: n })),
    ...formatearRiesgo(riesgo),
    por_eps: contarEtiquetas(filtradas('eps'), 'eps').map(([eps, n]) => ({ eps, total_cirugias: n })),
    por_procedencia: contarEtiquetas(filtradas('procedencia'), 'procedencia').map(([procedencia, n]) => ({ procedencia, total_cirugias: n })),
    por_sexo: conteoNominal(columna(filtradas('sexo'), 'sexo'), 'Sin dato'),
    por_peso: distribucion(columna(peso, 'peso_kg'), rangos.peso),
    por_talla: distribucion(columna(talla, 'talla_cm'), rangos.talla),
    por_superficie_corporal: distribucion(columna(superficie, 'superficie'), rangos.superficie),
    por_dias_uci: distribucion(columna(diasUci, 'dias_uci'), RANGOS_DIAS_UCI),
    por_horas_vm: distribucion(columna(horasVm, 'horas_vm'), RANGOS_HORAS_VM),
    por_estado_herida: conteoNominal(columna(herida, 'estado_herida'), 'Sin registrar'),
    // La dona del tablero: los mismos pacientes, agrupados con la regla de grupoHerida().
    por_herida_grupo: GRUPOS_HERIDA.map((grupo) => {
      const delGrupo = herida.filter((f) => f.etiquetas.herida_grupo === grupo)
      return { grupo, total: delGrupo.length, categorias: conteoNominal(columna(delGrupo, 'estado_herida'), 'Sin registrar') }
    }),
    // Matriz de resumen: cada variable numérica con su mediana, RIC y rango (sobre los mismos
    // pacientes que su gráfico).
    estadisticas: {
      peso: resumenNumerico(columna(peso, 'peso_kg')),
      talla: resumenNumerico(columna(talla, 'talla_cm')),
      superficie_corporal: resumenNumerico(columna(superficie, 'superficie'), 2),
      dias_uci: resumenNumerico(columna(diasUci, 'dias_uci')),
      horas_vm: resumenNumerico(columna(horasVm, 'horas_vm')),
    },
  }
}

const formatearRiesgoPediatrico = (riesgo) => ({
  por_rachs: [...riesgo.entries()]
    .sort((a, b) => (a[0] === 'Sin RACHS') - (b[0] === 'Sin RACHS') || a[0].localeCompare(b[0]))
    .map(([nombre, r]) => ({ rachs: nombre, total_cirugias: r.total, fallecidos: r.muertes, mortalidad_pct: porcentaje(r.muertes, r.total) })),
})

/**
 * Matriz de resumen por paciente: una fila por paciente operado con sus variables, con todos los
 * filtros aplicados (es una lista, no un gráfico: aquí no aplica el "ignorar su propio filtro"), en
 * orden de fecha de cirugía. Las etiquetas van para que un clic en un valor filtre el tablero.
 */
function listarPacientes(filas, filtros) {
  const campos = ['sexo', 'procedencia', 'peso', 'talla', 'superficie', 'dias_uci', 'horas_vm', 'estado_herida']
  return filas
    .filter((f) => filtros.every((filtro) => cumple(f, filtro)))
    .sort((a, b) => a.fecha_cirugia.localeCompare(b.fecha_cirugia) || a.numero_paciente - b.numero_paciente)
    .map((f) => ({
      paciente_id: f.paciente_id,
      numero_paciente: f.numero_paciente,
      // Documento del paciente: la matriz permite buscar por él.
      identificacion: f.identificacion,
      fecha_cirugia: f.fecha_cirugia,
      sexo: f.sexo,
      procedencia: f.procedencia,
      peso_kg: f.peso_kg,
      talla_cm: f.talla_cm,
      // Sin redondear: la matriz calcula su mediana con los mismos valores que el servidor.
      superficie_corporal: f.superficie,
      dias_uci: f.dias_uci,
      horas_vm: f.horas_vm,
      estado_herida: f.seguimiento_no_aplica ? null : f.estado_herida,
      seguimiento_no_aplica: Boolean(f.seguimiento_no_aplica),
      etiquetas: Object.fromEntries(campos.map((campo) => [campo, f.etiquetas[campo]])),
    }))
}

/** Pacientes pediátricos operados en el periodo, cada uno con sus etiquetas para filtrar. */
async function cargarPediatricos(desde, hasta) {
  const crudas = await todas(pool, `
    SELECT p.id AS paciente_id, p.numero_paciente, p.identificacion, c.id AS cirugia_id, c.fecha_cirugia, c.tiempo_cec_min, c.tiempo_clamp_min,
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
  const procedimientos = await procedimientosPorCirugia(
    { cirugias: 'cirugias', pacientes: 'pacientes', procedimientos: 'cirugias_procedimientos' }, desde, hasta)

  return crudas.map((f) => etiquetarFila({
    ...f,
    riesgo: f.rachs ?? 'Sin RACHS',
    procedimientos: procedimientos.get(f.cirugia_id) ?? new Set(),
  }, RANGOS_PEDIATRICOS))
}

rutasIndicadores.get('/', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  const filas = await cargarPediatricos(desde, hasta)
  res.json(calcularIndicadores({ filas, filtros, rangos: RANGOS_PEDIATRICOS, formatearRiesgo: formatearRiesgoPediatrico }))
}))

rutasIndicadores.get('/pacientes', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  res.json({ pacientes: listarPacientes(await cargarPediatricos(desde, hasta), filtros) })
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

const formatearRiesgoAdultos = (riesgo) => ({
  por_euroscore: ORDEN_EUROSCORE.filter((c) => riesgo.has(c)).map((c) => {
    const r = riesgo.get(c)
    return { categoria: c, total_cirugias: r.total, fallecidos: r.muertes, mortalidad_pct: porcentaje(r.muertes, r.total) }
  }),
})

/** Pacientes adultos operados en el periodo, cada uno con sus etiquetas para filtrar. */
async function cargarAdultos(desde, hasta) {
  const crudas = await todas(pool, `
    SELECT p.id AS paciente_id, p.numero_paciente, p.identificacion, c.id AS cirugia_id, c.fecha_cirugia, c.tiempo_cec_min, c.tiempo_clamp_min,
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
  const procedimientos = await procedimientosPorCirugia(
    { cirugias: 'cirugias_adultos', pacientes: 'pacientes_adultos', procedimientos: 'cirugias_adultos_procedimientos' }, desde, hasta)

  return crudas.map((f) => etiquetarFila({
    ...f,
    riesgo: categoriaEuroscore(f.euroscore),
    procedimientos: procedimientos.get(f.cirugia_id) ?? new Set(),
  }, RANGOS_ADULTOS))
}

rutasIndicadores.get('/adultos', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  res.json(calcularIndicadores({
    filas: await cargarAdultos(desde, hasta),
    filtros,
    rangos: RANGOS_ADULTOS,
    formatearRiesgo: formatearRiesgoAdultos,
    resumenExtra: (pacientes) => ({
      euroscore_promedio: promedio(pacientes.map((f) => f.euroscore)),
      euroscore_mediana: mediana(pacientes.map((f) => f.euroscore)),
    }),
  }))
}))

rutasIndicadores.get('/adultos/pacientes', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  res.json({ pacientes: listarPacientes(await cargarAdultos(desde, hasta), filtros) })
}))

// ---------------------------------------------------------------------------------------------
// Detalle de un paciente para la matriz de resumen: al buscarlo por documento se ve todo lo que se
// le hizo, módulo por módulo, con el texto de cada lista (no su id) y sin nombre ni teléfonos, igual
// que la matriz. Entre pediátricos y adultos cambian las tablas (fijas, nunca vienen de la petición)
// y las pocas columnas propias de cada grupo.
// ---------------------------------------------------------------------------------------------

const DETALLE_PEDIATRICO = {
  tablas: {
    pacientes: 'pacientes', diagnosticos: 'diagnosticos', riesgos: 'diagnosticos_riesgos', cirugias: 'cirugias',
    procedimientos: 'cirugias_procedimientos', postoperatorio: 'postoperatorio', seguimientos: 'seguimientos',
  },
  // Los días de UCI y de hospitalización se calculan de las fechas, igual que en los indicadores.
  columnas: `rc.valor AS rachs, s.fecha_llamada_15_dias,
    CASE WHEN po.fecha_traslado_intermedio IS NOT NULL THEN DATEDIFF(po.fecha_traslado_intermedio, c.fecha_cirugia)
         WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia) END AS dias_uci,
    CASE WHEN po.fecha_salida IS NOT NULL THEN DATEDIFF(po.fecha_salida, c.fecha_cirugia) END AS dias_hospitalizacion`,
  uniones: 'LEFT JOIN opciones_lista rc ON rc.id = d.rachs_id',
  // Cada procedimiento adicional es otra intervención, con su propia fecha.
  fechaProcedimiento: 'CASE cp.orden WHEN 1 THEN c.fecha_cirugia WHEN 2 THEN c.fecha_procedimiento_2 ELSE c.fecha_procedimiento_3 END',
}
const DETALLE_ADULTO = {
  tablas: {
    pacientes: 'pacientes_adultos', diagnosticos: 'diagnosticos_adultos', riesgos: 'diagnosticos_adultos_riesgos',
    cirugias: 'cirugias_adultos', procedimientos: 'cirugias_adultos_procedimientos', postoperatorio: 'postoperatorio_adultos',
    seguimientos: 'seguimientos_adultos',
  },
  columnas: 'd.euroscore, s.llamado_15_dias, po.dias_estancia_uci AS dias_uci, po.dias_hospitalizacion_total AS dias_hospitalizacion',
  uniones: '',
  // Todos los procedimientos son de la misma cirugía.
  fechaProcedimiento: 'c.fecha_cirugia',
}

async function detallePaciente({ tablas, columnas, uniones, fechaProcedimiento }, pacienteId) {
  const ficha = await una(pool, `
    SELECT p.id AS paciente_id, p.numero_paciente, p.identificacion, sx.valor AS sexo, p.fecha_nacimiento,
      DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_cirugia_dias, p.peso_kg, p.talla_cm,
      pr.valor AS procedencia, mu.valor AS municipio_narino, eps.valor AS eps,
      dg.valor AS diagnostico, va.valor AS valvulopatia,
      c.fecha_cirugia, im.valor AS implante, c.numero_implante, c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min,
      ci.valor AS complicacion_intraqx, c.cierre_esternal_diferido, c.extubacion_quirofano,
      up.valor AS unidad_pop, po.horas_ventilacion_mecanica, cpo.valor AS complicacion_pop, po.fecha_traslado_intermedio,
      po.fecha_salida, cs.valor AS condicion_salida,
      (s.no_aplica = 1) AS seguimiento_no_aplica, s.fecha_control_cirugia, s.rehabilitacion_cardiaca, eh.valor AS estado_herida,
      s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso, cr.valor AS causa_reingreso, s.observaciones,
      ${columnas}
    FROM ${tablas.pacientes} p
    LEFT JOIN ${tablas.diagnosticos} d ON d.paciente_id = p.id
    LEFT JOIN ${tablas.cirugias} c ON c.paciente_id = p.id
    LEFT JOIN ${tablas.postoperatorio} po ON po.paciente_id = p.id
    LEFT JOIN ${tablas.seguimientos} s ON s.paciente_id = p.id
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    LEFT JOIN opciones_lista mu ON mu.id = p.municipio_narino_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista va ON va.id = d.valvulopatia_id
    LEFT JOIN opciones_lista im ON im.id = c.implante_id
    LEFT JOIN opciones_lista ci ON ci.id = c.complicacion_intraqx_id
    LEFT JOIN opciones_lista up ON up.id = po.unidad_pop_id
    LEFT JOIN opciones_lista cpo ON cpo.id = po.complicacion_pop_id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
    LEFT JOIN opciones_lista cr ON cr.id = s.causa_reingreso_id
    ${uniones}
    WHERE p.eliminado = 0 AND p.id = ?`, [pacienteId])
  if (!ficha) throw noEncontrado('No se encontró el paciente.')

  const [riesgos, procedimientos] = await Promise.all([
    todas(pool, `
      SELECT o.valor
      FROM ${tablas.riesgos} dr
      JOIN ${tablas.diagnosticos} d ON d.id = dr.diagnostico_id
      JOIN opciones_lista o ON o.id = dr.riesgo_id
      WHERE d.paciente_id = ?
      ORDER BY o.orden, o.valor`, [pacienteId]),
    todas(pool, `
      SELECT o.valor AS procedimiento, ${fechaProcedimiento} AS fecha
      FROM ${tablas.procedimientos} cp
      JOIN ${tablas.cirugias} c ON c.id = cp.cirugia_id
      JOIN opciones_lista o ON o.id = cp.procedimiento_id
      WHERE c.paciente_id = ?
      ORDER BY cp.orden`, [pacienteId]),
  ])

  return {
    ...ficha,
    superficie_corporal: superficieCorporal(ficha.peso_kg),
    seguimiento_no_aplica: Boolean(ficha.seguimiento_no_aplica),
    riesgos: riesgos.map((r) => r.valor),
    procedimientos,
  }
}

rutasIndicadores.get('/pacientes/:id', asincrono(async (req, res) => {
  res.json(await detallePaciente(DETALLE_PEDIATRICO, req.params.id))
}))

rutasIndicadores.get('/adultos/pacientes/:id', asincrono(async (req, res) => {
  res.json(await detallePaciente(DETALLE_ADULTO, req.params.id))
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
