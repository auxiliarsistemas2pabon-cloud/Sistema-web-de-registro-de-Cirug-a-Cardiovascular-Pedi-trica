import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { GrupoActivo } from '../lib/grupoActivo'

export interface Alerta {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  tipo_alerta: 'llamada_15_dias' | 'seguimiento_pendiente_alta'
  fecha_referencia: string
  dias_desde_referencia: number
}

/** Alertas de seguimiento activas del grupo indicado. Compartido entre AlertasPage y el contador
    de la pestaña en AppShell: al usar la misma queryKey, ambos leen la misma caché (una sola
    petición por grupo). Los adultos no guardan una fecha de llamada (solo Sí/No, ver
    server/rutas-consultas.mjs), así que su "fecha de referencia" es fecha_salida + 15 días,
    calculada en el servidor — mismo criterio, dato distinto. */
export function useAlertas(grupo: GrupoActivo) {
  return useQuery({
    queryKey: ['alertas', grupo],
    queryFn: () => api.get<Alerta[]>(grupo === 'adultos' ? '/alertas/adultos' : '/alertas'),
  })
}
