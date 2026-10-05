import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { claseBotonTexto, claseInput } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { Cargando, MensajeError } from '../components/Estados'
import { GraficoBarras } from '../components/GraficoBarras'
import { GraficoColumnas } from '../components/GraficoColumnas'
import { GraficoDona, type Segmento } from '../components/GraficoDona'
import { GraficoLineaTiempo } from '../components/GraficoLineaTiempo'
import { GraficoPuntos } from '../components/GraficoPuntos'
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
import { NOMBRE_CAMPO, type CampoFiltro, type Filtro } from './indicadores/filtros'
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
  tiempo_cec_promedio: number | null
  tiempo_clamp_promedio: number | null
  // Solo en el grupo adultos.
  euroscore_promedio?: number | null
  euroscore_mediana?: number | null
}

/** Conteo de pacientes por categoría o por rango (las distribuciones vienen ya agrupadas del servidor). */
type Conteo = { categoria: string; total_cirugias: number }[]
const aDatos = (conteo: Conteo) => conteo.map((d) => ({ etiqueta: d.categoria, valor: d.total_cirugias }))

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
        estadisticas: Record<'peso' | 'talla' | 'superficie_corporal' | 'dias_uci' | 'horas_vm', Estadisticas>
        por_mes: { anio: number; mes: number; total_cirugias: number }[]
        por_diagnostico: { diagnostico: string; total_cirugias: number }[]
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
        porDiagnostico: r.por_diagnostico.map((d) => ({ etiqueta: d.diagnostico, valor: d.total_cirugias })),
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

function num(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimales)
}

/** El tablero se recorre por categorías, una a la vez, en vez de una sola página con todos los
 * gráficos apilados. La pestaña activa va en la URL (?vista=…) para que sobreviva a una recarga. */
const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen', icono: <IconoGrafico /> },
  { clave: 'matriz', etiqueta: 'Matriz de resumen', etiquetaCorta: 'Matriz', icono: <IconoLista /> },
  { clave: 'riesgo', etiqueta: 'Riesgo y cirugía', icono: <IconoCorazon /> },
  { clave: 'pacientes', etiqueta: 'Pacientes', icono: <IconoPacientes /> },
  { clave: 'postoperatorio', etiqueta: 'Postoperatorio', icono: <IconoReloj /> },
] as const

type Vista = (typeof PESTANAS)[number]['clave']

