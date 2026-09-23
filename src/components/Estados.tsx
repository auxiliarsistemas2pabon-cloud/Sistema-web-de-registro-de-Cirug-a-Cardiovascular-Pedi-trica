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

/** Estado vacío con icono, para listas/tablas sin resultados. */
export function EstadoVacio({ icono, mensaje }: { icono?: ReactNode; mensaje: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-slate-400">
      {icono && <span className="text-slate-300">{icono}</span>}
      <p className="text-sm">{mensaje}</p>
    </div>
  )
}
