import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { claseInput } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { Cargando, MensajeError } from '../components/Estados'
import { GraficoBarras } from '../components/GraficoBarras'
import { GraficoBarrasTiempo } from '../components/GraficoBarrasTiempo'
import { Tarjeta } from '../components/Tarjeta'
import { IconoAlerta, IconoCorazon, IconoEscudo, IconoGrafico, IconoRegresar } from '../components/iconos'
import { TarjetaKpi } from '../components/TarjetaKpi'
import { api } from '../lib/api'
import { hoyIso } from '../lib/fechas'
import { useGrupoActivo, type GrupoActivo } from '../lib/grupoActivo'

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
  peso_mediana: number | null
  talla_mediana: number | null
  superficie_corporal_mediana: number | null
}

/** Conteo de cirugías por categoría o por rango (las distribuciones vienen ya agrupadas del servidor). */
type Conteo = { categoria: string; total_cirugias: number }[]
const aDatos = (conteo: Conteo) => conteo.map((d) => ({ etiqueta: d.categoria, valor: d.total_cirugias }))

/** El módulo pediátrico clasifica el riesgo con RACHS-1 (categórico, I a VI); el de adultos con
 * EuroSCORE (un porcentaje continuo), así que cada grupo trae su propio desglose de riesgo con su
 * propia etiqueta — no son el mismo gráfico con datos distintos, son dos escalas distintas. */
function useIndicadores(grupo: GrupoActivo, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['indicadores', grupo, desde, hasta],
    queryFn: async () => {
      const ruta = grupo === 'adultos' ? '/indicadores/adultos' : '/indicadores'
      const r = await api.get<{
        resumen: Resumen
        por_mes: { anio: number; mes: number; total_cirugias: number }[]
        por_diagnostico: { diagnostico: string; total_cirugias: number }[]
        por_procedimiento: { procedimiento: string; total_cirugias: number }[]
        por_rachs?: { rachs: string; total_cirugias: number; mortalidad_pct: number }[]
        por_euroscore?: { categoria: string; total_cirugias: number; mortalidad_pct: number }[]
        por_eps: { eps: string; total_cirugias: number }[]
        por_procedencia: { procedencia: string; total_cirugias: number }[]
        por_sexo: Conteo
        por_peso: Conteo
        por_talla: Conteo
        por_superficie_corporal: Conteo
        por_dias_uci: Conteo
        por_horas_vm: Conteo
        por_estado_herida: Conteo
      }>(`${ruta}?desde=${desde}&hasta=${hasta}`)
      return {
        resumen: r.resumen,
        porMes: r.por_mes.map((d) => ({ etiqueta: `${MESES[d.mes]} ${d.anio}`, valor: d.total_cirugias })),
        porDiagnostico: r.por_diagnostico.map((d) => ({ etiqueta: d.diagnostico, valor: d.total_cirugias })),
        porProcedimiento: r.por_procedimiento.map((d) => ({ etiqueta: d.procedimiento, valor: d.total_cirugias })),
        porRiesgoTotal: (r.por_rachs ?? r.por_euroscore ?? []).map((d) => ({
          etiqueta: 'rachs' in d ? `RACHS ${d.rachs}` : d.categoria,
          valor: d.total_cirugias,
        })),
        porRiesgoMortalidad: (r.por_rachs ?? r.por_euroscore ?? []).map((d) => ({
          etiqueta: 'rachs' in d ? `RACHS ${d.rachs}` : d.categoria,
          valor: d.mortalidad_pct ?? 0,
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
      }
    },
  })
}

function num(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimales)
}

