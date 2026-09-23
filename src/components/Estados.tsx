import type { ReactNode } from 'react'

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

/** Mensaje de error consistente (fondo tenue + borde, en vez de una línea roja suelta). */
export function MensajeError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>
  )
}

/** Mensaje de éxito consistente (mismo tratamiento que MensajeError, en verde). */
export function MensajeExito({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{children}</div>
  )
}

/** Mensaje de advertencia (no bloqueante), mismo tratamiento en tono ámbar. */
export function MensajeAdvertencia({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{children}</div>
  )
}

/** Estado vacío con icono, para listas/tablas sin resultados. */
export function EstadoVacio({ icono, mensaje }: { icono?: ReactNode; mensaje: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-slate-400">
      {icono && <span className="text-slate-300">{icono}</span>}
      <p className="text-sm">{mensaje}</p>
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
