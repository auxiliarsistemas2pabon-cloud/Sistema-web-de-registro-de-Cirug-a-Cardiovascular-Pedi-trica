// Alertas, indicadores y exportación (solo lectura).
import { Router } from 'express'
import { hoyBogota, pool, todas, una } from './db.mjs'
import { asincrono, noEncontrado, validacion } from './errores.mjs'
import { sqlDiasHospitalizacion, sqlDiasUci } from './servicios.mjs'
import { esFechaIso, textoEdad } from './validar.mjs'

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
    SELECT p.id AS paciente_id, po.episodio_id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'llamada_15_dias' AS tipo_alerta, DATE_ADD(po.fecha_salida, INTERVAL 15 DAY) AS fecha_referencia,
           DATEDIFF(?, DATE_ADD(po.fecha_salida, INTERVAL 15 DAY)) AS dias_desde_referencia
    FROM postoperatorio_adultos po
    JOIN episodios_adultos ep ON ep.id = po.episodio_id
    JOIN pacientes_adultos p ON p.id = ep.paciente_id
    JOIN seguimientos_adultos s ON s.episodio_id = po.episodio_id
    WHERE p.eliminado = 0 AND s.no_aplica = 0 AND (s.llamado_15_dias IS NULL OR s.llamado_15_dias <> 'SI') AND po.fecha_salida IS NOT NULL
    UNION ALL
    SELECT p.id, po.episodio_id, p.numero_paciente, p.nombre_completo, p.identificacion,
           'seguimiento_pendiente_alta', po.fecha_salida, DATEDIFF(?, po.fecha_salida)
    FROM postoperatorio_adultos po
    JOIN episodios_adultos ep ON ep.id = po.episodio_id
    JOIN pacientes_adultos p ON p.id = ep.paciente_id
    JOIN seguimientos_adultos s ON s.episodio_id = po.episodio_id
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
const RANGOS_DIAS_HOSP = [
  { hasta: 4, etiqueta: '0–3 días' }, { hasta: 8, etiqueta: '4–7 días' }, { hasta: 15, etiqueta: '8–14 días' },
  { hasta: 22, etiqueta: '15–21 días' }, { hasta: 31, etiqueta: '22–30 días' }, { etiqueta: '>30 días' },
]
const RANGOS_CEC = [
  { hasta: 60, etiqueta: '<60 min' }, { hasta: 90, etiqueta: '60–89 min' }, { hasta: 120, etiqueta: '90–119 min' },
  { hasta: 150, etiqueta: '120–149 min' }, { hasta: 180, etiqueta: '150–179 min' }, { etiqueta: '≥180 min' },
]
const RANGOS_CLAMP = [
  { hasta: 30, etiqueta: '<30 min' }, { hasta: 60, etiqueta: '30–59 min' }, { hasta: 90, etiqueta: '60–89 min' },
  { hasta: 120, etiqueta: '90–119 min' }, { etiqueta: '≥120 min' },
]

// La edad se agrupa por etapas, no por un número fijo de años: en niños importa si es neonato o
// lactante (los cortes van en días y meses cumplidos), y en adultos, la década.
const EDADES_PEDIATRICAS = ['Neonato (<28 días)', 'Lactante (1–11 meses)', '1–4 años', '5–9 años', '10–14 años', '≥15 años']
function edadPediatrica({ edad_dias: dias, edad_meses: meses, edad_anios: anios }) {
  if (dias === null || dias === undefined) return 'Sin dato'
  if (dias < 28) return EDADES_PEDIATRICAS[0]
  if (meses < 12) return EDADES_PEDIATRICAS[1]
  if (anios < 5) return EDADES_PEDIATRICAS[2]
  if (anios < 10) return EDADES_PEDIATRICAS[3]
  if (anios < 15) return EDADES_PEDIATRICAS[4]
  return EDADES_PEDIATRICAS[5]
}
const EDADES_ADULTOS = ['18–39 años', '40–49 años', '50–59 años', '60–69 años', '70–79 años', '≥80 años']
function edadAdulto({ edad_anios: anios }) {
  if (anios === null || anios === undefined) return 'Sin dato'
  if (anios < 40) return EDADES_ADULTOS[0]
  if (anios < 80) return EDADES_ADULTOS[Math.floor(anios / 10) - 3]
  return EDADES_ADULTOS[5]
}

/** Las preguntas Sí/No de la ficha (uso de CEC, extubación en quirófano, rehabilitación…), en el
 * orden fijo en que se grafican. */
const ORDEN_SI_NO = ['Sí', 'No', 'No aplica', 'Sin dato']
/** Opción "N/A" de una lista (o vacía). */
const noAplica = (valor) => valor === null || valor === undefined || /^n\/?a$/i.test(valor.trim())

const textoSiNo = (valor) => ({ SI: 'Sí', NO: 'No', NA: 'No aplica' })[valor] ?? 'Sin dato'

/** Edad en años con decimales, para su mediana (las etapas usan los días, meses y años cumplidos). */
const edadDecimal = (f) => (f.edad_dias === null || f.edad_dias === undefined ? null : f.edad_dias / 365.25)

// ---------------------------------------------------------------------------------------------
// Tablero dinámico: al hacer clic en una categoría de cualquier gráfico, todo el tablero se
// recalcula solo con esos pacientes. Cada fila es un paciente operado (cirugias, diagnosticos,
// postoperatorio y seguimientos tienen paciente_id UNIQUE), así que contar filas es contar pacientes.
// ---------------------------------------------------------------------------------------------

/** Campos de selección múltiple: un paciente puede tener varios valores (diagnóstico principal y
 * adicional, varios procedimientos, cada uno con su implante, factores de riesgo o complicaciones), así
 * que cuenta en cada barra que le corresponda. */
const CAMPOS_MULTIPLES = ['diagnostico', 'valvulopatia', 'procedimiento', 'implante', 'factor_riesgo', 'complicacion_intraqx', 'complicacion_pop']

/** Campos filtrables: uno por gráfico, y el filtro usa exactamente la etiqueta que ese gráfico muestra. */
const CAMPOS_FILTRO = [
  'mes', 'anio', 'riesgo', 'eps', 'procedencia', 'municipio', 'sexo', 'edad',
  'peso', 'talla', 'superficie', 'uso_cec', 'tiempo_cec', 'tiempo_clamp', 'cierre_esternal', 'extubacion',
  'unidad_pop', 'dias_uci', 'horas_vm', 'dias_hosp', 'condicion_salida', 'rehabilitacion', 'estado_herida', 'herida_grupo',
  'reingreso', 'causa_reingreso', ...CAMPOS_MULTIPLES,
]

/** Los indicadores clave con tasa, y qué pacientes son sus casos: al hacer clic en uno se ve el detalle
 * de esos pacientes (ver /casos más abajo). */
