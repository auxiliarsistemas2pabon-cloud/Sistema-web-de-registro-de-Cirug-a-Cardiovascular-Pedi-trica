// Filtros "con un clic" del tablero de indicadores: cada gráfico filtra por su propio campo, y el
// servidor recalcula todo con esos pacientes (ver calcularIndicadores en server/rutas-consultas.mjs).

/** Los mismos campos que acepta el servidor (CAMPOS_FILTRO). */
export type CampoFiltro =
  | 'mes'
  | 'anio'
  | 'riesgo'
  | 'diagnostico'
  | 'valvulopatia'
  | 'factor_riesgo'
  | 'procedimiento'
  | 'eps'
  | 'procedencia'
  | 'municipio'
  | 'sexo'
  | 'edad'
  | 'peso'
  | 'talla'
  | 'superficie'
  | 'implante'
  | 'uso_cec'
  | 'tiempo_cec'
  | 'tiempo_clamp'
  | 'cierre_esternal'
  | 'extubacion'
  | 'complicacion_intraqx'
  | 'unidad_pop'
  | 'dias_uci'
  | 'horas_vm'
  | 'dias_hosp'
  | 'complicacion_pop'
  | 'condicion_salida'
  | 'rehabilitacion'
  | 'estado_herida'
  | 'herida_grupo'
  | 'reingreso'
  | 'causa_reingreso'

export interface Filtro {
  campo: CampoFiltro
  /** Lo que se envía al servidor: la etiqueta exacta del gráfico (o su clave, como "IV"). */
  valor: string
  /** Lo que se muestra en el chip del filtro ("RACHS IV"). */
  etiqueta: string
}

/** Nombre de cada campo en los chips de filtros activos. */
export const NOMBRE_CAMPO: Record<CampoFiltro, string> = {
  mes: 'Mes',
  anio: 'Año',
  riesgo: 'Riesgo',
  diagnostico: 'Diagnóstico (principal o adicional)',
  valvulopatia: 'Tipo de valvulopatía',
  factor_riesgo: 'Factor de riesgo',
  procedimiento: 'Procedimiento',
  eps: 'EPS',
  procedencia: 'Procedencia',
  municipio: 'Municipio de Nariño',
  sexo: 'Sexo',
  edad: 'Edad',
  peso: 'Peso',
  talla: 'Talla',
  superficie: 'Superficie corporal',
  implante: 'Tipo de implante',
  uso_cec: 'Uso de CEC',
  tiempo_cec: 'Tiempo de CEC',
  tiempo_clamp: 'Tiempo de clamp',
  cierre_esternal: 'Cierre esternal diferido',
  extubacion: 'Extubación en quirófano',
  complicacion_intraqx: 'Complicación intraquirúrgica',
  unidad_pop: 'Unidad postoperatoria',
  dias_uci: 'Estancia en UCI',
  horas_vm: 'Ventilación mecánica',
  dias_hosp: 'Hospitalización',
  complicacion_pop: 'Complicación postoperatoria',
  condicion_salida: 'Condición de egreso',
  rehabilitacion: 'Rehabilitación cardíaca',
  estado_herida: 'Estado de la herida',
  herida_grupo: 'Estado de la herida',
  reingreso: 'Reingreso a 30 días',
  causa_reingreso: 'Causa de reingreso',
}
