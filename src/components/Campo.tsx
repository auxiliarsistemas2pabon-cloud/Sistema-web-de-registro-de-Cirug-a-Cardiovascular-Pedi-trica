import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  error?: string
  children: ReactNode
  className?: string
  /** Acción pequeña alineada a la derecha de la etiqueta (p. ej. "Quitar"). Va fuera del <label>
   * a propósito: dentro, un clic en la etiqueta podría activar ese botón en vez de enfocar el campo. */
  accion?: ReactNode
}

/** Etiqueta + control. El <label> envuelve al control para quedar asociado a él (clic en la
 * etiqueta enfoca el campo y los lectores de pantalla lo anuncian) sin tener que repartir ids. */
export function Campo({ etiqueta, error, children, className, accion }: CampoProps) {
  return (
    <div className={accion ? `relative ${className ?? ''}` : className}>
      <label className="block">
        <span className={`mb-1.5 block text-sm font-medium text-slate-700 ${accion ? 'pr-24' : ''}`}>{etiqueta}</span>
        {children}
      </label>
      {accion && <div className="absolute right-0 top-0 flex h-5 items-center">{accion}</div>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const claseInput =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors outline-none hover:border-slate-400 focus:border-[var(--pabon-azul-oscuro)] focus:ring-3 focus:ring-[var(--pabon-azul-claro)]/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:border-slate-300'

export const claseBotonPrimario =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm shadow-sky-900/15 transition-all outline-none hover:bg-sky-700 hover:shadow-md hover:shadow-sky-900/15 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-60'

export const claseBotonSecundario =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs transition-all outline-none hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-60'

/** Variante compacta del botón secundario, para acciones dentro de filas de tabla. */
export const claseBotonSecundarioCompacto =
  'inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs transition-all outline-none hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-60'

export const claseBotonTexto =
  'inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-sky-700 outline-none transition-colors hover:text-sky-800 hover:underline focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30'

/** Botón punteado para agregar un elemento repetible (otro procedimiento, otro teléfono…). */
export const claseBotonAgregar =
  'inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-[var(--pabon-azul-oscuro)] outline-none transition-colors hover:border-[var(--pabon-azul-oscuro)] hover:bg-sky-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-transparent disabled:text-slate-400'

/** Acción discreta junto a la etiqueta de un campo (p. ej. "Quitar" en un procedimiento adicional). */
export const claseAccionCampo =
  'inline-flex items-center gap-1 rounded text-xs font-medium text-slate-600 outline-none transition-colors hover:text-slate-900 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]/40'