const INDICADORES = {
  mortalidad: (f) => Boolean(f.muerte),
  complicacion_intraqx: (f) => Boolean(f.comp_intraqx),
  complicacion_pop: (f) => Boolean(f.comp_pop),
  reingreso: (f) => Boolean(f.reingreso),
}

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

/** Rango de fechas y filtros del tablero; para el detalle de un indicador, también cuál y, si se hizo
 * clic en un mes de su gráfico, ese mes ("2026-05"). */
function leerConsulta(req) {
  const { desde, hasta, filtros, indicador, mes } = req.query
  if (!esFechaIso(desde) || !esFechaIso(hasta)) throw validacion('Indique desde y hasta con formato aaaa-mm-dd.')
  if (indicador !== undefined && !Object.hasOwn(INDICADORES, indicador)) throw validacion('Indicador no válido.')
  if (mes !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw validacion('Indique el mes con formato aaaa-mm.')
  return { desde, hasta, filtros: leerFiltros(filtros), indicador, mes }
}

/** Los pacientes de una lista (no de un gráfico): con todos los filtros, del mes elegido y, si se pidió
 * un indicador, solo sus casos — en orden de fecha de cirugía. */
function seleccionarPacientes(filas, { filtros, indicador, mes }) {
  return filas
    .filter((f) => filtros.every((filtro) => cumple(f, filtro)))
    .filter((f) => !mes || f.etiquetas.mes === mes)
    .filter((f) => !indicador || INDICADORES[indicador](f))
    .sort((a, b) => a.fecha_cirugia.localeCompare(b.fecha_cirugia) || a.numero_paciente - b.numero_paciente)
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
  // Los tiempos de CEC y de clamp solo se cuentan en las cirugías con circulación extracorpórea: en
  // las demás no es un dato faltante, es que no aplica.
  const conCec = f.uso_cec !== 'NO'
  return {
    ...f,
    superficie,
    // Etiqueta null: el paciente no entra en ese gráfico (p. ej. el municipio de quien no es de Nariño).
    etiquetas: {
      mes: f.fecha_cirugia.slice(0, 7),
      anio: f.fecha_cirugia.slice(0, 4),
      riesgo: f.riesgo,
      eps: f.eps ?? 'Sin EPS',
      procedencia: f.procedencia ?? 'Sin procedencia',
      municipio: f.procedencia_codigo === 'NARINO' ? (f.municipio ?? 'Sin municipio') : null,
      sexo: f.sexo ?? 'Sin dato',
      edad: f.edad,
      peso: etiquetaRango(f.peso_kg, rangos.peso),
      talla: etiquetaRango(f.talla_cm, rangos.talla),
      superficie: etiquetaRango(superficie, rangos.superficie),
      uso_cec: textoSiNo(f.uso_cec),
      tiempo_cec: conCec ? etiquetaRango(f.tiempo_cec_min, RANGOS_CEC) : null,
      tiempo_clamp: conCec ? etiquetaRango(f.tiempo_clamp_min, RANGOS_CLAMP) : null,
      cierre_esternal: textoSiNo(f.cierre_esternal_diferido),
      extubacion: textoSiNo(f.extubacion_quirofano),
      unidad_pop: f.unidad_pop ?? 'Sin dato',
      dias_uci: etiquetaRango(f.dias_uci, RANGOS_DIAS_UCI),
      horas_vm: etiquetaRango(f.horas_vm, RANGOS_HORAS_VM),
      dias_hosp: etiquetaRango(f.dias_hosp, RANGOS_DIAS_HOSP),
      condicion_salida: f.condicion_salida ?? 'Sin registrar',
      rehabilitacion: conSeguimiento ? textoSiNo(f.rehabilitacion_cardiaca) : null,
      estado_herida: conSeguimiento ? (f.estado_herida ?? 'Sin registrar') : null,
      herida_grupo: conSeguimiento ? grupoHerida(f.estado_herida) : null,
      reingreso: conSeguimiento ? textoSiNo(f.reingreso_30_dias) : null,
      causa_reingreso: f.reingreso_30_dias === 'SI' ? (f.causa_reingreso ?? 'Sin registrar') : null,
    },
  }
}

const cumple = (fila, filtro) =>
  CAMPOS_MULTIPLES.includes(filtro.campo) ? fila.multiples[filtro.campo].has(filtro.valor) : fila.etiquetas[filtro.campo] === filtro.valor

/** Pares (cantidad por etiqueta) de mayor a menor, y en orden alfabético los empates. Los pacientes
 * con etiqueta null no entran en ese gráfico. */
function contarEtiquetas(filas, campo) {
  const conteo = new Map()
  for (const f of filas) {
    if (f.etiquetas[campo] !== null) conteo.set(f.etiquetas[campo], (conteo.get(f.etiquetas[campo]) ?? 0) + 1)
  }
  return [...conteo.entries()].sort((a, b) => esVacia(a[0]) - esVacia(b[0]) || b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
}
const esVacia = (etiqueta) => /^sin /i.test(etiqueta)

/** Conteo nominal de un campo, de mayor a menor y con la categoría vacía al final. */
const conteoCampo = (filas, campo) => contarEtiquetas(filas, campo).map(([categoria, total_cirugias]) => ({ categoria, total_cirugias }))

/** Conteo de un campo en un orden fijo (etapas de edad, Sí/No): solo las categorías con pacientes. */
function conteoEnOrden(filas, campo, orden) {
  const conteo = new Map(contarEtiquetas(filas, campo))
  return [...orden, 'Sin dato'].filter((c, i, todas) => conteo.has(c) && todas.indexOf(c) === i)
    .map((categoria) => ({ categoria, total_cirugias: conteo.get(categoria) }))
}

/** Conteo de un campo de selección múltiple: cada paciente suma en cada valor que tenga. */
function conteoMultiple(filas, campo) {
  const conteo = new Map()
  for (const f of filas) for (const v of f.multiples[campo]) conteo.set(v, (conteo.get(v) ?? 0) + 1)
  return [...conteo.entries()]
    .sort((a, b) => esVacia(a[0]) - esVacia(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([categoria, total_cirugias]) => ({ categoria, total_cirugias }))
}

/**
 * Edad por tipo de procedimiento (pedido del jefe del servicio, adultos): cuántas cirugías de cada
 * procedimiento hubo en cada grupo de edad. Los grupos van todos, en su orden (más "Sin dato" si hay),
 * para que las columnas no cambien con el periodo; los procedimientos, del más frecuente al menos.
 */
function edadPorProcedimiento(filas, ordenEdad) {
  const porProcedimiento = new Map()
  for (const f of filas) {
    for (const procedimiento of f.multiples.procedimiento) {
      if (!porProcedimiento.has(procedimiento)) porProcedimiento.set(procedimiento, {})
      const porEdad = porProcedimiento.get(procedimiento)
      porEdad[f.etiquetas.edad] = (porEdad[f.etiquetas.edad] ?? 0) + 1
    }
  }
  const filasProcedimiento = [...porProcedimiento.entries()]
    .map(([procedimiento, por_edad]) => ({ procedimiento, total: Object.values(por_edad).reduce((a, b) => a + b, 0), por_edad }))
    .sort((a, b) => b.total - a.total || a.procedimiento.localeCompare(b.procedimiento, 'es'))
  const conSinDato = filasProcedimiento.some((p) => p.por_edad['Sin dato'])
  return { edades: conSinDato ? [...ordenEdad, 'Sin dato'] : [...ordenEdad], filas: filasProcedimiento }
}

/** Las opciones que significan "ninguno" en las listas de selección múltiple: no son un factor de
 * riesgo ni una complicación, así que no tienen barra (el paciente queda sin ninguna). */
const CODIGOS_NINGUNO = new Set(['NINGUNO', 'NINGUNA', 'NO'])

/**
 * Valores de las listas de selección múltiple (id del dueño → Set de textos): procedimientos e
 * implantes por cirugía, factores de riesgo por diagnóstico y complicaciones por cirugía o
 * postoperatorio. Son tablas pequeñas, así que se leen completas. Los nombres de tabla son fijos,
 * nunca vienen de la petición.
 */
async function valoresMultiples(tablas) {
  const leer = async (tabla, dueno, opcion, condicion = '') => {
    const pares = await todas(pool, `
      SELECT t.${dueno} AS id, o.valor, o.codigo FROM ${tabla} t JOIN opciones_lista o ON o.id = t.${opcion} ${condicion}`)
    const mapa = new Map()
    for (const { id, valor, codigo } of pares) {
      if (CODIGOS_NINGUNO.has(codigo)) continue
      if (!mapa.has(id)) mapa.set(id, new Set())
      mapa.get(id).add(valor)
    }
    return mapa
  }
  const [adicionales, valvulopatiaAdicionales, procedimiento, implante, factor_riesgo, complicacion_intraqx, complicacion_pop] = await Promise.all([
    leer(tablas.adicionales, 'diagnostico_id', 'adicional_id'),
    leer(tablas.adicionales, 'diagnostico_id', 'valvulopatia_id'),
    leer(tablas.procedimientos, 'cirugia_id', 'procedimiento_id'),
    // El tipo de implante de cada procedimiento que sí lo llevó.
    leer(tablas.procedimientos, 'cirugia_id', 'tipo_implante_id', "WHERE t.implante = 'SI'"),
    leer(tablas.riesgos, 'diagnostico_id', 'riesgo_id'),
    leer(tablas.complicacionesIntraqx, 'cirugia_id', 'complicacion_id'),
    leer(tablas.complicacionesPop, 'postoperatorio_id', 'complicacion_id'),
  ])
  const vacio = new Set()
  /** Los tipos de valvulopatía del principal y de cada adicional ("N/A" es que no hubo). Si algún
   * diagnóstico es una valvulopatía (por su texto, como la ficha) pero no tiene tipo: "Sin tipo registrado". */
  const valvulopatias = (f) => {
    const tipos = new Set(valvulopatiaAdicionales.get(f.diagnostico_fila_id) ?? [])
    if (f.valvulopatia && !noAplica(f.valvulopatia)) tipos.add(f.valvulopatia)
    if (tipos.size === 0 && /valvulopat/i.test(`${f.diagnostico ?? ''} ${f.diagnosticos_adicionales ?? ''}`)) tipos.add('Sin tipo registrado')
    return tipos
  }
  return (f) => ({
    // El diagnóstico principal y los adicionales cuentan todos; sin ninguno, va en "Sin diagnóstico".
    diagnostico: new Set(f.diagnostico ? [f.diagnostico, ...(adicionales.get(f.diagnostico_fila_id) ?? [])] : ['Sin diagnóstico']),
    valvulopatia: valvulopatias(f),
    procedimiento: procedimiento.get(f.cirugia_id) ?? vacio,
    implante: implante.get(f.cirugia_id) ?? vacio,
    factor_riesgo: factor_riesgo.get(f.diagnostico_fila_id) ?? vacio,
    complicacion_intraqx: complicacion_intraqx.get(f.cirugia_id) ?? vacio,
    complicacion_pop: complicacion_pop.get(f.postoperatorio_id) ?? vacio,
  })
}

/** Las tasas de los indicadores clave en cada mes con cirugías (pedido del 23-oct: mensuales, no
 * trimestrales). Con pocas cirugías al mes una sola muerte mueve mucho la tasa, por eso cada mes lleva
 * sus casos y su total. Un mes sin cirugías no tiene tasa (no es un 0 %), así que no aparece. */
function tasasPorMes(filas) {
  const meses = new Map()
  for (const f of filas) {
    if (!meses.has(f.etiquetas.mes)) meses.set(f.etiquetas.mes, [])
    meses.get(f.etiquetas.mes).push(f)
  }
  return [...meses.keys()].sort().map((mes) => {
    const delMes = meses.get(mes)
    const cuenta = (fn) => delMes.filter(fn).length
    return {
      mes,
      total_cirugias: delMes.length,
      fallecidos: cuenta(INDICADORES.mortalidad),
      complicacion_intraqx: cuenta(INDICADORES.complicacion_intraqx),
      complicacion_pop: cuenta(INDICADORES.complicacion_pop),
      reingresos: cuenta(INDICADORES.reingreso),
    }
  })
}

/**
 * Todos los indicadores de un grupo a partir de sus pacientes operados en el periodo. Con filtros,
 * los totales, las tasas y los tiempos usan solo a los pacientes que cumplen todos. Cada gráfico, en
 * cambio, ignora el filtro de su propio campo: así el gráfico donde se hizo clic sigue mostrando
 * todas sus categorías (con la elegida resaltada en la pantalla) y los demás muestran solo a esos
 * pacientes, como en Power BI. El estado de la herida no cuenta a los fallecidos.
 */
function calcularIndicadores({ filas, filtros, rangos, ordenEdad, formatearRiesgo, resumenExtra = () => ({}) }) {
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
  const diasHosp = filtradas('dias_hosp')
  const edad = filtradas('edad')
  const tiempoCec = filtradas('tiempo_cec').filter((f) => f.etiquetas.tiempo_cec !== null)
  const tiempoClamp = filtradas('tiempo_clamp').filter((f) => f.etiquetas.tiempo_clamp !== null)
  // Base del porcentaje de las listas de selección múltiple: los pacientes, no la suma de barras.
  const multiple = (campo) => {
    const base = filtradas(campo)
    return { pacientes: base.length, con_alguno: base.filter((f) => f.multiples[campo].size).length, conteo: conteoMultiple(base, campo) }
  }

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
      // Los casos detrás de cada tasa, para leerla como "9 de 71 pacientes".
      fallecidos: cuenta((f) => f.muerte),
      con_complicacion_intraqx: cuenta((f) => f.comp_intraqx),
      con_complicacion_pop: cuenta((f) => f.comp_pop),
      reingresos: cuenta((f) => f.reingreso),
      tiempo_cec_promedio: promedio(columna(pacientes, 'tiempo_cec_min')),
      tiempo_cec_mediana: mediana(columna(pacientes, 'tiempo_cec_min')),
      tiempo_clamp_promedio: promedio(columna(pacientes, 'tiempo_clamp_min')),
      tiempo_clamp_mediana: mediana(columna(pacientes, 'tiempo_clamp_min')),
      ...resumenExtra(pacientes),
    },
    por_mes: [...porMes.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes),
    por_anio: conteoCampo(filtradas('anio'), 'anio').sort((a, b) => a.categoria.localeCompare(b.categoria)),
    // Indicadores clave: sus tasas mes a mes, y el detalle de cada uno.
    tasas_por_mes: tasasPorMes(filtradas('mes')),
    por_complicacion_intraqx: multiple('complicacion_intraqx'),
    por_complicacion_pop: multiple('complicacion_pop'),
    por_reingreso: conteoEnOrden(filtradas('reingreso'), 'reingreso', ORDEN_SI_NO),
    por_causa_reingreso: conteoCampo(filtradas('causa_reingreso'), 'causa_reingreso'),
    por_condicion_salida: conteoCampo(filtradas('condicion_salida'), 'condicion_salida'),
    por_diagnostico: multiple('diagnostico'),
    // Un paciente con dos valvulopatías de distinto tipo cuenta en los dos.
    por_valvulopatia: conteoMultiple(filtradas('valvulopatia'), 'valvulopatia'),
    por_factor_riesgo: multiple('factor_riesgo'),
    por_procedimiento: conteoMultiple(filtradas('procedimiento'), 'procedimiento')
      .map(({ categoria, total_cirugias }) => ({ procedimiento: categoria, total_cirugias })),
    // Cruza dos campos, así que ignora el filtro de los dos (como cada gráfico ignora el suyo).
    por_edad_procedimiento: edadPorProcedimiento(filtradas('procedimiento', 'edad'), ordenEdad),
    por_implante: multiple('implante'),
    por_uso_cec: conteoEnOrden(filtradas('uso_cec'), 'uso_cec', ORDEN_SI_NO),
    por_tiempo_cec: distribucion(columna(tiempoCec, 'tiempo_cec_min'), RANGOS_CEC),
    por_tiempo_clamp: distribucion(columna(tiempoClamp, 'tiempo_clamp_min'), RANGOS_CLAMP),
    por_cierre_esternal: conteoEnOrden(filtradas('cierre_esternal'), 'cierre_esternal', ORDEN_SI_NO),
    por_extubacion: conteoEnOrden(filtradas('extubacion'), 'extubacion', ORDEN_SI_NO),
    por_unidad_pop: conteoCampo(filtradas('unidad_pop'), 'unidad_pop'),
    por_dias_hosp: distribucion(columna(diasHosp, 'dias_hosp'), RANGOS_DIAS_HOSP),
    por_rehabilitacion: conteoEnOrden(filtradas('rehabilitacion'), 'rehabilitacion', ORDEN_SI_NO),
    por_edad: conteoEnOrden(edad, 'edad', ordenEdad),
    por_municipio: conteoCampo(filtradas('municipio'), 'municipio'),
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
      dias_hosp: resumenNumerico(columna(diasHosp, 'dias_hosp')),
      edad_anios: resumenNumerico(columna(edad, 'edad_anios_decimal')),
      tiempo_cec: resumenNumerico(columna(tiempoCec, 'tiempo_cec_min')),
      tiempo_clamp: resumenNumerico(columna(tiempoClamp, 'tiempo_clamp_min')),
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
  return seleccionarPacientes(filas, { filtros })
    .map((f) => ({
      paciente_id: f.paciente_id,
      cirugia_id: f.cirugia_id,
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
      ${sqlDiasUci('c', 'po')} AS dias_uci, ${sqlDiasHospitalizacion('c', 'po')} AS dias_hosp,
      po.horas_ventilacion_mecanica AS horas_vm,
      (cs.codigo = 'MUERTE') AS muerte,
      EXISTS (
        SELECT 1 FROM cirugias_complicaciones_intraqx cci JOIN opciones_lista o ON o.id = cci.complicacion_id
        WHERE cci.cirugia_id = c.id AND (o.codigo IS NULL OR o.codigo <> 'NINGUNA')
      ) AS comp_intraqx,
      EXISTS (
        SELECT 1 FROM postoperatorio_complicaciones_pop cpp JOIN opciones_lista o ON o.id = cpp.complicacion_id
        WHERE cpp.postoperatorio_id = po.id AND (o.codigo IS NULL OR o.codigo <> 'NO')
      ) AS comp_pop,
      (s.reingreso_30_dias = 'SI') AS reingreso,
      dg.valor AS diagnostico, ${listaDiagnosticosAdicionales('diagnosticos_adicionales', false)} AS diagnosticos_adicionales, rc.valor AS rachs, eps.valor AS eps, pr.valor AS procedencia,
      p.peso_kg, p.talla_cm, sx.valor AS sexo, eh.valor AS estado_herida, (s.no_aplica = 1) AS seguimiento_no_aplica,
      d.id AS diagnostico_fila_id, po.id AS postoperatorio_id,
      DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_dias,
      TIMESTAMPDIFF(MONTH, p.fecha_nacimiento, c.fecha_cirugia) AS edad_meses,
      TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, c.fecha_cirugia) AS edad_anios,
      pr.codigo AS procedencia_codigo, mu.valor AS municipio, va.valor AS valvulopatia,
      c.uso_cec, c.cierre_esternal_diferido, c.extubacion_quirofano, up.valor AS unidad_pop, cs.valor AS condicion_salida,
      s.rehabilitacion_cardiaca, s.reingreso_30_dias, cr.valor AS causa_reingreso
    FROM cirugias c
    JOIN pacientes p ON p.id = c.paciente_id
    LEFT JOIN diagnosticos d ON d.paciente_id = p.id
    LEFT JOIN postoperatorio po ON po.paciente_id = p.id
    LEFT JOIN seguimientos s ON s.paciente_id = p.id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista rc ON rc.id = d.rachs_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
    LEFT JOIN opciones_lista mu ON mu.id = p.municipio_narino_id
    LEFT JOIN opciones_lista va ON va.id = d.valvulopatia_id
    LEFT JOIN opciones_lista up ON up.id = po.unidad_pop_id
    LEFT JOIN opciones_lista cr ON cr.id = s.causa_reingreso_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia IS NOT NULL AND c.fecha_cirugia BETWEEN ? AND ?`, [desde, hasta])
  const multiples = await valoresMultiples(DETALLE_PEDIATRICO.tablas)

  return crudas.map((f) => etiquetarFila({
    ...f,
    riesgo: f.rachs ?? 'Sin RACHS',
    edad: edadPediatrica(f),
    edad_anios_decimal: edadDecimal(f),
    multiples: multiples(f),
  }, RANGOS_PEDIATRICOS))
}

rutasIndicadores.get('/', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  const filas = await cargarPediatricos(desde, hasta)
  res.json(calcularIndicadores({
    filas, filtros, rangos: RANGOS_PEDIATRICOS, ordenEdad: EDADES_PEDIATRICAS, formatearRiesgo: formatearRiesgoPediatrico,
  }))
}))

rutasIndicadores.get('/pacientes', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  res.json({ pacientes: listarPacientes(await cargarPediatricos(desde, hasta), filtros) })
}))

// ---------------------------------------------------------------------------------------------
// Indicadores · módulo de adultos. Mismo cálculo que arriba sobre las tablas *_adultos (un paciente
// puede tener varias intervenciones: cada una es una fila), sin escala categórica como RACHS-1: el
// EuroSCORE es un porcentaje continuo, así que se agrupa en las categorías de riesgo estándar.
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
      ${sqlDiasUci('c', 'po')} AS dias_uci, ${sqlDiasHospitalizacion('c', 'po')} AS dias_hosp,
      po.horas_ventilacion_mecanica AS horas_vm,
      (cs.codigo = 'MUERTE') AS muerte,
      EXISTS (
        SELECT 1 FROM cirugias_adultos_complicaciones_intraqx cci JOIN opciones_lista o ON o.id = cci.complicacion_id
        WHERE cci.cirugia_id = c.id AND (o.codigo IS NULL OR o.codigo <> 'NINGUNA')
      ) AS comp_intraqx,
      EXISTS (
        SELECT 1 FROM postoperatorio_adultos_complicaciones_pop cpp JOIN opciones_lista o ON o.id = cpp.complicacion_id
        WHERE cpp.postoperatorio_id = po.id AND (o.codigo IS NULL OR o.codigo <> 'NO')
      ) AS comp_pop,
      (s.reingreso_30_dias = 'SI') AS reingreso,
      dg.valor AS diagnostico, ${listaDiagnosticosAdicionales('diagnosticos_adultos_adicionales', false)} AS diagnosticos_adicionales, d.euroscore, eps.valor AS eps, pr.valor AS procedencia,
      p.peso_kg, p.talla_cm, sx.valor AS sexo, eh.valor AS estado_herida, (s.no_aplica = 1) AS seguimiento_no_aplica,
      d.id AS diagnostico_fila_id, po.id AS postoperatorio_id,
      DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_dias,
      TIMESTAMPDIFF(MONTH, p.fecha_nacimiento, c.fecha_cirugia) AS edad_meses,
      TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, c.fecha_cirugia) AS edad_anios,
      pr.codigo AS procedencia_codigo, mu.valor AS municipio, va.valor AS valvulopatia,
      c.uso_cec, c.cierre_esternal_diferido, c.extubacion_quirofano, up.valor AS unidad_pop, cs.valor AS condicion_salida,
      s.rehabilitacion_cardiaca, s.reingreso_30_dias, cr.valor AS causa_reingreso
    FROM cirugias_adultos c
    JOIN episodios_adultos ep ON ep.id = c.episodio_id
    JOIN pacientes_adultos p ON p.id = ep.paciente_id
    LEFT JOIN diagnosticos_adultos d ON d.episodio_id = c.episodio_id
    LEFT JOIN postoperatorio_adultos po ON po.episodio_id = c.episodio_id
    LEFT JOIN seguimientos_adultos s ON s.episodio_id = c.episodio_id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
    LEFT JOIN opciones_lista mu ON mu.id = p.municipio_narino_id
    LEFT JOIN opciones_lista va ON va.id = d.valvulopatia_id
    LEFT JOIN opciones_lista up ON up.id = po.unidad_pop_id
    LEFT JOIN opciones_lista cr ON cr.id = s.causa_reingreso_id
    WHERE p.eliminado = 0 AND c.fecha_cirugia IS NOT NULL AND c.fecha_cirugia BETWEEN ? AND ?`, [desde, hasta])
  const multiples = await valoresMultiples(DETALLE_ADULTO.tablas)

  return crudas.map((f) => etiquetarFila({
    ...f,
    riesgo: categoriaEuroscore(f.euroscore),
    edad: edadAdulto(f),
    edad_anios_decimal: edadDecimal(f),
    multiples: multiples(f),
  }, RANGOS_ADULTOS))
}

rutasIndicadores.get('/adultos', asincrono(async (req, res) => {
  const { desde, hasta, filtros } = leerConsulta(req)
  res.json(calcularIndicadores({
    filas: await cargarAdultos(desde, hasta),
    filtros,
    rangos: RANGOS_ADULTOS,
    ordenEdad: EDADES_ADULTOS,
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
// Detalle de un paciente: todo lo que se le hizo, módulo por módulo, con el texto de cada lista (no
// su id). Lo muestra la matriz de resumen al buscar un documento y el detalle de un indicador (los
// fallecidos, los reingresos…). Entre pediátricos y adultos cambian las tablas (fijas, nunca vienen de
// la petición) y las pocas columnas propias de cada grupo.
// ---------------------------------------------------------------------------------------------

/** Una opción con su especificación entre paréntesis si es un "Otro…": "Otro país (Perú)". */
const conEspecificacion = (valor, especificacion) => `CONCAT(${valor}, IF(${especificacion} IS NULL, '', CONCAT(' (', ${especificacion}, ')')))`

/** Las opciones de una selección múltiple en un solo texto, en el orden de la lista y cada "Otro…" con
 * su especificación: "Obesidad | Otra condición relevante (hipotiroidismo)". */
const listaConEspecificacion = (tabla, columnaDueno, dueno, columnaOpcion) => `(
  SELECT GROUP_CONCAT(${conEspecificacion('o.valor', 't.especificacion')} ORDER BY o.orden, o.valor SEPARATOR ' | ')
  FROM ${tabla} t JOIN opciones_lista o ON o.id = t.${columnaOpcion} WHERE t.${columnaDueno} = ${dueno})`

/** Los diagnósticos adicionales de `d` en un solo texto, en el orden en que se agregaron. Con
 * `conDetalle`, cada uno con la especificación de su "Otro…" y su tipo de valvulopatía:
 * "Valvulopatías — tipo: Estenosis | Otras cardiopatías congénitas (Shone)". */
const listaDiagnosticosAdicionales = (tabla, conDetalle = true) => `(
  SELECT GROUP_CONCAT(${conDetalle
    ? `CONCAT(${conEspecificacion('o.valor', 't.especificacion')}, IF(v.valor IS NULL, '', CONCAT(' — tipo: ', v.valor)))`
    : 'o.valor'} ORDER BY t.orden SEPARATOR ' | ')
  FROM ${tabla} t JOIN opciones_lista o ON o.id = t.adicional_id LEFT JOIN opciones_lista v ON v.id = t.valvulopatia_id
  WHERE t.diagnostico_id = d.id)`

const DETALLE_PEDIATRICO = {
  tablas: { cirugias: 'cirugias', riesgos: 'diagnosticos_riesgos', adicionales: 'diagnosticos_adicionales', procedimientos: 'cirugias_procedimientos',
    diagnosticos: 'diagnosticos', complicacionesIntraqx: 'cirugias_complicaciones_intraqx', complicacionesPop: 'postoperatorio_complicaciones_pop' },
  columnas: 'rc.valor AS rachs, s.fecha_llamada_15_dias, p.telefonos, p.sin_telefono',
  desdeCirugia: `
    JOIN pacientes p ON p.id = c.paciente_id
    LEFT JOIN diagnosticos d ON d.paciente_id = p.id
    LEFT JOIN postoperatorio po ON po.paciente_id = p.id
    LEFT JOIN seguimientos s ON s.paciente_id = p.id`,
  uniones: 'LEFT JOIN opciones_lista rc ON rc.id = d.rachs_id',
  // Cada procedimiento adicional es otra intervención, con su propia fecha.
  fechaProcedimiento: 'CASE cp.orden WHEN 1 THEN c.fecha_cirugia WHEN 2 THEN c.fecha_procedimiento_2 ELSE c.fecha_procedimiento_3 END',
  telefonos: (f) => (Array.isArray(f.telefonos) ? f.telefonos : []),
}
const DETALLE_ADULTO = {
  tablas: { cirugias: 'cirugias_adultos', riesgos: 'diagnosticos_adultos_riesgos', adicionales: 'diagnosticos_adultos_adicionales',
    procedimientos: 'cirugias_adultos_procedimientos',
    diagnosticos: 'diagnosticos_adultos', complicacionesIntraqx: 'cirugias_adultos_complicaciones_intraqx', complicacionesPop: 'postoperatorio_adultos_complicaciones_pop' },
  columnas: 'ep.numero_episodio, d.euroscore, s.llamado_15_dias, s.fecha_llamada_15_dias, p.telefono',
  // Un paciente adulto puede tener varias intervenciones (episodios_adultos); cada una agrupa su
  // propio diagnóstico/postoperatorio/seguimiento, enlazados por episodio_id (no paciente_id), así
  // que esta ficha de detalle siempre muestra exactamente la intervención de `cirugiaId`, nunca una
  // mezcla de varias.
  desdeCirugia: `
    JOIN episodios_adultos ep ON ep.id = c.episodio_id
    JOIN pacientes_adultos p ON p.id = ep.paciente_id
    LEFT JOIN diagnosticos_adultos d ON d.episodio_id = c.episodio_id
    LEFT JOIN postoperatorio_adultos po ON po.episodio_id = c.episodio_id
    LEFT JOIN seguimientos_adultos s ON s.episodio_id = c.episodio_id`,
  uniones: '',
  // Todos los procedimientos son de la misma cirugía.
  fechaProcedimiento: 'c.fecha_cirugia',
  telefonos: (f) => (f.telefono ? [f.telefono] : []),
}

/**
 * Detalle de una cirugía puntual (no de "el paciente"): en adultos, un paciente puede tener varias
 * (una reintervención meses después), cada una con su propio diagnóstico/postoperatorio/seguimiento
 * — por eso se busca por `cirugiaId`, nunca por paciente_id, y nunca se mezclan dos intervenciones
 * en una misma ficha. Trae todos los datos registrados, nombre y teléfonos incluidos: es lo que se
 * consulta al revisar los casos de un indicador.
 */
async function detallePaciente({ tablas, columnas, desdeCirugia, uniones, fechaProcedimiento, telefonos }, cirugiaId) {
  const ficha = await una(pool, `
    SELECT p.id AS paciente_id, c.id AS cirugia_id, p.numero_paciente, p.nombre_completo, p.identificacion,
      ${conEspecificacion('sx.valor', 'p.sexo_otro')} AS sexo, p.fecha_nacimiento,
      DATEDIFF(c.fecha_cirugia, p.fecha_nacimiento) AS edad_cirugia_dias, p.peso_kg, p.talla_cm,
      ${conEspecificacion('pr.valor', 'p.procedencia_otro')} AS procedencia, mu.valor AS municipio_narino,
      ${conEspecificacion('eps.valor', 'p.eps_otro')} AS eps,
      d.id AS diagnostico_id_resuelto, ${conEspecificacion('dg.valor', 'd.diagnostico_otro')} AS diagnostico,
      ${listaDiagnosticosAdicionales(tablas.adicionales)} AS diagnosticos_adicionales, va.valor AS valvulopatia,
      c.fecha_cirugia, c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min,
      ${listaConEspecificacion(tablas.complicacionesIntraqx, 'cirugia_id', 'c.id', 'complicacion_id')} AS complicacion_intraqx,
      c.cierre_esternal_diferido, c.extubacion_quirofano,
      up.valor AS unidad_pop, po.horas_ventilacion_mecanica,
      ${listaConEspecificacion(tablas.complicacionesPop, 'postoperatorio_id', 'po.id', 'complicacion_id')} AS complicacion_pop,
      po.fecha_traslado_intermedio, ${sqlDiasUci('c', 'po')} AS dias_uci,
      po.fecha_salida, ${sqlDiasHospitalizacion('c', 'po')} AS dias_hospitalizacion,
      ${conEspecificacion('cs.valor', 'po.condicion_salida_otro')} AS condicion_salida, (cs.codigo = 'MUERTE') AS fallecido,
      (s.no_aplica = 1) AS seguimiento_no_aplica, s.fecha_control_cirugia, s.rehabilitacion_cardiaca,
      ${conEspecificacion('eh.valor', 's.estado_herida_otro')} AS estado_herida,
      s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso,
      ${conEspecificacion('cr.valor', 's.causa_reingreso_otro')} AS causa_reingreso, s.observaciones,
      ${columnas}
    FROM ${tablas.cirugias} c
    ${desdeCirugia}
    LEFT JOIN opciones_lista sx ON sx.id = p.sexo_id
    LEFT JOIN opciones_lista pr ON pr.id = p.procedencia_id
    LEFT JOIN opciones_lista mu ON mu.id = p.municipio_narino_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN opciones_lista va ON va.id = d.valvulopatia_id
    LEFT JOIN opciones_lista up ON up.id = po.unidad_pop_id
    LEFT JOIN opciones_lista cs ON cs.id = po.condicion_salida_id
    LEFT JOIN opciones_lista eh ON eh.id = s.estado_herida_id
    LEFT JOIN opciones_lista cr ON cr.id = s.causa_reingreso_id
    ${uniones}
    WHERE p.eliminado = 0 AND c.id = ?`, [cirugiaId])
  if (!ficha) throw noEncontrado('No se encontró el paciente.')

  const [riesgos, procedimientos] = await Promise.all([
    todas(pool, `
      SELECT ${conEspecificacion('o.valor', 'dr.especificacion')} AS valor
      FROM ${tablas.riesgos} dr
      JOIN opciones_lista o ON o.id = dr.riesgo_id
      WHERE dr.diagnostico_id = ?
      ORDER BY o.orden, o.valor`, [ficha.diagnostico_id_resuelto]),
    todas(pool, `
      SELECT o.valor AS procedimiento, cp.especificacion, cp.implante, ti.valor AS tipo_implante, ${fechaProcedimiento} AS fecha
      FROM ${tablas.procedimientos} cp
      JOIN ${tablas.cirugias} c ON c.id = cp.cirugia_id
      JOIN opciones_lista o ON o.id = cp.procedimiento_id
      LEFT JOIN opciones_lista ti ON ti.id = cp.tipo_implante_id
      WHERE cp.cirugia_id = ?
      ORDER BY cp.orden`, [cirugiaId]),
  ])

  return {
    ...ficha,
    // Pediátricos guardan una lista de teléfonos y adultos uno solo: el detalle siempre da la lista.
    telefono: undefined,
    telefonos: telefonos(ficha),
    sin_telefono: Boolean(ficha.sin_telefono),
    superficie_corporal: superficieCorporal(ficha.peso_kg),
    fallecido: Boolean(ficha.fallecido),
    seguimiento_no_aplica: Boolean(ficha.seguimiento_no_aplica),
    riesgos: riesgos.map((r) => r.valor),
    procedimientos,
  }
}

// El :id de estas dos rutas es una cirugía (cirugia_id), no un paciente — ver detallePaciente().
rutasIndicadores.get('/pacientes/:id', asincrono(async (req, res) => {
  res.json(await detallePaciente(DETALLE_PEDIATRICO, req.params.id))
}))

rutasIndicadores.get('/adultos/pacientes/:id', asincrono(async (req, res) => {
  res.json(await detallePaciente(DETALLE_ADULTO, req.params.id))
}))

/**
 * Detalle de un indicador clave: al hacer clic en "Mortalidad 7 %" (o en el punto de un mes) se ven
 * esos pacientes con todos sus datos. Con los mismos filtros del tablero y, si se eligió, solo el mes.
 * `total` es la base de la tasa: los pacientes operados que cumplen esos filtros.
 */
async function casosIndicador(req, cargar, detalle) {
  const consulta = leerConsulta(req)
  if (!consulta.indicador) throw validacion('Indique el indicador.')
  const filas = await cargar(consulta.desde, consulta.hasta)
  const base = seleccionarPacientes(filas, { ...consulta, indicador: undefined })
  const casos = base.filter(INDICADORES[consulta.indicador])
  return { total: base.length, casos: await Promise.all(casos.map((f) => detallePaciente(detalle, f.cirugia_id))) }
}

rutasIndicadores.get('/casos', asincrono(async (req, res) => {
  res.json(await casosIndicador(req, cargarPediatricos, DETALLE_PEDIATRICO))
}))

rutasIndicadores.get('/adultos/casos', asincrono(async (req, res) => {
  res.json(await casosIndicador(req, cargarAdultos, DETALLE_ADULTO))
}))

/** La matriz en Excel con todos los campos de cada paciente: los mismos pacientes que la matriz (o que
 * el detalle de un indicador), en su mismo orden. */
async function exportarSeleccion(req, cargar, grupo) {
  const consulta = leerConsulta(req)
  const elegidos = seleccionarPacientes(await cargar(consulta.desde, consulta.hasta), consulta)
  const filas = await filasExportacion(grupo, elegidos.map((f) => f.cirugia_id))
  const porCirugia = new Map(filas.map((f) => [f.cirugia_id, f]))
  return { filas: elegidos.map((f) => porCirugia.get(f.cirugia_id)).filter(Boolean) }
}

rutasIndicadores.get('/exportar', asincrono(async (req, res) => {
  res.json(await exportarSeleccion(req, cargarPediatricos, 'pediatricos'))
}))

rutasIndicadores.get('/adultos/exportar', asincrono(async (req, res) => {
  res.json(await exportarSeleccion(req, cargarAdultos, 'adultos'))
}))

// ---------------------------------------------------------------------------------------------
// Exportación plana (el .xlsx / .csv se genera en el cliente, con las columnas de
// ENCABEZADOS_EXPORTACION* en src/lib/importacion.ts). Una fila por paciente (en adultos, por
// intervención) con todos sus campos: cada "Otro…" de una selección única lleva su especificación en
// la columna siguiente; en las de selección múltiple va entre paréntesis junto a la opción.
// ---------------------------------------------------------------------------------------------

/** Los tres procedimientos de la cirugía en columnas: cuál, su especificación, si llevó implante y de qué tipo. */
function columnasProcedimientos(tabla) {
  const columnas = []
  const uniones = []
  for (const n of [1, 2, 3]) {
    columnas.push(`p${n}o.valor AS procedimiento_${n}, p${n}.especificacion AS procedimiento_${n}_otro, p${n}.implante AS implante_${n}, p${n}t.valor AS tipo_implante_${n}`)
    uniones.push(`LEFT JOIN ${tabla} p${n} ON p${n}.cirugia_id = c.id AND p${n}.orden = ${n}
      LEFT JOIN opciones_lista p${n}o ON p${n}o.id = p${n}.procedimiento_id
      LEFT JOIN opciones_lista p${n}t ON p${n}t.id = p${n}.tipo_implante_id`)
  }
  return { columnas: columnas.join(',\n'), uniones: uniones.join('\n') }
}

const PROCEDIMIENTOS_PEDIATRICOS = columnasProcedimientos('cirugias_procedimientos')
const PROCEDIMIENTOS_ADULTOS = columnasProcedimientos('cirugias_adultos_procedimientos')

const SQL_EXPORTACION = {
  pediatricos: `
    SELECT c.id AS cirugia_id, p.numero_paciente, p.nombre_completo, p.identificacion, sexo.valor AS sexo, p.sexo_otro,
      p.fecha_nacimiento, p.peso_kg, p.talla_cm,
      procedencia.valor AS procedencia, p.procedencia_otro, municipio.valor AS municipio_narino, p.telefonos, p.sin_telefono,
      eps.valor AS eps, p.eps_otro,
      diagnostico.valor AS diagnostico, d.diagnostico_otro, ${listaDiagnosticosAdicionales('diagnosticos_adicionales')} AS diagnosticos_adicionales,
      valvulopatia.valor AS valvulopatia, ${listaConEspecificacion('diagnosticos_riesgos', 'diagnostico_id', 'd.id', 'riesgo_id')} AS riesgos,
      rachs.valor AS rachs,
      c.fecha_cirugia, c.fecha_procedimiento_2, c.fecha_procedimiento_3, ${PROCEDIMIENTOS_PEDIATRICOS.columnas},
      c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min,
      ${listaConEspecificacion('cirugias_complicaciones_intraqx', 'cirugia_id', 'c.id', 'complicacion_id')} AS complicacion_intraqx,
      c.cierre_esternal_diferido, c.extubacion_quirofano, unidad_pop.valor AS unidad_pop, po.horas_ventilacion_mecanica,
      ${listaConEspecificacion('postoperatorio_complicaciones_pop', 'postoperatorio_id', 'po.id', 'complicacion_id')} AS complicacion_pop,
      po.fecha_traslado_intermedio, ${sqlDiasUci('c', 'po')} AS dias_uci, po.fecha_salida, ${sqlDiasHospitalizacion('c', 'po')} AS dias_hospitalizacion,
      condicion_salida.valor AS condicion_salida, po.condicion_salida_otro,
      s.fecha_control_cirugia, s.rehabilitacion_cardiaca, estado_herida.valor AS estado_herida, s.estado_herida_otro, s.fecha_llamada_15_dias,
      s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso, causa_reingreso.valor AS causa_reingreso, s.causa_reingreso_otro, s.observaciones
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
    ${PROCEDIMIENTOS_PEDIATRICOS.uniones}
    LEFT JOIN opciones_lista unidad_pop ON unidad_pop.id = po.unidad_pop_id
    LEFT JOIN opciones_lista condicion_salida ON condicion_salida.id = po.condicion_salida_id
    LEFT JOIN opciones_lista estado_herida ON estado_herida.id = s.estado_herida_id
    LEFT JOIN opciones_lista causa_reingreso ON causa_reingreso.id = s.causa_reingreso_id
    WHERE p.eliminado = 0`,
  adultos: `
    SELECT c.id AS cirugia_id, p.numero_paciente, ep.numero_episodio, p.nombre_completo, p.identificacion, sexo.valor AS sexo, p.sexo_otro,
      p.fecha_nacimiento, p.peso_kg, p.talla_cm,
      procedencia.valor AS procedencia, p.procedencia_otro, municipio.valor AS municipio_narino, p.telefono,
      eps.valor AS eps, p.eps_otro,
      diagnostico.valor AS diagnostico, d.diagnostico_otro, ${listaDiagnosticosAdicionales('diagnosticos_adultos_adicionales')} AS diagnosticos_adicionales,
      valvulopatia.valor AS valvulopatia, d.euroscore,
      ${listaConEspecificacion('diagnosticos_adultos_riesgos', 'diagnostico_id', 'd.id', 'riesgo_id')} AS riesgos,
      c.fecha_cirugia, ${PROCEDIMIENTOS_ADULTOS.columnas},
      c.uso_cec, c.tiempo_cec_min, c.tiempo_clamp_min,
      ${listaConEspecificacion('cirugias_adultos_complicaciones_intraqx', 'cirugia_id', 'c.id', 'complicacion_id')} AS complicacion_intraqx,
      c.cierre_esternal_diferido, c.extubacion_quirofano, unidad_pop.valor AS unidad_pop, po.horas_ventilacion_mecanica,
      ${listaConEspecificacion('postoperatorio_adultos_complicaciones_pop', 'postoperatorio_id', 'po.id', 'complicacion_id')} AS complicacion_pop,
      po.fecha_traslado_intermedio, ${sqlDiasUci('c', 'po')} AS dias_uci, po.fecha_salida, ${sqlDiasHospitalizacion('c', 'po')} AS dias_hospitalizacion,
      condicion_salida.valor AS condicion_salida, po.condicion_salida_otro,
      s.fecha_control_cirugia, s.rehabilitacion_cardiaca, estado_herida.valor AS estado_herida, s.estado_herida_otro,
      s.llamado_15_dias, s.fecha_llamada_15_dias, s.persona_recibe_llamada, s.reingreso_30_dias, s.fecha_reingreso,
      causa_reingreso.valor AS causa_reingreso, s.causa_reingreso_otro, s.observaciones
    FROM pacientes_adultos p
    JOIN episodios_adultos ep ON ep.paciente_id = p.id
    LEFT JOIN diagnosticos_adultos d ON d.episodio_id = ep.id
    LEFT JOIN cirugias_adultos c ON c.episodio_id = ep.id
    LEFT JOIN postoperatorio_adultos po ON po.episodio_id = ep.id
    LEFT JOIN seguimientos_adultos s ON s.episodio_id = ep.id
    LEFT JOIN opciones_lista sexo ON sexo.id = p.sexo_id
    LEFT JOIN opciones_lista procedencia ON procedencia.id = p.procedencia_id
    LEFT JOIN opciones_lista municipio ON municipio.id = p.municipio_narino_id
    LEFT JOIN opciones_lista eps ON eps.id = p.eps_id
    LEFT JOIN opciones_lista diagnostico ON diagnostico.id = d.diagnostico_id
    LEFT JOIN opciones_lista valvulopatia ON valvulopatia.id = d.valvulopatia_id
    ${PROCEDIMIENTOS_ADULTOS.uniones}
    LEFT JOIN opciones_lista unidad_pop ON unidad_pop.id = po.unidad_pop_id
    LEFT JOIN opciones_lista condicion_salida ON condicion_salida.id = po.condicion_salida_id
    LEFT JOIN opciones_lista estado_herida ON estado_herida.id = s.estado_herida_id
    LEFT JOIN opciones_lista causa_reingreso ON causa_reingreso.id = s.causa_reingreso_id
    WHERE p.eliminado = 0`,
}

/** Filas de exportación de un grupo: todos sus pacientes activos o, con `cirugiaIds`, solo esas
 * cirugías. La superficie corporal se calcula aquí, con la misma fórmula que la ficha. */
async function filasExportacion(grupo, cirugiaIds) {
  if (cirugiaIds && cirugiaIds.length === 0) return []
  const conexion = await pool.getConnection()
  try {
    await conexion.query('SET SESSION group_concat_max_len = 1000000')
    const orden = grupo === 'adultos' ? 'p.numero_paciente, ep.numero_episodio' : 'p.numero_paciente'
    const [filas] = await conexion.query(
      `${SQL_EXPORTACION[grupo]} ${cirugiaIds ? 'AND c.id IN (?)' : ''} ORDER BY ${orden}`,
      cirugiaIds ? [cirugiaIds] : [],
    )
    return filas.map((f) => ({
      ...f,
      superficie_corporal: f.peso_kg ? redondear(superficieCorporal(f.peso_kg), 2) : null,
      // La edad cumplida el día de la cirugía (sin cirugía, vacía): la misma regla que la ficha.
      edad_cirugia: textoEdad(f.fecha_nacimiento, f.fecha_cirugia),
      ...(grupo === 'pediatricos' && {
        telefonos: Array.isArray(f.telefonos) ? f.telefonos.join(' | ') : '',
        sin_telefono: Boolean(f.sin_telefono),
      }),
    }))
  } finally {
    conexion.release()
  }
}

rutasExportacion.get('/pacientes', asincrono(async (_req, res) => {
  res.json(await filasExportacion('pediatricos'))
}))

rutasExportacion.get('/pacientes-adultos', asincrono(async (_req, res) => {
  res.json(await filasExportacion('adultos'))
}))
