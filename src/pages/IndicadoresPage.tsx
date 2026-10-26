import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { claseBotonTexto, claseInput } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { Cargando, MensajeError } from '../components/Estados'
import { GraficoBarras } from '../components/GraficoBarras'
import { GraficoColumnas } from '../components/GraficoColumnas'
import { GraficoDona, type Segmento } from '../components/GraficoDona'
import { GraficoLineaTiempo } from '../components/GraficoLineaTiempo'
import { GraficoPuntos, type DatoTasa } from '../components/GraficoPuntos'
import { GraficoSiNo } from '../components/GraficoSiNo'
import { Tarjeta } from '../components/Tarjeta'
import {
  IconoAlerta,
  IconoCerrar,
  IconoCorazon,
  IconoEscudo,
  IconoFiltro,
  IconoGrafico,
  IconoLista,
  IconoPacientes,
  IconoRegresar,
  IconoReloj,
} from '../components/iconos'
import { TarjetaKpi } from '../components/TarjetaKpi'
import { useOpciones } from '../hooks/useOpciones'
import { api } from '../lib/api'
import { hoyIso } from '../lib/fechas'
import { COLOR_SIN_DATO, esSinDato, type Dato, type PropsSeleccion } from '../lib/graficos'
import { useGrupoActivo, type GrupoActivo } from '../lib/grupoActivo'
import { DetalleIndicador } from './indicadores/DetalleIndicador'
import { NOMBRE_CAMPO, type CampoFiltro, type Filtro } from './indicadores/filtros'
import { esIndicadorClave, type IndicadorClave } from './indicadores/indicadoresClave'
import { MatrizResumen, type Estadisticas, type PacienteMatriz } from './indicadores/MatrizResumen'

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function haceMeses(meses: number): string {
  const fecha = new Date()
  fecha.setMonth(fecha.getMonth() - meses)
  return fecha.toLocaleDateString('en-CA')
}

function inicioDeAnio(): string {
  return `${new Date().getFullYear()}-01-01`
}

interface Resumen {
  total_cirugias: number
  mortalidad_hospitalaria_pct: number | null
  dias_uci_promedio: number | null
  dias_uci_mediana: number | null
  dias_hospitalizacion_promedio: number | null
  dias_hospitalizacion_mediana: number | null
  horas_ventilacion_promedio: number | null
  horas_ventilacion_mediana: number | null
  tasa_complicacion_intraqx_pct: number | null
  tasa_complicacion_pop_pct: number | null
  tasa_reingreso_30d_pct: number | null
  fallecidos: number
  con_complicacion_intraqx: number
  con_complicacion_pop: number
  reingresos: number
  tiempo_cec_promedio: number | null
  tiempo_cec_mediana: number | null
  tiempo_clamp_promedio: number | null
  tiempo_clamp_mediana: number | null
  // Solo en el grupo adultos.
  euroscore_promedio?: number | null
  euroscore_mediana?: number | null
}

/** Conteo de pacientes por categoría o por rango (las distribuciones vienen ya agrupadas del servidor). */
type Conteo = { categoria: string; total_cirugias: number }[]
const aDatos = (conteo: Conteo) => conteo.map((d) => ({ etiqueta: d.categoria, valor: d.total_cirugias }))

/** Variable de selección múltiple: cada paciente cuenta en cada valor que tenga, así que el
 * porcentaje va sobre los pacientes (no sobre la suma de las barras). */
type ConteoMultiple = { pacientes: number; con_alguno: number; conteo: Conteo }
const aMultiple = (m: ConteoMultiple) => ({ pacientes: m.pacientes, conAlguno: m.con_alguno, datos: aDatos(m.conteo) })

/** Indicadores clave de un mes: casos de cada desenlace sobre las cirugías del mes. */
type MesTasas = {
  mes: string
  total_cirugias: number
  fallecidos: number
  complicacion_intraqx: number
  complicacion_pop: number
  reingresos: number
}
type CasosMes = Exclude<keyof MesTasas, 'mes' | 'total_cirugias'>

/** Tasa (%) de un desenlace mes a mes (pedido del 23-oct: mensual, no trimestral), con sus casos y su
 * total para el tooltip. La clave ("2026-05") es el mes cuyos casos se abren al hacer clic, así que
 * un mes sin casos no se puede elegir: no tendría a nadie que mostrar. */
function tasasMes(meses: MesTasas[], casos: CasosMes): DatoTasa[] {
  return meses.map((m) => {
    const [anio, mes] = m.mes.split('-').map(Number)
    return {
      etiqueta: `${MESES[mes]} ${anio}`,
      clave: m.mes,
      valor: m.total_cirugias ? Math.round((1000 * m[casos]) / m.total_cirugias) / 10 : 0,
      casos: m[casos],
      total: m.total_cirugias,
      n: m[casos],
    }
  })
}

type ConteoRiesgo = { total_cirugias: number; fallecidos: number; mortalidad_pct: number }
type GrupoHerida = 'adecuada' | 'alteracion' | 'no_aplica' | 'sin_registrar'

/** Meses continuos, del primero al último con cirugías, con 0 en los meses sin ninguna: en una
 * línea, saltarse un mes vacío dibujaría una tendencia que no existe. La clave ("2026-05") es la
 * que entiende el filtro del servidor. */
function mesesContinuos(porMes: { anio: number; mes: number; total_cirugias: number }[]): Dato[] {
  if (!porMes.length) return []
  const conteo = new Map(porMes.map((d) => [d.anio * 12 + (d.mes - 1), d.total_cirugias]))
  const primero = Math.min(...conteo.keys())
  const ultimo = Math.max(...conteo.keys())
  return Array.from({ length: ultimo - primero + 1 }, (_, i) => {
    const indice = primero + i
    const anio = Math.floor(indice / 12)
    const mes = (indice % 12) + 1
    return { etiqueta: `${MESES[mes]} ${anio}`, clave: `${anio}-${String(mes).padStart(2, '0')}`, valor: conteo.get(indice) ?? 0 }
  })
}

/** Cada cuánto se vuelven a pedir los indicadores mientras la página está abierta y visible. */
const INTERVALO_ACTUALIZACION_MS = 60_000

