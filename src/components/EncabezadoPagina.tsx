import type { ReactNode } from 'react'

interface Props {
  icono: ReactNode
  titulo: string
  subtitulo?: ReactNode
  acciones?: ReactNode
}

/** Encabezado consistente para cada pantalla: insignia de icono + título + subtítulo opcional. */
export function EncabezadoPagina({ icono, titulo, subtitulo, acciones }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] text-white shadow-md shadow-[var(--pabon-azul-oscuro)]/20">
          {icono}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-none items-center gap-2">{acciones}</div>}
    </div>
  )
}
