import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { OpcionLista } from '../types/db'

/** Opciones activas de una categoría de lista (ej. "EPS", "DIAGNOSTICO"), en su orden definido. */
export function useOpciones(categoriaCodigo: string) {
  return useQuery({
    queryKey: ['opciones', categoriaCodigo],
    queryFn: () => api.get<OpcionLista[]>(`/listas/opciones?categoria=${encodeURIComponent(categoriaCodigo)}`),
    staleTime: 5 * 60 * 1000,
  })
}
