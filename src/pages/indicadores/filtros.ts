// Filtros "con un clic" del tablero de indicadores: cada gráfico filtra por su propio campo, y el
// servidor recalcula todo con esos pacientes (ver calcularIndicadores en server/rutas-consultas.mjs).

/** Los mismos campos que acepta el servidor (CAMPOS_FILTRO). */
export type CampoFiltro =
  | 'mes'
  | 'riesgo'
  | 'diagnostico'
  | 'procedimiento'
  | 'eps'
  | 'procedencia'
  | 'sexo'
  | 'peso'
  | 'talla'
  | 'superficie'
  | 'dias_uci'
  | 'horas_vm'
  | 'estado_herida'
  | 'herida_grupo'

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
  riesgo: 'Riesgo',
  diagnostico: 'Diagnóstico',
  procedimiento: 'Procedimiento',
  eps: 'EPS',
  procedencia: 'Procedencia',
  sexo: 'Sexo',
  peso: 'Peso',
  talla: 'Talla',
  superficie: 'Superficie corporal',
  dias_uci: 'Estancia en UCI',
  horas_vm: 'Ventilación mecánica',
  estado_herida: 'Estado de la herida',
  herida_grupo: 'Estado de la herida',
}
