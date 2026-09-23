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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[var(--pabon-azul-oscuro)]/10 text-[var(--pabon-azul-oscuro)]">
          {icono}
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-none items-center gap-2">{acciones}</div>}
    </div>
  )
}
