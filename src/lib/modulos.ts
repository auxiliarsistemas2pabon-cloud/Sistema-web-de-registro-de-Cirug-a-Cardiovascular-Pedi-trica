import type { EstadoModulo } from '../types/db'

/** Nombres de los cinco módulos de la ficha, en orden (M1…M5). */
export const NOMBRES_MODULOS = [
  'Datos del paciente',
  'Diagnóstico y riesgo',
  'Procedimiento quirúrgico',
  'Postoperatorio y egreso',
  'Seguimiento post-egreso',
] as const

export const ETIQUETAS_ESTADO_MODULO: Record<EstadoModulo, string> = {
  completo: 'Completo',
  pendiente: 'Pendiente',
  no_aplica: 'No aplica',
}

/** Una ficha está completa cuando ningún módulo queda pendiente ("no aplica" cuenta como resuelto). */
export function fichaCompleta(estados: readonly EstadoModulo[]): boolean {
  return estados.every((estado) => estado !== 'pendiente')
}
