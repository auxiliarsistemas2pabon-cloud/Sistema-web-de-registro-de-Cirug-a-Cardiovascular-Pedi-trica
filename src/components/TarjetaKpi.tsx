import type { ReactNode } from 'react'

type Tono = 'normal' | 'exito' | 'advertencia' | 'critico'

interface Props {
  etiqueta: string
  valor: string
  icono?: ReactNode
  tono?: Tono
  /** Línea corta bajo la cifra (p. ej. "28 % del total"). */
  detalle?: ReactNode
  /** 0–100: dibuja una barra de progreso del color del tono. */
  progreso?: number
  /** Alternativa a `progreso`: barra apilada con varios tramos (porcentajes que suman 100). */
  segmentos?: { porcentaje: number; clase: string }[]
  /** Si se pasa, la tarjeta se vuelve un botón (p. ej. para filtrar una tabla por esa cifra). */
  onClick?: () => void
  /** Solo con onClick: marca la tarjeta como la opción seleccionada. */
  activo?: boolean
  titulo?: string
}

// Los íconos llevan color con valores arbitrarios (text-[#…]) y no con text-emerald-600 &
// compañía: esas clases de texto están forzadas a negro en index.css (pedido explícito de
// "todo el texto en negro"), y un ícono de estado sí necesita su color para leerse de un vistazo.
const TONOS: Record<Tono, { insignia: string; barra: string }> = {
  normal: { insignia: 'bg-[var(--pabon-azul-oscuro)]/[0.08] text-[var(--pabon-azul-oscuro)]', barra: 'bg-[var(--pabon-azul-oscuro)]' },
  exito: { insignia: 'bg-emerald-50 text-[#047857]', barra: 'bg-emerald-500' },
  advertencia: { insignia: 'bg-amber-50 text-[#b45309]', barra: 'bg-amber-400' },
  critico: { insignia: 'bg-red-50 text-[#dc2626]', barra: 'bg-red-500' },
}

export function TarjetaKpi({ etiqueta, valor, icono, tono = 'normal', detalle, progreso, segmentos, onClick, activo = false, titulo }: Props) {
  const estilo = TONOS[tono]
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-slate-600 sm:text-sm">{etiqueta}</p>
        {icono && (
          <span className={`hidden h-8 w-8 flex-none items-center justify-center rounded-lg sm:flex ${estilo.insignia}`}>{icono}</span>
        )}
      </div>
      {/* mt-auto: si las etiquetas ocupan distinto número de líneas (pasa en móvil), las cifras
          de tarjetas vecinas igual quedan a la misma altura. */}
      <div className="mt-auto pt-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-[1.75rem] sm:leading-9">{valor}</p>
        {detalle && <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">{detalle}</p>}
        {(progreso !== undefined || segmentos) && (
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {(segmentos ?? [{ porcentaje: progreso ?? 0, clase: `${estilo.barra} rounded-full` }]).map((tramo, indice) => (
              <div
                key={indice}
                className={`h-full flex-none ${tramo.clase} transition-[width] duration-700 ease-out`}
                style={{ width: `${Math.min(Math.max(tramo.porcentaje, 0), 100)}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )

  const base = 'relative flex h-full flex-col rounded-xl border bg-white p-3.5 text-left shadow-[var(--sombra-tarjeta)] sm:p-5'

  if (!onClick) {
    return <div className={`${base} border-slate-200/80`}>{contenido}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`${base} w-full cursor-pointer outline-none transition-all focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 ${
        activo
          ? 'border-[var(--pabon-azul-oscuro)] ring-1 ring-[var(--pabon-azul-oscuro)]'
          : 'border-slate-200/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5'
      }`}
    >
      {contenido}
    </button>
  )
}
