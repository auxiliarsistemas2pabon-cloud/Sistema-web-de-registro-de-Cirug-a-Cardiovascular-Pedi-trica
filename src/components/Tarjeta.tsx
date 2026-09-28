import type { ReactNode } from 'react'

interface Props {
  titulo?: ReactNode
  icono?: ReactNode
  contador?: number
  /** Contenido alineado a la derecha del encabezado (botones, enlaces). */
  acciones?: ReactNode
  className?: string
  children: ReactNode
}

/** Tarjeta blanca con borde y sombra sutil, con un encabezado opcional (icono + título + contador).
    Usa overflow-clip (no overflow-hidden) para recortar las esquinas: overflow-hidden convierte a la
    tarjeta en contenedor de scroll y un encabezado de tabla "sticky" dentro de ella nunca se pega. */
export function Tarjeta({ titulo, icono, contador, acciones, className = '', children }: Props) {
  return (
    <div className={`overflow-clip rounded-xl border border-slate-200/80 bg-white shadow-[var(--sombra-tarjeta)] ${className}`}>
      {titulo && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
          {icono && (
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--pabon-azul-oscuro)]/[0.08] text-[var(--pabon-azul-oscuro)]">
              {icono}
            </span>
          )}
          <h2 className="text-[15px] font-semibold text-slate-900">{titulo}</h2>
          {contador !== undefined && (
            <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-600">
              {contador}
            </span>
          )}
          {acciones && <div className="ml-auto flex flex-none items-center gap-2">{acciones}</div>}
        </div>
      )}
      <div className={titulo ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
