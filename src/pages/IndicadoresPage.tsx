import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GraficoBarras } from '../components/GraficoBarras'
import { GraficoBarrasTiempo } from '../components/GraficoBarrasTiempo'
import { TarjetaKpi } from '../components/TarjetaKpi'
import { hoyIso } from '../lib/fechas'
import { api } from '../lib/api'

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
}

function useIndicadores(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['indicadores', desde, hasta],
    queryFn: async () => {
      const r = await api.get<{
        resumen: Resumen
        por_mes: { anio: number; mes: number; total_cirugias: number }[]
        por_diagnostico: { diagnostico: string; total_cirugias: number }[]
        por_procedimiento: { procedimiento: string; total_cirugias: number }[]
        por_rachs: { rachs: string; total_cirugias: number; mortalidad_pct: number }[]
        por_eps: { eps: string; total_cirugias: number }[]
        por_procedencia: { procedencia: string; total_cirugias: number }[]
      }>(`/indicadores?desde=${desde}&hasta=${hasta}`)
      return {
        resumen: r.resumen,
        porMes: r.por_mes.map((d) => ({ etiqueta: `${MESES[d.mes]} ${d.anio}`, valor: d.total_cirugias })),
        porDiagnostico: r.por_diagnostico.map((d) => ({ etiqueta: d.diagnostico, valor: d.total_cirugias })),
        porProcedimiento: r.por_procedimiento.map((d) => ({ etiqueta: d.procedimiento, valor: d.total_cirugias })),
        porRachsTotal: r.por_rachs.map((d) => ({ etiqueta: `RACHS ${d.rachs}`, valor: d.total_cirugias })),
        porRachsMortalidad: r.por_rachs.map((d) => ({ etiqueta: `RACHS ${d.rachs}`, valor: d.mortalidad_pct ?? 0 })),
        porEps: r.por_eps.map((d) => ({ etiqueta: d.eps, valor: d.total_cirugias })),
        porProcedencia: r.por_procedencia.map((d) => ({ etiqueta: d.procedencia, valor: d.total_cirugias })),
      }
    },
  })
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
      {children}
    </div>
  )
}

function num(v: number | null, decimales = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimales)
}

export function IndicadoresPage() {
  const [desde, setDesde] = useState(haceMeses(12))
  const [hasta, setHasta] = useState(hoyIso())
  const { data, isLoading, error } = useIndicadores(desde, hasta)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tablero de indicadores</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => { setDesde(haceMeses(1)); setHasta(hoyIso()) }}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Últimos 30 días
          </button>
          <button
            type="button"
            onClick={() => { setDesde(inicioDeAnio()); setHasta(hoyIso()) }}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Este año
          </button>
          <button
            type="button"
            onClick={() => { setDesde('2000-01-01'); setHasta(hoyIso()) }}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Todo
          </button>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
          <span className="text-slate-400">–</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && <p className="text-sm text-red-600">No se pudieron cargar los indicadores.</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <TarjetaKpi etiqueta="Total de cirugías" valor={String(data.resumen.total_cirugias)} />
            <TarjetaKpi
              etiqueta="Mortalidad hospitalaria"
              valor={`${num(data.resumen.mortalidad_hospitalaria_pct)}%`}
              tono="critico"
            />
            <TarjetaKpi etiqueta="Complicación intraquirúrgica" valor={`${num(data.resumen.tasa_complicacion_intraqx_pct)}%`} />
            <TarjetaKpi etiqueta="Complicación postoperatoria" valor={`${num(data.resumen.tasa_complicacion_pop_pct)}%`} />
            <TarjetaKpi etiqueta="Reingreso a 30 días" valor={`${num(data.resumen.tasa_reingreso_30d_pct)}%`} />
          </div>

          <Tarjeta titulo="Tiempos y estancia (promedio / mediana)">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1">Indicador</th>
                  <th className="py-1">Promedio</th>
                  <th className="py-1">Mediana</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="py-1">Días en UCI</td>
                  <td className="py-1">{num(data.resumen.dias_uci_promedio)}</td>
                  <td className="py-1">{num(data.resumen.dias_uci_mediana)}</td>
                </tr>
                <tr>
                  <td className="py-1">Días de hospitalización</td>
                  <td className="py-1">{num(data.resumen.dias_hospitalizacion_promedio)}</td>
                  <td className="py-1">{num(data.resumen.dias_hospitalizacion_mediana)}</td>
                </tr>
                <tr>
                  <td className="py-1">Horas de ventilación mecánica</td>
                  <td className="py-1">{num(data.resumen.horas_ventilacion_promedio)}</td>
                  <td className="py-1">{num(data.resumen.horas_ventilacion_mediana)}</td>
                </tr>
                <tr>
                  <td className="py-1">Tiempo de CEC (min)</td>
                  <td className="py-1">{num(data.resumen.tiempo_cec_promedio)}</td>
                  <td className="py-1">—</td>
                </tr>
                <tr>
                  <td className="py-1">Tiempo de clamp de aorta (min)</td>
                  <td className="py-1">{num(data.resumen.tiempo_clamp_promedio)}</td>
                  <td className="py-1">—</td>
                </tr>
              </tbody>
            </table>
          </Tarjeta>

          <Tarjeta titulo="Cirugías por mes">
            <GraficoBarrasTiempo datos={data.porMes} />
          </Tarjeta>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Cirugías por RACHS-1">
              <GraficoBarras datos={data.porRachsTotal} />
            </Tarjeta>
            <Tarjeta titulo="Mortalidad por RACHS-1 (%)">
              <GraficoBarras datos={data.porRachsMortalidad} color="rojo" sufijoValor="%" />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Cirugías por diagnóstico">
            <GraficoBarras datos={data.porDiagnostico} />
          </Tarjeta>

          <Tarjeta titulo="Cirugías por procedimiento">
            <GraficoBarras datos={data.porProcedimiento} />
          </Tarjeta>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Distribución por EPS">
              <GraficoBarras datos={data.porEps} />
            </Tarjeta>
            <Tarjeta titulo="Distribución por procedencia">
              <GraficoBarras datos={data.porProcedencia} />
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  )
}