/** El módulo pediátrico clasifica el riesgo con RACHS-1 (categórico, I a VI); el de adultos con
 * EuroSCORE (un porcentaje continuo), así que cada grupo trae su propio desglose de riesgo con su
 * propia etiqueta — no son el mismo gráfico con datos distintos, son dos escalas distintas.
 *
 * Las gráficas deben reflejar cada paciente nuevo sin recargar la página: al entrar se piden de
 * nuevo (los datos en caché nunca se dan por frescos), y con la página abierta se refrescan cada
 * minuto y al volver a la ventana — así también aparecen los registros hechos por otro usuario u
 * otra pestaña. El refresco ocurre en segundo plano: las gráficas no se vacían mientras tanto, y al
 * cambiar las fechas o los filtros siguen las anteriores (atenuadas) hasta que llegan las nuevas. */
function useIndicadores(grupo: GrupoActivo, desde: string, hasta: string, filtros: Filtro[]) {
  const enviados = filtros.map(({ campo, valor }) => ({ campo, valor }))
  return useQuery({
    queryKey: ['indicadores', grupo, desde, hasta, enviados],
    refetchOnWindowFocus: true,
    refetchInterval: INTERVALO_ACTUALIZACION_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const ruta = grupo === 'adultos' ? '/indicadores/adultos' : '/indicadores'
      const parametroFiltros = enviados.length ? `&filtros=${encodeURIComponent(JSON.stringify(enviados))}` : ''
      const r = await api.get<{
        resumen: Resumen
        estadisticas: Record<
          'peso' | 'talla' | 'superficie_corporal' | 'dias_uci' | 'horas_vm' | 'dias_hosp' | 'edad_anios' | 'tiempo_cec' | 'tiempo_clamp',
          Estadisticas
        >
        por_mes: { anio: number; mes: number; total_cirugias: number }[]
        por_anio: Conteo
        tasas_por_mes: MesTasas[]
        por_complicacion_intraqx: ConteoMultiple
        por_complicacion_pop: ConteoMultiple
        por_reingreso: Conteo
        por_causa_reingreso: Conteo
        por_condicion_salida: Conteo
        por_valvulopatia: Conteo
        por_factor_riesgo: ConteoMultiple
        por_implante: ConteoMultiple
        por_uso_cec: Conteo
        por_tiempo_cec: Conteo
        por_tiempo_clamp: Conteo
        por_cierre_esternal: Conteo
        por_extubacion: Conteo
        por_unidad_pop: Conteo
        por_dias_hosp: Conteo
        por_rehabilitacion: Conteo
        por_edad: Conteo
        por_municipio: Conteo
        por_diagnostico: ConteoMultiple
        por_procedimiento: { procedimiento: string; total_cirugias: number }[]
        por_rachs?: ({ rachs: string } & ConteoRiesgo)[]
        por_euroscore?: ({ categoria: string } & ConteoRiesgo)[]
        por_eps: { eps: string; total_cirugias: number }[]
        por_procedencia: { procedencia: string; total_cirugias: number }[]
        por_sexo: Conteo
        por_peso: Conteo
        por_talla: Conteo
        por_superficie_corporal: Conteo
        por_dias_uci: Conteo
        por_horas_vm: Conteo
        por_estado_herida: Conteo
        por_herida_grupo: { grupo: GrupoHerida; total: number; categorias: Conteo }[]
      }>(`${ruta}?desde=${desde}&hasta=${hasta}${parametroFiltros}`)
      // La clave es el valor del servidor ("IV"), con el que se filtra; la etiqueta, lo que se lee.
      const riesgo = (r.por_rachs ?? r.por_euroscore ?? []).map((d) => {
        const clave = 'rachs' in d ? d.rachs : d.categoria
        return { ...d, clave, etiqueta: 'rachs' in d && !esSinDato(d.rachs) ? `RACHS ${d.rachs}` : clave }
      })
      return {
        resumen: r.resumen,
        estadisticas: r.estadisticas,
        porMes: mesesContinuos(r.por_mes),
        porAnio: aDatos(r.por_anio),
        tasasPorMes: r.tasas_por_mes,
        porComplicacionIntraqx: aMultiple(r.por_complicacion_intraqx),
        porComplicacionPop: aMultiple(r.por_complicacion_pop),
        porReingreso: aDatos(r.por_reingreso),
        porCausaReingreso: aDatos(r.por_causa_reingreso),
        porCondicionSalida: aDatos(r.por_condicion_salida),
        porValvulopatia: aDatos(r.por_valvulopatia),
        porFactorRiesgo: aMultiple(r.por_factor_riesgo),
        porImplante: aMultiple(r.por_implante),
        porUsoCec: aDatos(r.por_uso_cec),
        porTiempoCec: aDatos(r.por_tiempo_cec),
        porTiempoClamp: aDatos(r.por_tiempo_clamp),
        porCierreEsternal: aDatos(r.por_cierre_esternal),
        porExtubacion: aDatos(r.por_extubacion),
        porUnidadPop: aDatos(r.por_unidad_pop),
        porDiasHosp: aDatos(r.por_dias_hosp),
        porRehabilitacion: aDatos(r.por_rehabilitacion),
        porEdad: aDatos(r.por_edad),
        porMunicipio: aDatos(r.por_municipio),
        porDiagnostico: aMultiple(r.por_diagnostico),
        porProcedimiento: r.por_procedimiento.map((d) => ({ etiqueta: d.procedimiento, valor: d.total_cirugias })),
        porRiesgoTotal: riesgo.map((d) => ({ etiqueta: d.etiqueta, clave: d.clave, valor: d.total_cirugias })),
        porRiesgoMortalidad: riesgo.map((d) => ({
          etiqueta: d.etiqueta,
          clave: d.clave,
          valor: d.mortalidad_pct ?? 0,
          casos: d.fallecidos,
          total: d.total_cirugias,
        })),
        porEps: r.por_eps.map((d) => ({ etiqueta: d.eps, valor: d.total_cirugias })),
        porProcedencia: r.por_procedencia.map((d) => ({ etiqueta: d.procedencia, valor: d.total_cirugias })),
        porSexo: aDatos(r.por_sexo),
        porPeso: aDatos(r.por_peso),
        porTalla: aDatos(r.por_talla),
        porSuperficieCorporal: aDatos(r.por_superficie_corporal),
        porDiasUci: aDatos(r.por_dias_uci),
        porHorasVm: aDatos(r.por_horas_vm),
        porEstadoHerida: aDatos(r.por_estado_herida),
        porHeridaGrupo: r.por_herida_grupo,
      }
    },
  })
}

