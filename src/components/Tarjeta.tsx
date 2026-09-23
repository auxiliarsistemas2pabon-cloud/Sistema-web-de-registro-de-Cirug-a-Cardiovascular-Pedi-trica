import type { ReactNode } from 'react'

interface Props {
  titulo?: ReactNode
  icono?: ReactNode
  contador?: number
  className?: string
  children: ReactNode
}

/** Tarjeta blanca con borde y sombra sutil, con un encabezado opcional (icono + título + contador). */
export function Tarjeta({ titulo, icono, contador, className = '', children }: Props) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {titulo && (
        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          {icono && (
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/10 text-[var(--pabon-azul-oscuro)]">
              {icono}
            </span>
          )}
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          {contador !== undefined && (
            <span className="ml-auto inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-semibold text-slate-600">
              {contador}
            </span>
          )}
        </div>
      )}
      <div className={titulo ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
