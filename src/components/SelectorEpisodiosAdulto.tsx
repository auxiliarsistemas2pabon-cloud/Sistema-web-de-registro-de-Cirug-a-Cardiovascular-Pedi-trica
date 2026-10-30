import { formatearFecha } from '../lib/fechas'
import type { EpisodioAdulto } from '../types/db'

interface Props {
  episodios: EpisodioAdulto[]
  episodioId: string | null
  onSeleccionar: (id: string) => void
}

/**
 * Las intervenciones de una ficha, en la tarjeta del paciente: cada una agrupa su diagnóstico, su
 * cirugía, su postoperatorio y su seguimiento, así que elegir una cambia los módulos 2 a 5 a los de esa
 * intervención. Desde el 30-oct un reingreso se registra como paciente nuevo (con su ficha completa,
 * Módulo 1 incluido), así que ya no se agregan intervenciones a una ficha: este selector solo aparece
 * si alguna ficha llegara a tener más de una.
 */
export function SelectorEpisodiosAdulto({ episodios, episodioId, onSeleccionar }: Props) {
  if (episodios.length < 2) return null
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Intervenciones ({episodios.length})</p>
      <div role="group" aria-label="Intervención que se muestra en los módulos 2 a 5" className="mt-2 flex flex-wrap gap-2 xl:flex-col">
        {episodios.map((e) => {
          const elegida = e.id === episodioId
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSeleccionar(e.id)}
              aria-pressed={elegida}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                elegida
                  ? 'border-[var(--pabon-azul-oscuro)] bg-[var(--pabon-azul-oscuro)] text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-[var(--pabon-azul-claro)] hover:text-slate-900'
              }`}
            >
              Intervención {e.numero_episodio}
              <span className={`block text-xs font-normal ${elegida ? 'text-white/85' : 'text-slate-500'}`}>
                {e.fecha_cirugia ? `Cirugía del ${formatearFecha(e.fecha_cirugia)}` : 'Sin fecha de cirugía'}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Los módulos 2 a 5 (diagnóstico, cirugía, postoperatorio y seguimiento) son de la intervención elegida.</p>
    </div>
  )
}
