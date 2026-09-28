import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface Alerta {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  tipo_alerta: 'llamada_15_dias' | 'seguimiento_pendiente_alta'
  fecha_referencia: string
  dias_desde_referencia: number
}

/** Alertas de seguimiento activas. Compartido entre AlertasPage y el contador de la pestaña en
    AppShell: al usar la misma queryKey, ambos leen la misma caché (una sola petición). */
export function useAlertas() {
  return useQuery({
    queryKey: ['alertas'],
    queryFn: () => api.get<Alerta[]>('/alertas'),
  })
}
