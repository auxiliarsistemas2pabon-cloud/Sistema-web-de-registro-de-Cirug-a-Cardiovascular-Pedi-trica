import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
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

/** Iniciales para el avatar circular (mismo criterio que el AppShell). */
function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

/** "Vencida hace 1 día" / "Falta 1 día" / "Faltan 3 días" / "Vence hoy": con la pluralización correcta. */
function textoEstado(diasDesdeReferencia: number): string {
  if (diasDesdeReferencia > 0) {
    return `Vencida hace ${diasDesdeReferencia} ${diasDesdeReferencia === 1 ? 'día' : 'días'}`
  }
  const restantes = Math.abs(diasDesdeReferencia)
  if (restantes === 0) return 'Vence hoy'
  return `${restantes === 1 ? 'Falta' : 'Faltan'} ${restantes} ${restantes === 1 ? 'día' : 'días'}`
}

function IconoTelefono() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path
        d="M5 4h3l1.5 4.5-2 1.5a11 11 0 0 0 5 5l1.5-2L18 14.5V17.5a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoCalendario() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" strokeLinecap="round" />
    </svg>
  )
}

function IconoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Seccion({ titulo, icono, alertas }: { titulo: string; icono: ReactNode; alertas: Alerta[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/10 text-[var(--pabon-azul-oscuro)]">
          {icono}
        </span>
        <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
        <span className="ml-auto inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-semibold text-slate-600">
          {alertas.length}
        </span>
      </div>
      {alertas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-emerald-600">
          <IconoCheck />
          <p className="text-sm text-slate-400">Sin pendientes.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {alertas.map((a) => {
            const vencida = a.dias_desde_referencia > 0
            return (
              <li key={`${a.paciente_id}-${a.tipo_alerta}`}>
                <Link
                  to={`/pacientes/${a.paciente_id}`}
                  className={`flex items-center gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-slate-50 sm:gap-4 sm:px-5 ${
                    vencida ? 'border-red-400' : 'border-amber-400'
                  }`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {iniciales(a.nombre_completo)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{a.nombre_completo}</span>
                    <span className="block text-xs text-slate-400">{a.identificacion}</span>
                  </span>
                  <span
                    className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                      vencida ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {textoEstado(a.dias_desde_referencia)}
                  </span>
                  <span className="hidden flex-none text-xs text-slate-400 sm:block">
                    {formatearFecha(a.fecha_referencia)}
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
  const total = llamadas.length + altas.length
  const vencidas = (alertas ?? []).filter((a) => a.dias_desde_referencia > 0).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Alertas de seguimiento</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {total === 0
            ? 'No hay alertas pendientes.'
            : `${total} ${total === 1 ? 'alerta activa' : 'alertas activas'}${vencidas > 0 ? `, ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : ''}.`}
        </p>
      </div>
      <Seccion titulo="Llamada de los 15 días pendiente o vencida" icono={<IconoTelefono />} alertas={llamadas} />
      <Seccion titulo="Alta hace menos de 30 días sin seguimiento completo" icono={<IconoCalendario />} alertas={altas} />
    </div>
  )
}
