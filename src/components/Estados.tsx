import type { ReactNode } from 'react'
import { IconoAlerta, IconoCheck } from './iconos'

/** Estado de carga consistente (reemplaza el texto suelto "Cargando…" repetido en cada página). */
export function Cargando({ etiqueta = 'Cargando…' }: { etiqueta?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-8 text-sm text-slate-500">
      <span
        className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-slate-200 border-t-[var(--pabon-azul-oscuro)]"
        aria-hidden
      />
      {etiqueta}
    </div>
  )
}

/** Mensaje de error consistente (fondo tenue + borde + ícono, en vez de una línea roja suelta). */
export function MensajeError({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <IconoAlerta className="mt-0.5 h-4 w-4 flex-none" />
      <span>{children}</span>
    </div>
  )
}

/** Mensaje de éxito consistente (mismo tratamiento que MensajeError, en verde). */
export function MensajeExito({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <IconoCheck className="mt-0.5 h-4 w-4 flex-none" />
      <span>{children}</span>
    </div>
  )
}

/** Mensaje de advertencia (no bloqueante), mismo tratamiento en tono ámbar. */
export function MensajeAdvertencia({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      <IconoAlerta className="mt-0.5 h-4 w-4 flex-none" />
      <span>{children}</span>
    </div>
  )
}

/** Estado vacío con icono, para listas/tablas sin resultados (con título y acción opcionales). */
export function EstadoVacio({
  icono,
  titulo,
  mensaje,
  accion,
}: {
  icono?: ReactNode
  titulo?: string
  mensaje: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      {icono && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pabon-azul-oscuro)]/[0.07] text-[var(--pabon-azul-oscuro)] ring-8 ring-[var(--pabon-azul-oscuro)]/[0.03]">
          {icono}
        </span>
      )}
      {titulo && <p className="text-base font-semibold text-slate-900">{titulo}</p>}
      <p className={`max-w-sm text-sm text-slate-500 ${titulo ? 'mt-1' : ''}`}>{mensaje}</p>
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}

/** Aviso neutro en lugar de un formulario (ni error ni éxito): "este módulo no aplica", "guarda
 * primero el módulo anterior"… */
export function AvisoInformativo({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-[var(--pabon-azul-oscuro)] ring-1 ring-slate-200">
        {icono}
      </span>
      <span>{children}</span>
    </div>
  )
}

/** Aviso de solo lectura para los formularios de módulo cuando el rol es "consulta". */
export function AvisoSoloLectura() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 flex-none text-slate-400">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
      </svg>
      Modo consulta: este registro es de solo lectura.
    </div>
  )
}
