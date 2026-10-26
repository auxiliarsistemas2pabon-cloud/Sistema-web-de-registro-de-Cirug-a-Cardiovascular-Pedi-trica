import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, mensajeDe } from '../lib/api'
import { formatearFecha } from '../lib/fechas'
import type { EpisodioAdulto } from '../types/db'
import { claseBotonSecundarioCompacto } from './Campo'
import { IconoMas } from './iconos'

interface Props {
  pacienteId: string
  episodios: EpisodioAdulto[]
  episodioId: string | null
  onSeleccionar: (id: string) => void
}

/**
 * Las intervenciones del paciente, en la tarjeta del paciente (no dentro de un módulo): cada una
 * agrupa su diagnóstico, su cirugía, su postoperatorio y su seguimiento, así que elegir una cambia los
 * módulos 2 a 5 — y los estados de los pasos de abajo — a los de esa intervención. Casi todos los
 * pacientes tienen una sola, así que las opciones solo aparecen cuando hay más de una; el botón de
 * agregar siempre está: es la única forma de registrar una reintervención.
 */
export function SelectorEpisodiosAdulto({ pacienteId, episodios, episodioId, onSeleccionar }: Props) {
  const queryClient = useQueryClient()
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function agregarIntervencion() {
    setError(null)
    setCreando(true)
    try {
      const { id } = await api.post<{ id: string }>(`/pacientes-adultos/${pacienteId}/episodios`)
      await queryClient.invalidateQueries({ queryKey: ['episodios-adulto', pacienteId] })
      onSeleccionar(id)
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo agregar la intervención.'))
    } finally {
      setCreando(false)
    }
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {episodios.length > 1 ? `Intervenciones (${episodios.length})` : 'Intervención'}
      </p>
      {episodios.length > 1 && (
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
      )}
      <button type="button" onClick={agregarIntervencion} disabled={creando} className={`${claseBotonSecundarioCompacto} mt-2`}>
        <IconoMas className="h-3.5 w-3.5" strokeWidth={2.2} />
        {creando ? 'Agregando…' : 'Agregar intervención'}
      </button>
      <p className="mt-2 text-xs text-slate-500">
        {episodios.length > 1
          ? 'Los módulos 2 a 5 (diagnóstico, cirugía, postoperatorio y seguimiento) son de la intervención elegida.'
          : 'Para una reintervención: tendrá su propio diagnóstico, cirugía, postoperatorio y seguimiento.'}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
