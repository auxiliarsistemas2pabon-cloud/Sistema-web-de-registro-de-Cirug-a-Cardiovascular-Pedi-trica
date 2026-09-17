import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OpcionLista } from '../types/db'

/** Opciones activas de una categoría de lista (ej. "EPS", "DIAGNOSTICO"), en su orden definido. */
export function useOpciones(categoriaCodigo: string) {
  return useQuery({
    queryKey: ['opciones', categoriaCodigo],
    queryFn: async (): Promise<OpcionLista[]> => {
      const { data, error } = await supabase
        .from('v_opciones_lista')
        .select('id, categoria_id, codigo, valor, orden, activo')
        .eq('categoria_codigo', categoriaCodigo)
        .eq('activo', true)
        .order('orden')

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
