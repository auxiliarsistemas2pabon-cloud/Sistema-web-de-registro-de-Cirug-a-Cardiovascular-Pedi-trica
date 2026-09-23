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
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[var(--pabon-azul-oscuro)] focus:outline-none focus:ring-2 focus:ring-[var(--pabon-azul-claro)]/20 disabled:bg-slate-100 disabled:text-slate-400'

export const claseBotonPrimario =
  'inline-flex items-center gap-2 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60'

export const claseBotonSecundario =
  'inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60'

export const claseBotonTexto = 'inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline'
