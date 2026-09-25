import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  error?: string
  children: ReactNode
  className?: string
}

export function Campo({ etiqueta, error, children, className }: CampoProps) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{etiqueta}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const claseInput =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors outline-none focus:border-[var(--pabon-azul-oscuro)] focus:ring-3 focus:ring-[var(--pabon-azul-claro)]/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none'

export const claseBotonPrimario =
  'inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition-all outline-none hover:bg-sky-700 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-60'

export const claseBotonSecundario =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs transition-all outline-none hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-60'

export const claseBotonTexto =
  'inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-sky-700 outline-none transition-colors hover:text-sky-800 hover:underline focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30'