/** Filas de la matriz de resumen: un paciente por fila, con los mismos filtros y la misma
 * actualización automática que el resto del tablero. Solo se pide con la pestaña abierta. */
function usePacientesMatriz(grupo: GrupoActivo, desde: string, hasta: string, filtros: Filtro[], activo: boolean) {
  const enviados = filtros.map(({ campo, valor }) => ({ campo, valor }))
  return useQuery({
    queryKey: ['indicadores-pacientes', grupo, desde, hasta, enviados],
    enabled: activo,
    refetchOnWindowFocus: true,
    refetchInterval: INTERVALO_ACTUALIZACION_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const ruta = grupo === 'adultos' ? '/indicadores/adultos/pacientes' : '/indicadores/pacientes'
      const parametroFiltros = enviados.length ? `&filtros=${encodeURIComponent(JSON.stringify(enviados))}` : ''
      return (await api.get<{ pacientes: PacienteMatriz[] }>(`${ruta}?desde=${desde}&hasta=${hasta}${parametroFiltros}`)).pacientes
    },
  })
}

/** Colores categóricos en su orden fijo (ver --chart-cat-* en index.css, validados para daltonismo). */
const COLORES_CATEGORIAS = ['var(--chart-cat-1)', 'var(--chart-cat-2)', 'var(--chart-cat-3)']

/** El color de cada sexo sale de su posición en el catálogo, no de cuál tiene más pacientes: así
 * Femenino es siempre del mismo color aunque en otro periodo haya más Masculino, o falte "Otro". */
function segmentosSexo(conteo: Dato[], ordenCatalogo: string[]): Segmento[] {
  // Mientras llega el catálogo, el orden alfabético coincide con el de la lista sembrada.
  const orden = ordenCatalogo.length ? ordenCatalogo : conteo.map((d) => d.etiqueta).filter((e) => !esSinDato(e)).sort()
  return conteo.map((d) => {
    if (esSinDato(d.etiqueta)) return { ...d, color: COLOR_SIN_DATO }
    const posicion = orden.indexOf(d.etiqueta)
    return { ...d, color: COLORES_CATEGORIAS[posicion] ?? 'var(--chart-no-aplica)' }
  })
}

/** Cómo se ve cada grupo del estado de la herida (los grupos los arma el servidor, con la misma
 * regla con la que filtra: ver grupoHerida en server/rutas-consultas.mjs). */
const GRUPOS_HERIDA: Record<GrupoHerida, { etiqueta: string; color: string }> = {
  adecuada: { etiqueta: 'Cicatrización adecuada', color: 'var(--chart-azul)' },
  alteracion: { etiqueta: 'Con alteración', color: 'var(--status-critical)' },
  no_aplica: { etiqueta: 'No aplica', color: 'var(--chart-no-aplica)' },
  sin_registrar: { etiqueta: 'Sin registrar', color: COLOR_SIN_DATO },
}

function segmentosHerida(grupos: { grupo: GrupoHerida; total: number; categorias: Conteo }[]): Segmento[] {
  return grupos.map((g) => ({
    ...GRUPOS_HERIDA[g.grupo],
    clave: g.grupo,
    valor: g.total,
    // Dentro de "Con alteración", la leyenda dice cuáles (secreción, dehiscencia…).
    desglose: g.grupo === 'alteracion' ? aDatos(g.categorias) : undefined,
  }))
}

/** Respuestas Sí/No de la ficha en una dona. Colores fijos por respuesta (nunca por posición). Si el
 * "Sí" es un desenlace malo (un reingreso), va en el rojo de estado crítico. */
function segmentosSiNo(conteo: Dato[], siEsAdverso = false): Segmento[] {
  const colores: Record<string, string> = {
    Sí: siEsAdverso ? 'var(--status-critical)' : 'var(--chart-cat-1)',
    No: siEsAdverso ? 'var(--chart-azul)' : 'var(--chart-cat-3)',
    'No aplica': 'var(--chart-no-aplica)',
  }
  return conteo.map((d) => ({ ...d, color: colores[d.etiqueta] ?? COLOR_SIN_DATO }))
}

/** Pie de un gráfico de selección múltiple: de qué total sale el porcentaje y cuántos no tienen ninguno. */
function NotaMultiple({ pacientes, conAlguno, ninguno }: { pacientes: number; conAlguno: number; ninguno: string }) {
  return (
    <p className="mt-3 text-xs text-slate-500">
      Un paciente puede tener más de uno: el porcentaje es sobre los {pacientes} pacientes. {pacientes - conAlguno} {ninguno}.
    </p>
  )
}

function num(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimales)
}

/** El tablero se recorre por categorías, una a la vez, en vez de una sola página con todos los
 * gráficos apilados. La pestaña activa va en la URL (?vista=…) para que sobreviva a una recarga.
 * Tras el resumen van los indicadores clave del servicio (mortalidad, complicaciones, reingreso) y
 * luego los módulos de la ficha en su orden (paciente, riesgo, cirugía, postoperatorio), con la
 * matriz por paciente al final, como consulta de detalle. */
const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen', icono: <IconoGrafico /> },
  { clave: 'clave', etiqueta: 'Indicadores clave', etiquetaCorta: 'Indicadores', icono: <IconoAlerta /> },
  { clave: 'pacientes', etiqueta: 'Pacientes', icono: <IconoPacientes /> },
  { clave: 'riesgo', etiqueta: 'Riesgo y diagnóstico', etiquetaCorta: 'Riesgo', icono: <IconoEscudo /> },
  { clave: 'cirugia', etiqueta: 'Cirugía', icono: <IconoCorazon /> },
  { clave: 'postoperatorio', etiqueta: 'Postoperatorio y egreso', etiquetaCorta: 'Postoperatorio', icono: <IconoReloj /> },
  { clave: 'matriz', etiqueta: 'Matriz de resumen', etiquetaCorta: 'Matriz', icono: <IconoLista /> },
] as const

type Vista = (typeof PESTANAS)[number]['clave']

