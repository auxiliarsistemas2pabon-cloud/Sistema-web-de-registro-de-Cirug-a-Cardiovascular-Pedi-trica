import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatearFecha } from '../lib/fechas'
import { useAlertas, type Alerta } from '../hooks/useAlertas'
import { Cargando, MensajeError } from '../components/Estados'
import { Badge } from '../components/ui/badge'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { IconoCampana } from '../components/iconos'
import { useGrupoActivo } from '../lib/grupoActivo'

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface PropsSeccion {
  titulo: string
  /** Qué pone a un paciente en esta lista: la segunda línea del encabezado. */
  detalle: string
  /** Lo que se lee cuando no hay ningún paciente en la lista. */
  mensajeVacio: string
  icono: ReactNode
  alertas: Alerta[]
  rutaBase: string
}

function Seccion({ titulo, detalle, mensajeVacio, icono, alertas, rutaBase }: PropsSeccion) {
  return (
    <section className="@container overflow-clip rounded-xl border border-slate-200/80 bg-white shadow-[var(--sombra-tarjeta)]">
      {/* Título y detalle en una línea cada uno cuando las dos tarjetas van lado a lado (lg): así sus
          encabezados miden lo mismo y las listas arrancan a la misma altura. */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--pabon-azul-oscuro)]/[0.08] text-[var(--pabon-azul-oscuro)]">
          {icono}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900 lg:truncate">{titulo}</h2>
          <p className="text-xs text-slate-500 lg:truncate" title={detalle}>{detalle}</p>
        </div>
        <span className="ml-auto inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-600">
          {alertas.length}
        </span>
      </div>
      {alertas.length === 0 ? (
        // Vacío compacto, en una fila: una tarjeta sin pendientes no necesita ocupar media pantalla.
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-50 text-[#059669]">
            <IconoCheck />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Sin pendientes</p>
            <p className="text-xs text-slate-500">{mensajeVacio}</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {alertas.map((a) => {
            const vencida = a.dias_desde_referencia > 0
            return (
              <li key={`${a.paciente_id}-${a.tipo_alerta}`}>
                <Link
                  to={`${rutaBase}/${a.paciente_id}`}
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
                  <Badge
                    variant="outline"
                    className={`flex-none whitespace-nowrap ${vencida ? 'bg-red-100 text-red-700 border-red-200/60' : 'bg-amber-100 text-amber-700 border-amber-200/60'}`}
                  >
                    {textoEstado(a.dias_desde_referencia)}
                  </Badge>
                  {/* La fecha solo cabe si la tarjeta es ancha (según la tarjeta, no la pantalla: lado a
                      lado miden la mitad); si no, le quitaría espacio al nombre. */}
                  <span className="hidden flex-none text-xs text-slate-400 @lg:block">
                    {formatearFecha(a.fecha_referencia)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function AlertasPage() {
  const { grupo } = useGrupoActivo()
  const { data: alertas, isLoading, error } = useAlertas(grupo)
  const rutaBase = grupo === 'adultos' ? '/adultos' : '/pacientes'
  const etiquetaGrupo = grupo === 'adultos' ? 'pacientes adultos' : 'pacientes pediátricos'

  const llamadas = alertas?.filter((a) => a.tipo_alerta === 'llamada_15_dias') ?? []
  const altas = alertas?.filter((a) => a.tipo_alerta === 'seguimiento_pendiente_alta') ?? []
  const total = llamadas.length + altas.length
  const vencidas = (alertas ?? []).filter((a) => a.dias_desde_referencia > 0).length

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        icono={<IconoCampana className="h-5 w-5" />}
        titulo="Alertas de seguimiento"
        subtitulo={
          isLoading
            ? undefined
            : total === 0
              ? `No hay alertas pendientes de ${etiquetaGrupo}.`
              : `${total} ${total === 1 ? 'alerta activa' : 'alertas activas'} de ${etiquetaGrupo}${vencidas > 0 ? `, ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : ''}.`
        }
      />

      {isLoading && <Cargando />}
      {error && <MensajeError>No se pudieron cargar las alertas.</MensajeError>}

      {!isLoading && !error && (
        // Lado a lado en pantallas anchas: cada lista ocupa media página en vez de una franja a todo
        // lo ancho. items-start: una tarjeta vacía no se estira hasta el alto de la que tiene pacientes.
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Seccion
            titulo="Llamada de los 15 días"
            detalle="Pendiente o vencida"
            mensajeVacio="Ningún paciente tiene pendiente la llamada de los 15 días."
            icono={<IconoTelefono />}
            alertas={llamadas}
            rutaBase={rutaBase}
          />
          <Seccion
            titulo="Seguimiento después del alta"
            detalle="Alta hace menos de 30 días, sin seguimiento completo"
            mensajeVacio="Ningún paciente dado de alta en los últimos 30 días tiene el seguimiento incompleto."
            icono={<IconoCalendario />}
            alertas={altas}
            rutaBase={rutaBase}
          />
        </div>
      )}
    </div>
  )
}
