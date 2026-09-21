import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatearFecha } from '../lib/fechas'
import { api } from '../lib/api'

interface Alerta {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  tipo_alerta: 'llamada_15_dias' | 'seguimiento_pendiente_alta'
  fecha_referencia: string
  dias_desde_referencia: number
}

function useAlertas() {
  return useQuery({
    queryKey: ['alertas'],
    queryFn: () => api.get<Alerta[]>('/alertas'),
  })
}

function Seccion({ titulo, alertas }: { titulo: string; alertas: Alerta[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
        {titulo} ({alertas.length})
      </h2>
      {alertas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">Sin pendientes.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {alertas.map((a) => {
            const vencida = a.dias_desde_referencia > 0
            return (
              <li key={`${a.paciente_id}-${a.tipo_alerta}`} className="px-4 py-3">
                <Link
                  to={`/pacientes/${a.paciente_id}`}
                  className="flex items-center justify-between gap-4 hover:underline"
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {a.nombre_completo} <span className="text-slate-400">· {a.identificacion}</span>
                  </span>
                  <span className={`text-sm ${vencida ? 'text-red-600' : 'text-amber-600'}`}>
                    {vencida
                      ? `Vencida hace ${a.dias_desde_referencia} días`
                      : `Faltan ${Math.abs(a.dias_desde_referencia)} días`}{' '}
                    ({formatearFecha(a.fecha_referencia)})
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function AlertasPage() {
  const { data: alertas, isLoading, error } = useAlertas()

  if (isLoading) return <p className="text-sm text-slate-500">Cargando…</p>
  if (error) return <p className="text-sm text-red-600">No se pudieron cargar las alertas.</p>

  const llamadas = alertas?.filter((a) => a.tipo_alerta === 'llamada_15_dias') ?? []
  const altas = alertas?.filter((a) => a.tipo_alerta === 'seguimiento_pendiente_alta') ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Alertas de seguimiento</h1>
      <Seccion titulo="Llamada de los 15 días pendiente o vencida" alertas={llamadas} />
      <Seccion titulo="Alta hace menos de 30 días sin seguimiento completo" alertas={altas} />
    </div>
  )
}