function useVista(): [Vista, (vista: Vista) => void] {
  const [params, setParams] = useSearchParams()
  const vista = PESTANAS.find((p) => p.clave === params.get('vista'))?.clave ?? 'resumen'
  // replace: cambiar de pestaña no deja una entrada por cada clic en el historial del navegador.
  // También cierra el detalle de un indicador, si estaba abierto.
  return [vista, (nueva) => setParams({ vista: nueva }, { replace: true })]
}

/** El detalle de un indicador abierto (?detalle=mortalidad&mes=2026-05), en la URL como la pestaña:
 * así sobrevive a una recarga y el botón Atrás del navegador vuelve al tablero. */
function useDetalleIndicador(vista: Vista) {
  const [params, setParams] = useSearchParams()
  const detalle = params.get('detalle')
  const mes = params.get('mes')
  return {
    indicador: esIndicadorClave(detalle) ? detalle : null,
    mes: mes && /^d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null,
    abrir: (indicador: IndicadorClave, mesElegido?: string) => {
      setParams({ vista, detalle: indicador, ...(mesElegido ? { mes: mesElegido } : {}) })
      window.scrollTo({ top: 0 })
    },
    cerrar: () => setParams({ vista }, { replace: true }),
  }
}

/** Los cuatro indicadores clave con tasa: cada uno con su tendencia mes a mes y su tasa del periodo. */
const INDICADORES_CLAVE: {
  indicador: IndicadorClave
  titulo: string
  descripcion: string
  casos: CasosMes
  global: 'mortalidad_hospitalaria_pct' | 'tasa_complicacion_intraqx_pct' | 'tasa_complicacion_pop_pct' | 'tasa_reingreso_30d_pct'
  nombreCasos: [string, string]
}[] = [
  {
    indicador: 'mortalidad',
    titulo: 'Mortalidad hospitalaria',
    descripcion: 'De cada 100 pacientes operados en el mes, cuántos fallecieron antes del egreso.',
    casos: 'fallecidos',
    global: 'mortalidad_hospitalaria_pct',
    nombreCasos: ['fallecido', 'fallecidos'],
  },
  {
    indicador: 'complicacion_intraqx',
    titulo: 'Complicación intraquirúrgica',
    descripcion: 'De cada 100 pacientes operados en el mes, cuántos tuvieron una complicación en quirófano.',
    casos: 'complicacion_intraqx',
    global: 'tasa_complicacion_intraqx_pct',
    nombreCasos: ['paciente con complicación', 'pacientes con complicación'],
  },
  {
    indicador: 'complicacion_pop',
    titulo: 'Complicación en postoperatorio',
    descripcion: 'De cada 100 pacientes operados en el mes, cuántos tuvieron una complicación después de la cirugía.',
    casos: 'complicacion_pop',
    global: 'tasa_complicacion_pop_pct',
    nombreCasos: ['paciente con complicación', 'pacientes con complicación'],
  },
  {
    indicador: 'reingreso',
    titulo: 'Reingreso a la institución en los primeros 30 días',
    descripcion: 'De cada 100 pacientes operados en el mes, cuántos volvieron a la institución en los 30 días siguientes al egreso.',
    casos: 'reingresos',
    global: 'tasa_reingreso_30d_pct',
    nombreCasos: ['reingreso', 'reingresos'],
  },
]

/** Base de una tasa, bajo la cifra: "9 de 71 pacientes". */
const deTotal = (casos: number, total: number) => `${casos} de ${total} ${total === 1 ? 'paciente' : 'pacientes'}`

/** Cuántos casos tiene cada indicador en el resumen del periodo. */
const CASOS_DEL_RESUMEN = {
  mortalidad: 'fallecidos',
  complicacion_intraqx: 'con_complicacion_intraqx',
  complicacion_pop: 'con_complicacion_pop',
  reingreso: 'reingresos',
} as const satisfies Record<IndicadorClave, keyof Resumen>

/** Las tarjetas de los cuatro indicadores clave. Con casos, un clic abre el detalle de esos pacientes
 * con todos sus datos (pedido del 23-oct: de "Mortalidad 7 %" a los pacientes fallecidos). */
function TarjetasIndicadores({ resumen, onAbrir }: { resumen: Resumen; onAbrir: (indicador: IndicadorClave) => void }) {
  const tarjetas: { indicador: IndicadorClave; etiqueta: string; pct: number | null; icono: ReactNode; critico?: boolean }[] = [
    { indicador: 'mortalidad', etiqueta: 'Mortalidad hospitalaria', pct: resumen.mortalidad_hospitalaria_pct, icono: <IconoAlerta className="h-4 w-4" />, critico: true },
    { indicador: 'complicacion_intraqx', etiqueta: 'Complicación intraquirúrgica', pct: resumen.tasa_complicacion_intraqx_pct, icono: <IconoEscudo className="h-4 w-4" /> },
    { indicador: 'complicacion_pop', etiqueta: 'Complicación postoperatoria', pct: resumen.tasa_complicacion_pop_pct, icono: <IconoEscudo className="h-4 w-4" /> },
    { indicador: 'reingreso', etiqueta: 'Reingreso a 30 días', pct: resumen.tasa_reingreso_30d_pct, icono: <IconoRegresar className="h-4 w-4" /> },
  ]
  return tarjetas.map(({ indicador, etiqueta, pct, icono, critico }) => {
    const casos = resumen[CASOS_DEL_RESUMEN[indicador]]
    return (
      <TarjetaKpi
        key={indicador}
        etiqueta={etiqueta}
        valor={`${num(pct)}%`}
        tono={critico ? 'critico' : 'normal'}
        detalle={deTotal(casos, resumen.total_cirugias)}
        icono={icono}
        onClick={casos > 0 ? () => onAbrir(indicador) : undefined}
        accion="Ver los pacientes"
        titulo={casos > 0 ? `Ver el detalle de los ${casos} pacientes` : undefined}
      />
    )
  })
}

/** Mediana junto al título de un gráfico de distribución (nada si no hay datos). */
function Mediana({ valor, unidad, decimales = 1 }: { valor: number | null | undefined; unidad: string; decimales?: number }) {
  if (valor === null || valor === undefined) return null
  return (
    <span className="whitespace-nowrap text-xs text-slate-500">
      Mediana{' '}
      <span className="font-semibold tabular-nums text-slate-900">
        {valor.toFixed(decimales)} {unidad}
      </span>
    </span>
  )
}