/** Bloque titulado del tablero: agrupa gráficos relacionados para recorrer la página por temas. */
function SeccionIndicadores({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 pt-2">
      <div className="border-b border-slate-200 pb-2">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

/** Pocas categorías (sexo): cifra, porcentaje y una barra de proporción por categoría, en vez de un
 * gráfico de 2–3 barras que dejaba la tarjeta casi vacía. Los números quedan a la vista, sin tooltip. */
function ProporcionesCompactas({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  const total = datos.reduce((suma, d) => suma + d.valor, 0)
  if (!total) return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      {datos.map((d) => {
        const pct = Math.round((d.valor / total) * 100)
        return (
          <li key={d.etiqueta}>
            <p className="text-sm text-slate-600">{d.etiqueta}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">{d.valor}</span>
              <span className="text-sm tabular-nums text-slate-500">{pct}%</span>
            </p>
            {/* Medidor: el riel es un tono claro de la misma rampa azul que el relleno. */}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100" aria-hidden>
              <div className="h-full rounded-full bg-[var(--chart-azul)]" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Mediana del periodo junto al título de un gráfico de distribución (nada si no hay datos). */
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
  const { data, isLoading, error } = useIndicadores(grupo, desde, hasta)

  function aplicarPreset(valor: Preset) {
    setPreset(valor)
    setHasta(hoyIso())
    if (valor === '30') setDesde(haceMeses(1))
    else if (valor === 'anio') setDesde(inicioDeAnio())
    else if (valor === 'todo') setDesde('2000-01-01')
  }

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
        </div>
      </Tarjeta>

      {isLoading && <Cargando />}
      {error && <MensajeError>No se pudieron cargar los indicadores.</MensajeError>}

      {data && (
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

          <Tarjeta titulo="Cirugías por mes">
            <GraficoBarrasTiempo datos={data.porMes} />
          </Tarjeta>

          <SeccionIndicadores titulo="Riesgo, diagnóstico y procedimientos">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Tarjeta titulo={`Cirugías por ${tituloRiesgo}`}>
                <GraficoBarras datos={data.porRiesgoTotal} />
              </Tarjeta>
              <Tarjeta titulo={`Mortalidad por ${tituloRiesgo} (%)`}>
                <GraficoBarras datos={data.porRiesgoMortalidad} color="rojo" sufijoValor="%" />
              </Tarjeta>
            </div>

            <Tarjeta titulo="Cirugías por diagnóstico">
              <GraficoBarras datos={data.porDiagnostico} />
            </Tarjeta>

            <Tarjeta titulo="Cirugías por procedimiento">
              <GraficoBarras datos={data.porProcedimiento} />
            </Tarjeta>
          </SeccionIndicadores>

          {/* Peso, talla y superficie corporal se agrupan en rangos fijos de uso clínico (definidos en
              server/rutas-consultas.mjs), distintos para niños y adultos; las barras siguen el orden
              de los rangos, no el de la cantidad, para que se lea la forma de la distribución. */}
          <SeccionIndicadores
            titulo="Características de los pacientes"
            descripcion="Datos del Módulo 1 de los pacientes operados en el periodo."
          >
            <Tarjeta titulo="Cirugías por sexo">
              <ProporcionesCompactas datos={data.porSexo} />
            </Tarjeta>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Cirugías por peso" acciones={<Mediana valor={data.resumen.peso_mediana} unidad="kg" />}>
                <GraficoBarras datos={data.porPeso} />
              </Tarjeta>
              <Tarjeta titulo="Cirugías por talla" acciones={<Mediana valor={data.resumen.talla_mediana} unidad="cm" />}>
                <GraficoBarras datos={data.porTalla} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por superficie corporal"
                acciones={<Mediana valor={data.resumen.superficie_corporal_mediana} unidad="m²" decimales={2} />}
              >
                <GraficoBarras datos={data.porSuperficieCorporal} />
                <p className="mt-3 text-xs text-slate-500">
                  Calculada con la fórmula de Mosteller, √(peso en kg × talla en cm ÷ 3600), con el peso y la talla del Módulo 1.
                </p>
              </Tarjeta>
              <Tarjeta titulo="Distribución por EPS">
                <GraficoBarras datos={data.porEps} />
              </Tarjeta>
              <Tarjeta titulo="Distribución por procedencia" className="lg:col-span-2">
                <GraficoBarras datos={data.porProcedencia} />
              </Tarjeta>
            </div>
          </SeccionIndicadores>

          <SeccionIndicadores titulo="Estancia y evolución postoperatoria">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Cirugías por días de estancia en UCI" acciones={<Mediana valor={data.resumen.dias_uci_mediana} unidad="días" />}>
                <GraficoBarras datos={data.porDiasUci} />
              </Tarjeta>
              <Tarjeta
                titulo="Cirugías por horas de ventilación mecánica"
                acciones={<Mediana valor={data.resumen.horas_ventilacion_mediana} unidad="h" />}
              >
                <GraficoBarras datos={data.porHorasVm} />
              </Tarjeta>
              <Tarjeta titulo="Estado de la herida quirúrgica" className="lg:col-span-2">
                <GraficoBarras datos={data.porEstadoHerida} />
                <p className="mt-3 text-xs text-slate-500">
                  Según el seguimiento post-egreso (Módulo 5). No incluye a los pacientes fallecidos, para quienes el seguimiento no aplica.
                </p>
              </Tarjeta>
            </div>
          </SeccionIndicadores>
        </div>
      )}
    </div>
  )
}
