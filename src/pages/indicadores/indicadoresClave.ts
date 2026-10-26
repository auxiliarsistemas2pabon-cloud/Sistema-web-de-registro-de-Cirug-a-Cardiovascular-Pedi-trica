// Los indicadores clave del servicio con tasa (los mismos de INDICADORES en server/rutas-consultas.mjs):
// al hacer clic en uno — su tarjeta del resumen o el punto de un mes en su gráfico — se ven sus casos.

export type IndicadorClave = 'mortalidad' | 'complicacion_intraqx' | 'complicacion_pop' | 'reingreso'

export const INDICADORES_CON_DETALLE: Record<IndicadorClave, {
  /** Título del detalle: quiénes son los casos. */
  casos: string
  /** Para "no hubo …" cuando no hay casos. */
  ninguno: string
}> = {
  mortalidad: { casos: 'Pacientes fallecidos', ninguno: 'No hubo pacientes fallecidos' },
  complicacion_intraqx: { casos: 'Pacientes con complicación intraquirúrgica', ninguno: 'Ningún paciente tuvo complicaciones en quirófano' },
  complicacion_pop: { casos: 'Pacientes con complicación postoperatoria', ninguno: 'Ningún paciente tuvo complicaciones después de la cirugía' },
  reingreso: { casos: 'Pacientes que reingresaron en los primeros 30 días', ninguno: 'Ningún paciente reingresó en los primeros 30 días' },
}

export const esIndicadorClave = (valor: string | null): valor is IndicadorClave => !!valor && Object.keys(INDICADORES_CON_DETALLE).includes(valor)

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-05" → "mayo de 2026". */
export function nombreMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number)
  return `${MESES_LARGOS[mes - 1]} de ${anio}`
}