type Preset = '30' | 'anio' | 'todo' | 'personalizado'

export function IndicadoresPage() {
  const { grupo } = useGrupoActivo()
  const [desde, setDesde] = useState(haceMeses(12))
  const [hasta, setHasta] = useState(hoyIso())
  const [preset, setPreset] = useState<Preset>('personalizado')
  const [vista, setVista] = useVista()
  const detalle = useDetalleIndicador(vista)
  // Cada grupo guarda sus propios filtros: sus categorías no son las mismas (RACHS-1 / EuroSCORE,
  // rangos de peso de niños / adultos), así que al cambiar de grupo no se arrastran.
  const [filtrosPorGrupo, setFiltrosPorGrupo] = useState<Record<GrupoActivo, Filtro[]>>({ pediatricos: [], adultos: [] })
  const filtros = filtrosPorGrupo[grupo]
  const { data, isLoading, error, dataUpdatedAt, isPlaceholderData } = useIndicadores(grupo, desde, hasta, filtros)
  const { data: opcionesSexo } = useOpciones('SEXO')
  const matriz = usePacientesMatriz(grupo, desde, hasta, filtros, vista === 'matriz')

  function aplicarPreset(valor: Preset) {
    setPreset(valor)
    setHasta(hoyIso())
    if (valor === '30') setDesde(haceMeses(1))
    else if (valor === 'anio') setDesde(inicioDeAnio())
    else if (valor === 'todo') setDesde('2000-01-01')
  }

  const cambiarFiltros = (nuevos: Filtro[]) => setFiltrosPorGrupo((actual) => ({ ...actual, [grupo]: nuevos }))

  /** Un clic en una categoría la vuelve el filtro de su campo (reemplaza al anterior del mismo campo);
   * un segundo clic en la misma lo quita. Filtros de campos distintos se suman. */
  function alternarFiltro(campo: CampoFiltro, valor: string, etiqueta: string) {
    const resto = filtros.filter((f) => f.campo !== campo)
    const yaEstaba = filtros.some((f) => f.campo === campo && f.valor === valor)
    cambiarFiltros(yaEstaba ? resto : [...resto, { campo, valor, etiqueta }])
  }

  /** Lo que necesita un gráfico para filtrar el tablero por su campo y resaltar lo elegido. */
  const interaccion = (campo: CampoFiltro): PropsSeleccion => ({
    seleccion: filtros.find((f) => f.campo === campo)?.valor ?? null,
    onSeleccionar: (valor, etiqueta) => alternarFiltro(campo, valor, etiqueta),
  })

  const clasePreset = (activo: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      activo ? 'bg-white text-[var(--pabon-azul-oscuro)] shadow-sm' : 'text-slate-500 hover:text-slate-800'
    }`

  const tituloRiesgo = grupo === 'adultos' ? 'categoría de riesgo EuroSCORE' : 'RACHS-1'
  const etiquetaGrupo = grupo === 'adultos' ? 'pacientes adultos' : 'pacientes pediátricos'

  return (
    <div>
      <EncabezadoPagina
        icono={<IconoGrafico className="h-5 w-5" />}
        titulo="Tablero de indicadores"
        subtitulo={`Cirugías, mortalidad, complicaciones y tiempos de ${etiquetaGrupo}, filtrables por fecha de cirugía.`}
      />

      <Tarjeta className="mb-6">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex flex-none gap-1 rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => aplicarPreset('30')} className={clasePreset(preset === '30')}>
              Últimos 30 días
            </button>
            <button type="button" onClick={() => aplicarPreset('anio')} className={clasePreset(preset === 'anio')}>
              Este año
            </button>
            <button type="button" onClick={() => aplicarPreset('todo')} className={clasePreset(preset === 'todo')}>
              Todo
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="date"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPreset('personalizado') }}
              className={`${claseInput} w-auto`}
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPreset('personalizado') }}
              className={`${claseInput} w-auto`}
            />
          </div>
          {data && (
            <p className="ml-auto text-xs text-slate-500" title="Las gráficas se actualizan solas cada minuto.">
              Actualizado a las{' '}
              {new Date(dataUpdatedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Filtros con un clic: se ven (y se quitan) desde cualquier pestaña. Sin filtros, la misma
            fila explica cómo se usan, así el diseño no salta al aparecer el primero. */}
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          {filtros.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <IconoFiltro className="h-4 w-4 flex-none text-[var(--pabon-azul-oscuro)]" />
              Haga clic en una barra, un segmento o un valor de la matriz para filtrar todo el tablero.
            </p>
          ) : (
            <>
              <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <IconoFiltro className="h-4 w-4 text-[var(--pabon-azul-oscuro)]" />
                Filtrado por
              </span>
              {filtros.map((f) => (
                <span
                  key={f.campo}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 py-0.5 pr-1 pl-3 text-sm text-slate-900"
                >
                  {NOMBRE_CAMPO[f.campo]}: <span className="font-semibold">{f.etiqueta}</span>
                  <button
                    type="button"
                    onClick={() => alternarFiltro(f.campo, f.valor, f.etiqueta)}
                    aria-label={`Quitar el filtro ${NOMBRE_CAMPO[f.campo]}: ${f.etiqueta}`}
                    className="rounded-full p-1 text-[var(--pabon-azul-oscuro)] outline-none hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]"
                  >
                    <IconoCerrar className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {data && (
                <span className="text-sm text-slate-600">
                  · <span className="font-semibold text-slate-900">{data.resumen.total_cirugias}</span>{' '}
                  {data.resumen.total_cirugias === 1 ? 'paciente' : 'pacientes'}
                </span>
              )}
              <button type="button" onClick={() => cambiarFiltros([])} className={`${claseBotonTexto} ml-auto text-xs`}>
                Quitar filtros
              </button>
            </>
          )}
        </div>
      </Tarjeta>

      {/* En el celular las pestañas van en una cuadrícula de 2 columnas (la última, si queda sola,
          ocupa la fila completa), en tabletas de 4, y desde xl en una sola fila. */}
      <div role="tablist" className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4 xl:inline-flex">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={vista === p.clave}
            onClick={() => setVista(p.clave)}
            className={`flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors max-sm:last:odd:col-span-2 ${
              vista === p.clave ? 'bg-white text-[var(--pabon-azul-oscuro)] shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {p.icono}
            {/* En el celular, el nombre largo partido en dos líneas descuadraba la cuadrícula. */}
            {'etiquetaCorta' in p ? (
              <>
                <span className="sm:hidden">{p.etiquetaCorta}</span>
                <span className="hidden sm:inline">{p.etiqueta}</span>
              </>
            ) : (
              p.etiqueta
            )}
          </button>
        ))}
      </div>

      {/* El detalle de un indicador ocupa el lugar de la pestaña: los mismos filtros y fechas de arriba. */}
      {detalle.indicador && (
        <DetalleIndicador
          grupo={grupo}
          desde={desde}
          hasta={hasta}
          filtros={filtros}
          indicador={detalle.indicador}
          mes={detalle.mes}
          onVolver={detalle.cerrar}
        />
      )}

      {!detalle.indicador && isLoading && <Cargando />}
      {!detalle.indicador && error && <MensajeError>No se pudieron cargar los indicadores.</MensajeError>}

      {!detalle.indicador && data && (
        // Mientras llegan los datos de un rango o un filtro nuevo se ven los anteriores, atenuados:
        // sin parpadeo ni saltos de diseño.
        <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {vista === 'resumen' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {/* En el celular (2 columnas) el total ocupa la fila completa: así las 5 tarjetas no dejan
                    una sola suelta al final. */}
                <div className="col-span-2 sm:col-span-1">
                  <TarjetaKpi
                    etiqueta="Total de cirugías"
                    valor={String(data.resumen.total_cirugias)}
                    icono={<IconoCorazon className="h-4 w-4" />}
                  />
                </div>
                <TarjetasIndicadores resumen={data.resumen} onAbrir={(indicador) => detalle.abrir(indicador)} />
              </div>

              {/* El mes muestra la tendencia; el año, el volumen comparable entre años. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Tarjeta titulo="Cirugías por mes" descripcion="Número de cirugías realizadas cada mes." className="lg:col-span-2">
                  <GraficoLineaTiempo datos={data.porMes} {...interaccion('mes')} />
                </Tarjeta>
                <Tarjeta titulo="Cirugías por año" descripcion="Número de cirugías realizadas cada año.">
                  <GraficoColumnas datos={data.porAnio} {...interaccion('anio')} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Tiempos y estancia (promedio / mediana)">
                <div className="-mx-5 -my-2 overflow-x-auto">
                  <table className="w-full min-w-[22rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th scope="col" className="px-5 py-2 font-semibold">Indicador</th>
                        <th scope="col" className="w-28 px-5 py-2 text-right font-semibold sm:w-36">Promedio</th>
                        <th scope="col" className="w-28 px-5 py-2 text-right font-semibold sm:w-36">Mediana</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {[
                        { etiqueta: 'Días en UCI', promedio: data.resumen.dias_uci_promedio, mediana: data.resumen.dias_uci_mediana },
                        { etiqueta: 'Días de hospitalización', promedio: data.resumen.dias_hospitalizacion_promedio, mediana: data.resumen.dias_hospitalizacion_mediana },
                        { etiqueta: 'Horas de ventilación mecánica', promedio: data.resumen.horas_ventilacion_promedio, mediana: data.resumen.horas_ventilacion_mediana },
                        { etiqueta: 'Tiempo de CEC (min)', promedio: data.resumen.tiempo_cec_promedio, mediana: data.resumen.tiempo_cec_mediana },
                        { etiqueta: 'Tiempo de clamp de aorta (min)', promedio: data.resumen.tiempo_clamp_promedio, mediana: data.resumen.tiempo_clamp_mediana },
                        ...(grupo === 'adultos'
                          ? [{ etiqueta: 'EuroSCORE (%)', promedio: data.resumen.euroscore_promedio, mediana: data.resumen.euroscore_mediana, decimales: 2 }]
                          : []),
                      ].map((fila) => (
                        <tr key={fila.etiqueta}>
                          <th scope="row" className="px-5 py-2.5 font-normal">{fila.etiqueta}</th>
                          <td className="px-5 py-2.5 text-right font-medium tabular-nums">{num(fila.promedio, fila.decimales)}</td>
                          <td className="px-5 py-2.5 text-right font-medium tabular-nums">{num(fila.mediana, fila.decimales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </div>
          )}

          {/* Los indicadores clave del servicio: su tasa del periodo (un clic abre sus pacientes), cómo
              evoluciona mes a mes (con sus casos y su total en el tooltip; un clic en un mes abre los
              pacientes de ese mes) y luego de qué está hecha cada una (tipos y causas). */}
          {vista === 'clave' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <TarjetasIndicadores resumen={data.resumen} onAbrir={(indicador) => detalle.abrir(indicador)} />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {INDICADORES_CLAVE.map((indicador) => (
                  <Tarjeta
                    key={indicador.casos}
                    titulo={`${indicador.titulo} por mes (%)`}
                    descripcion={indicador.descripcion}
                    acciones={
                      data.resumen[CASOS_DEL_RESUMEN[indicador.indicador]] > 0 && (
                        <button type="button" onClick={() => detalle.abrir(indicador.indicador)} className={`${claseBotonTexto} text-xs`}>
                          Ver los {data.resumen[CASOS_DEL_RESUMEN[indicador.indicador]]} pacientes
                        </button>
                      )
                    }
                  >
                    <GraficoPuntos
                      datos={tasasMes(data.tasasPorMes, indicador.casos)}
                      nombreCasos={indicador.nombreCasos}
                      referencia={
                        data.resumen[indicador.global] === null
                          ? undefined
                          : { valor: data.resumen[indicador.global] ?? 0, etiqueta: `Promedio del periodo ${num(data.resumen[indicador.global])}%` }
                      }
                      textoClic={`Clic para ver los pacientes del mes`}
                      seleccion={null}
                      onSeleccionar={(mes) => detalle.abrir(indicador.indicador, mes)}
                    />
                  </Tarjeta>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Tarjeta titulo="Complicaciones intraquirúrgicas por tipo" descripcion="Cuántos pacientes tuvieron cada complicación en quirófano.">
                  <GraficoBarras
                    datos={data.porComplicacionIntraqx.datos}
                    conPorcentaje
                    totalPorcentaje={data.porComplicacionIntraqx.pacientes}
                    {...interaccion('complicacion_intraqx')}
                  />
                  <NotaMultiple {...data.porComplicacionIntraqx} ninguno="sin complicación intraquirúrgica registrada" />
                </Tarjeta>
                <Tarjeta titulo="Complicaciones postoperatorias por tipo" descripcion="Cuántos pacientes tuvieron cada complicación después de la cirugía.">
                  <GraficoBarras
                    datos={data.porComplicacionPop.datos}
                    conPorcentaje
                    totalPorcentaje={data.porComplicacionPop.pacientes}
                    {...interaccion('complicacion_pop')}
                  />
                  <NotaMultiple {...data.porComplicacionPop} ninguno="sin complicación postoperatoria registrada" />
                </Tarjeta>
                <Tarjeta
                  titulo="Reingreso a la institución en los primeros 30 días"
                  descripcion="Según el seguimiento post-egreso (Módulo 5). No incluye a los pacientes fallecidos."
                >
                  <GraficoSiNo
                    segmentos={segmentosSiNo(data.porReingreso, true)}
                    unidad="pacientes con seguimiento"
                    significado="reingresaron"
                    {...interaccion('reingreso')}
                  />
                </Tarjeta>
                <Tarjeta titulo="Causa de reingreso" descripcion="Por qué volvieron los pacientes que reingresaron.">
                  <GraficoBarras datos={data.porCausaReingreso} conPorcentaje {...interaccion('causa_reingreso')} />
                </Tarjeta>
              </div>
            </div>
          )}

          {/* Peso, talla y superficie corporal se agrupan en rangos fijos de uso clínico (definidos en
              server/rutas-consultas.mjs), distintos para niños y adultos: histogramas en el orden de
              los rangos, no el de la cantidad, para que se lea la forma de la distribución. */}
          {vista === 'pacientes' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* La EPS va de segunda, junto al sexo (pedido del equipo); el resto sigue en filas de alto
                  parecido: la procedencia con su municipio, la edad con el peso, y la talla con la
                  superficie corporal. */}
              <Tarjeta titulo="Cirugías por sexo" descripcion="Proporción de pacientes operados de cada sexo.">
                <GraficoDona segmentos={segmentosSexo(data.porSexo, opcionesSexo?.map((o) => o.valor) ?? [])} {...interaccion('sexo')} />
              </Tarjeta>
              <Tarjeta titulo="Distribución por EPS" descripcion="Cuántos pacientes operados tiene cada EPS.">
                <GraficoBarras datos={data.porEps} conPorcentaje {...interaccion('eps')} />
              </Tarjeta>
              <Tarjeta titulo="Distribución por procedencia" descripcion="De qué departamento vienen los pacientes operados.">
                <GraficoBarras datos={data.porProcedencia} conPorcentaje {...interaccion('procedencia')} />
              </Tarjeta>
              <Tarjeta titulo="Procedencia por municipio de Nariño" descripcion="De qué municipio vienen los pacientes de Nariño.">
                <GraficoBarras datos={data.porMunicipio} conPorcentaje {...interaccion('municipio')} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por edad"
                descripcion="Cuántos pacientes hay en cada grupo de edad, según la edad cumplida el día de la cirugía."
                acciones={<Mediana valor={data.estadisticas.edad_anios.mediana} unidad="años" />}>
                <GraficoColumnas datos={data.porEdad} histograma {...interaccion('edad')} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por peso" descripcion="Cuántos pacientes hay en cada rango de peso." acciones={<Mediana valor={data.estadisticas.peso.mediana} unidad="kg" />}>
                <GraficoColumnas datos={data.porPeso} histograma unidad="kg" {...interaccion('peso')} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por talla" descripcion="Cuántos pacientes hay en cada rango de talla." acciones={<Mediana valor={data.estadisticas.talla.mediana} unidad="cm" />}>
                <GraficoColumnas datos={data.porTalla} histograma unidad="cm" {...interaccion('talla')} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por superficie corporal"
                descripcion="Calculada con (peso en kg × 4 + 7) ÷ (peso en kg + 90), con el peso del Módulo 1."
                acciones={<Mediana valor={data.estadisticas.superficie_corporal.mediana} unidad="m²" decimales={2} />}
              >
                <GraficoColumnas datos={data.porSuperficieCorporal} histograma unidad="m²" {...interaccion('superficie')} />
              </Tarjeta>
            </div>
          )}

          {vista === 'riesgo' && (
            <div className="space-y-4">
              {/* Columnas para la escala ordinal de riesgo y puntos para la tasa de mortalidad: mismas
                  categorías, en el mismo orden, una junto a la otra (y el mismo filtro). */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Tarjeta titulo={`Cirugías por ${tituloRiesgo}`} descripcion="Cuántos pacientes hay en cada categoría de riesgo quirúrgico.">
                  <GraficoColumnas datos={data.porRiesgoTotal} {...interaccion('riesgo')} />
                </Tarjeta>
                <Tarjeta titulo={`Mortalidad por ${tituloRiesgo} (%)`} descripcion="De cada 100 pacientes de cada categoría de riesgo, cuántos fallecieron.">
                  <GraficoPuntos datos={data.porRiesgoMortalidad} nombreCasos={['fallecido', 'fallecidos']} {...interaccion('riesgo')} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Cirugías por diagnóstico" descripcion="Cuántos pacientes operados tienen cada diagnóstico, como principal o como adicional.">
                <GraficoBarras datos={data.porDiagnostico.datos} {...interaccion('diagnostico')} />
                <p className="mt-3 text-xs text-slate-500">
                  Un paciente con diagnóstico adicional cuenta en sus dos diagnósticos: las barras suman más que los {data.porDiagnostico.pacientes} pacientes.
                </p>
              </Tarjeta>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Tarjeta titulo="Tipo de valvulopatía" descripcion="Solo los pacientes con diagnóstico de valvulopatía.">
                  <GraficoBarras datos={data.porValvulopatia} conPorcentaje {...interaccion('valvulopatia')} />
                </Tarjeta>
                <Tarjeta titulo="Factores de riesgo" descripcion="Cuántos pacientes tienen cada factor de riesgo.">
                  <GraficoBarras
                    datos={data.porFactorRiesgo.datos}
                    conPorcentaje
                    totalPorcentaje={data.porFactorRiesgo.pacientes}
                    {...interaccion('factor_riesgo')}
                  />
                  <NotaMultiple {...data.porFactorRiesgo} ninguno="sin factores de riesgo registrados" />
                </Tarjeta>
              </div>
            </div>
          )}

          {/* El acto quirúrgico: qué se hizo, con qué y cómo terminó en el quirófano. Las preguntas
              Sí/No van en donas; los tiempos, en histogramas con su mediana. */}
          {vista === 'cirugia' && (
            <div className="space-y-4">
              <Tarjeta titulo="Procedimiento quirúrgico realizado" descripcion="Cuántas veces se realizó cada procedimiento.">
                <GraficoBarras datos={data.porProcedimiento} {...interaccion('procedimiento')} />
              </Tarjeta>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Tarjeta titulo="Tipo de implante" descripcion="Cuántas cirugías llevaron cada tipo de implante en alguno de sus procedimientos.">
                  <GraficoBarras
                    datos={data.porImplante.datos}
                    conPorcentaje
                    totalPorcentaje={data.porImplante.pacientes}
                    {...interaccion('implante')}
                  />
                  <NotaMultiple {...data.porImplante} ninguno="sin implante registrado" />
                </Tarjeta>
                <Tarjeta titulo="Uso de circulación extracorpórea" descripcion="¿La cirugía se hizo con circulación extracorpórea (CEC)?">
                  <GraficoSiNo segmentos={segmentosSiNo(data.porUsoCec)} significado="con circulación extracorpórea" {...interaccion('uso_cec')} />
                </Tarjeta>
                <Tarjeta
                  titulo="Tiempo de circulación extracorpórea" descripcion="Cuántas cirugías con CEC duraron cada rango de minutos en bomba."
                  acciones={<Mediana valor={data.estadisticas.tiempo_cec.mediana} unidad="min" decimales={0} />}
                >
                  <GraficoColumnas datos={data.porTiempoCec} histograma unidad="min" {...interaccion('tiempo_cec')} />
                </Tarjeta>
                <Tarjeta
                  titulo="Tiempo de clamp de aorta" descripcion="Cuántas cirugías con CEC tuvieron la aorta pinzada cada rango de minutos."
                  acciones={<Mediana valor={data.estadisticas.tiempo_clamp.mediana} unidad="min" decimales={0} />}
                >
                  <GraficoColumnas datos={data.porTiempoClamp} histograma unidad="min" {...interaccion('tiempo_clamp')} />
                </Tarjeta>
                <Tarjeta titulo="Cierre esternal diferido" descripcion="¿Se dejó el esternón abierto para cerrarlo en un segundo tiempo?">
                  <GraficoSiNo segmentos={segmentosSiNo(data.porCierreEsternal)} significado="con cierre esternal diferido" {...interaccion('cierre_esternal')} />
                </Tarjeta>
                <Tarjeta titulo="Extubación en quirófano" descripcion="¿El paciente salió del quirófano ya extubado?">
                  <GraficoSiNo segmentos={segmentosSiNo(data.porExtubacion)} significado="con extubación en quirófano" {...interaccion('extubacion')} />
                </Tarjeta>
              </div>
            </div>
          )}

          {vista === 'postoperatorio' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Unidad del paciente en el postoperatorio" descripcion="A qué unidad pasó cada paciente después de la cirugía.">
                <GraficoBarras datos={data.porUnidadPop} conPorcentaje {...interaccion('unidad_pop')} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por horas de ventilación mecánica" descripcion="Cuántos pacientes estuvieron conectados al ventilador cada rango de horas." acciones={<Mediana valor={data.estadisticas.horas_vm.mediana} unidad="h" />}>
                <GraficoColumnas datos={data.porHorasVm} histograma unidad="h" {...interaccion('horas_vm')} />
              </Tarjeta>
              <Tarjeta titulo="Días de estancia en UCI" descripcion="Cuántos pacientes estuvieron en UCI cada rango de días después de la cirugía." acciones={<Mediana valor={data.estadisticas.dias_uci.mediana} unidad="días" />}>
                <GraficoColumnas datos={data.porDiasUci} histograma unidad="días" {...interaccion('dias_uci')} />
              </Tarjeta>
              <Tarjeta titulo="Días totales de hospitalización" descripcion="Cuántos pacientes estuvieron hospitalizados cada rango de días después de la cirugía." acciones={<Mediana valor={data.estadisticas.dias_hosp.mediana} unidad="días" />}>
                <GraficoColumnas datos={data.porDiasHosp} histograma unidad="días" {...interaccion('dias_hosp')} />
              </Tarjeta>
              <Tarjeta titulo="Condición de egreso" descripcion="En qué condición salió cada paciente de la institución.">
                <GraficoBarras datos={data.porCondicionSalida} conPorcentaje {...interaccion('condicion_salida')} />
              </Tarjeta>
              <Tarjeta titulo="Terapia de rehabilitación cardíaca" descripcion="Según el seguimiento post-egreso. No incluye a los pacientes fallecidos.">
                <GraficoSiNo
                  segmentos={segmentosSiNo(data.porRehabilitacion)}
                  unidad="pacientes con seguimiento"
                  significado="recibieron terapia de rehabilitación cardíaca"
                  {...interaccion('rehabilitacion')}
                />
              </Tarjeta>
              <Tarjeta titulo="Estado de la herida quirúrgica" descripcion="Cómo estaba la herida en el control post-egreso. No incluye a los pacientes fallecidos." className="lg:col-span-2">
                <GraficoDona segmentos={segmentosHerida(data.porHeridaGrupo)} {...interaccion('herida_grupo')} />
              </Tarjeta>
            </div>
          )}

          {vista === 'matriz' && (
            <MatrizResumen
              pacientes={matriz.data}
              cargando={matriz.isLoading}
              grupo={grupo === 'adultos' ? 'Pacientes adultos' : 'Pacientes pediátricos'}
              claveGrupo={grupo}
              desde={desde}
              hasta={hasta}
              filtros={filtros}
              onFiltrar={alternarFiltro}
              nombreArchivo={`matriz-por-paciente-${grupo}-${desde}-a-${hasta}.xlsx`}
            />
          )}
        </div>
      )}
    </div>
  )
}