function useVista(): [Vista, (vista: Vista) => void] {
  const [params, setParams] = useSearchParams()
  const vista = PESTANAS.find((p) => p.clave === params.get('vista'))?.clave ?? 'resumen'
  // replace: cambiar de pestaña no deja una entrada por cada clic en el historial del navegador.
  return [vista, (nueva) => setParams({ vista: nueva }, { replace: true })]
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
          ocupa la fila completa); desde sm, en una sola fila. */}
      <div role="tablist" className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={vista === p.clave}
            onClick={() => setVista(p.clave)}
            className={`flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors last:odd:col-span-2 ${
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

      {isLoading && <Cargando />}
      {error && <MensajeError>No se pudieron cargar los indicadores.</MensajeError>}

      {data && (
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
                <TarjetaKpi
                  etiqueta="Mortalidad hospitalaria"
                  valor={`${num(data.resumen.mortalidad_hospitalaria_pct)}%`}
                  tono="critico"
                  icono={<IconoAlerta className="h-4 w-4" />}
                />
                <TarjetaKpi
                  etiqueta="Complicación intraquirúrgica"
                  valor={`${num(data.resumen.tasa_complicacion_intraqx_pct)}%`}
                  icono={<IconoEscudo className="h-4 w-4" />}
                />
                <TarjetaKpi
                  etiqueta="Complicación postoperatoria"
                  valor={`${num(data.resumen.tasa_complicacion_pop_pct)}%`}
                  icono={<IconoEscudo className="h-4 w-4" />}
                />
                <TarjetaKpi
                  etiqueta="Reingreso a 30 días"
                  valor={`${num(data.resumen.tasa_reingreso_30d_pct)}%`}
                  icono={<IconoRegresar className="h-4 w-4" />}
                />
              </div>

              <Tarjeta titulo="Cirugías por mes">
                <GraficoLineaTiempo datos={data.porMes} {...interaccion('mes')} />
              </Tarjeta>

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
                        { etiqueta: 'Tiempo de CEC (min)', promedio: data.resumen.tiempo_cec_promedio, mediana: undefined },
                        { etiqueta: 'Tiempo de clamp de aorta (min)', promedio: data.resumen.tiempo_clamp_promedio, mediana: undefined },
                        ...(grupo === 'adultos'
                          ? [{ etiqueta: 'EuroSCORE (%)', promedio: data.resumen.euroscore_promedio, mediana: data.resumen.euroscore_mediana, decimales: 2 }]
                          : []),
                      ].map((fila) => (
                        <tr key={fila.etiqueta}>
                          <th scope="row" className="px-5 py-2.5 font-normal">{fila.etiqueta}</th>
                          <td className="px-5 py-2.5 text-right font-medium tabular-nums">{num(fila.promedio, fila.decimales)}</td>
                          <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                            {fila.mediana === undefined ? '—' : num(fila.mediana, fila.decimales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </div>
          )}

          {vista === 'matriz' && (
            <MatrizResumen
              pacientes={matriz.data}
              cargando={matriz.isLoading}
              grupo={grupo === 'adultos' ? 'Pacientes adultos' : 'Pacientes pediátricos'}
              desde={desde}
              hasta={hasta}
              filtros={filtros}
              onFiltrar={alternarFiltro}
              nombreArchivo={`matriz-por-paciente-${grupo}-${desde}-a-${hasta}.xlsx`}
            />
          )}

          {vista === 'riesgo' && (
            <div className="space-y-4">
              {/* Columnas para la escala ordinal de riesgo y puntos para la tasa de mortalidad: mismas
                  categorías, en el mismo orden, una junto a la otra (y el mismo filtro). */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Tarjeta titulo={`Cirugías por ${tituloRiesgo}`}>
                  <GraficoColumnas datos={data.porRiesgoTotal} {...interaccion('riesgo')} />
                </Tarjeta>
                <Tarjeta titulo={`Mortalidad por ${tituloRiesgo} (%)`}>
                  <GraficoPuntos datos={data.porRiesgoMortalidad} nombreCasos={['fallecido', 'fallecidos']} {...interaccion('riesgo')} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Cirugías por diagnóstico">
                <GraficoBarras datos={data.porDiagnostico} {...interaccion('diagnostico')} />
              </Tarjeta>

              <Tarjeta titulo="Cirugías por procedimiento">
                <GraficoBarras datos={data.porProcedimiento} {...interaccion('procedimiento')} />
              </Tarjeta>
            </div>
          )}

          {/* Peso, talla y superficie corporal se agrupan en rangos fijos de uso clínico (definidos en
              server/rutas-consultas.mjs), distintos para niños y adultos: histogramas en el orden de
              los rangos, no el de la cantidad, para que se lea la forma de la distribución. */}
          {vista === 'pacientes' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* La EPS va de segunda, junto al sexo (pedido del equipo); el resto sigue en filas de alto
                  parecido: la procedencia con el peso, y la talla con la superficie corporal. */}
              <Tarjeta titulo="Cirugías por sexo">
                <GraficoDona segmentos={segmentosSexo(data.porSexo, opcionesSexo?.map((o) => o.valor) ?? [])} {...interaccion('sexo')} />
              </Tarjeta>
              <Tarjeta titulo="Distribución por EPS">
                <GraficoBarras datos={data.porEps} conPorcentaje {...interaccion('eps')} />
              </Tarjeta>
              <Tarjeta titulo="Distribución por procedencia">
                <GraficoBarras datos={data.porProcedencia} conPorcentaje {...interaccion('procedencia')} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por peso" acciones={<Mediana valor={data.estadisticas.peso.mediana} unidad="kg" />}>
                <GraficoColumnas datos={data.porPeso} histograma unidad="kg" {...interaccion('peso')} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por talla" acciones={<Mediana valor={data.estadisticas.talla.mediana} unidad="cm" />}>
                <GraficoColumnas datos={data.porTalla} histograma unidad="cm" {...interaccion('talla')} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por superficie corporal"
                acciones={<Mediana valor={data.estadisticas.superficie_corporal.mediana} unidad="m²" decimales={2} />}
              >
                <GraficoColumnas datos={data.porSuperficieCorporal} histograma unidad="m²" {...interaccion('superficie')} />
                <p className="mt-3 text-xs text-slate-500">
                  Calculada con la fórmula de Mosteller, √(peso en kg × talla en cm ÷ 3600), con el peso y la talla del Módulo 1.
                </p>
              </Tarjeta>
            </div>
          )}

          {vista === 'postoperatorio' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <Tarjeta titulo="Cirugías por días de estancia en UCI" acciones={<Mediana valor={data.estadisticas.dias_uci.mediana} unidad="días" />}>
                <GraficoColumnas datos={data.porDiasUci} histograma unidad="días" {...interaccion('dias_uci')} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por horas de ventilación mecánica"
                acciones={<Mediana valor={data.estadisticas.horas_vm.mediana} unidad="h" />}
              >
                <GraficoColumnas datos={data.porHorasVm} histograma unidad="h" {...interaccion('horas_vm')} />
              </Tarjeta>
              <Tarjeta titulo="Estado de la herida quirúrgica" className="lg:col-span-2 xl:col-span-1">
                <GraficoDona segmentos={segmentosHerida(data.porHeridaGrupo)} {...interaccion('herida_grupo')} />
                <p className="mt-4 text-xs text-slate-500">
                  Según el seguimiento post-egreso (Módulo 5). No incluye a los pacientes fallecidos, para quienes el seguimiento no aplica.
                </p>
              </Tarjeta>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
