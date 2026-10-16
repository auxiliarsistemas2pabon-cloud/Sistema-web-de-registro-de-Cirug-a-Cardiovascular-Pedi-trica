import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, mensajeDe } from '../lib/api'
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
 * Casi todos los pacientes adultos tienen una sola intervención (creada junto con el paciente, sin
 * que el usuario note este selector): las pastillas solo aparecen cuando hay más de una. El botón
 * de agregar siempre está visible — es la única forma de registrar una reintervención.
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
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-5">
      {episodios.length > 1 &&
        episodios.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onSeleccionar(e.id)}
            aria-pressed={e.id === episodioId}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              e.id === episodioId
                ? 'border-[var(--pabon-azul-oscuro)] bg-[var(--pabon-azul-oscuro)] text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-600 hover:border-[var(--pabon-azul-claro)] hover:text-slate-900'
            }`}
          >
            Intervención {e.numero_episodio}
          </button>
        ))}
      <button type="button" onClick={agregarIntervencion} disabled={creando} className={claseBotonSecundarioCompacto}>
        <IconoMas className="h-3.5 w-3.5" strokeWidth={2.2} />
        {creando ? 'Agregando…' : 'Agregar intervención'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
