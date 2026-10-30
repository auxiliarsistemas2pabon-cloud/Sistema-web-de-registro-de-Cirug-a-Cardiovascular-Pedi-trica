import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ACTUALIZACION_PERIODICA } from '../lib/clienteConsultas'
import type { GrupoActivo } from '../lib/grupoActivo'

export interface Alerta {
  paciente_id: string
  /** Solo en adultos: a qué intervención pertenece esta alerta (un paciente puede tener más de
   * una, cada una con su propia llamada de los 15 días y su propio seguimiento). */
  episodio_id?: string
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
    ...ACTUALIZACION_PERIODICA,
    queryKey: ['alertas', grupo],
    queryFn: () => api.get<Alerta[]>(grupo === 'adultos' ? '/alertas/adultos' : '/alertas'),
  })
}

/** "Vencida hace 1 día" / "Falta 1 día" / "Faltan 3 días" / "Vence hoy": con la pluralización correcta. */
export function textoEstado(diasDesdeReferencia: number): string {
  if (diasDesdeReferencia > 0) {
    return `Vencida hace ${diasDesdeReferencia} ${diasDesdeReferencia === 1 ? 'día' : 'días'}`
  }
  const restantes = Math.abs(diasDesdeReferencia)
  if (restantes === 0) return 'Vence hoy'
  return `${restantes === 1 ? 'Falta' : 'Faltan'} ${restantes} ${restantes === 1 ? 'día' : 'días'}`
}
