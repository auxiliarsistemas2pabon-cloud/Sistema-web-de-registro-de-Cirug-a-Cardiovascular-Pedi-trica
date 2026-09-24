import type { ReactNode } from 'react'

interface Props {
  etiqueta: string
  valor: string
  icono?: ReactNode
  tono?: 'normal' | 'critico'
}

export function TarjetaKpi({ etiqueta, valor, icono, tono = 'normal' }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{etiqueta}</p>
        {icono && (
          <span
            className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
              tono === 'critico' ? 'bg-red-100 text-red-600' : 'bg-[var(--pabon-azul-oscuro)]/10 text-[var(--pabon-azul-oscuro)]'
            }`}
          >
            {icono}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{valor}</p>
    </div>
  )
}
