export type EstadoModulo = 'pendiente' | 'completo' | 'no_aplica'

/** Un usuario del sistema. No hay roles: todos los usuarios son administradores. */
export interface Perfil {
  id: string
  email?: string
  nombre_completo: string
  activo: boolean
}

export interface OpcionLista {
  id: string
  categoria_id: string
  codigo: string | null
  valor: string
  orden: number
  activo: boolean
}

export interface PacienteDetalle {
  id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  sexo_id: string | null
  sexo_otro: string | null
  fecha_nacimiento: string
  peso_kg: number | null
  talla_cm: number | null
  procedencia_id: string | null
  procedencia_otro: string | null
  municipio_narino_id: string | null
  telefonos: string[] | null
  sin_telefono: boolean
  eps_id: string | null
  eps_otro: string | null
  estado_modulo: EstadoModulo
  eliminado: boolean
}

export interface CategoriaLista {
  id: string
  codigo: string
  nombre: string
}

export interface RegistroAuditoria {
  id: number
  tabla: string
  registro_id: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE'
  usuario_id: string | null
  usuario_nombre: string | null
  fecha: string
  valores_anteriores: Record<string, unknown> | null
  valores_nuevos: Record<string, unknown> | null
}

export interface DiagnosticoAdicional {
  diagnostico_id: string
  /** Cuál, si es una opción "Otro…". */
  especificacion: string | null
  /** Su propio tipo de valvulopatía, si el diagnóstico es una valvulopatía. */
  valvulopatia_id: string | null
}

export interface DiagnosticoDetalle {
  id: string
  paciente_id: string
  diagnostico_id: string | null
  diagnostico_otro: string | null
  /** Otros diagnósticos además del principal, de la misma lista (se pueden repetir) y en el orden en
   * que se agregaron. `valvulopatia_id` de arriba es solo el del diagnóstico principal. */
  diagnosticos_adicionales: DiagnosticoAdicional[]
  valvulopatia_id: string | null
  rachs_id: string | null
  estado_modulo: EstadoModulo
}

export interface PacienteResumen {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  fecha_nacimiento: string
  edad_dias: number
  fecha_cirugia: string | null
  edad_cirugia_dias: number | null
  dias_uci: number | null
  dias_hospitalizacion_posqx: number | null
  estado_m1: EstadoModulo
  estado_m2: EstadoModulo
  estado_m3: EstadoModulo
  estado_m4: EstadoModulo
  estado_m5: EstadoModulo
  diagnostico_valor: string | null
  rachs_valor: string | null
  eps_valor: string | null
  procedencia_valor: string | null
  condicion_salida_valor: string | null
  eliminado: boolean
}

// ---------------------------------------------------------------------------------------------
// Módulo de adultos (pacientes de 18 años o más): mismo patrón de 5 módulos, en tablas propias.
// Sin RACHS-1 (es una escala pediátrica); en su lugar, EuroSCORE. Un solo teléfono en vez de una
// lista. Ver [[project-repo-setup]] y server/servicios-adultos.mjs para el resto de diferencias.
// ---------------------------------------------------------------------------------------------

export interface PacienteAdultoDetalle {
  id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  sexo_id: string | null
  sexo_otro: string | null
  fecha_nacimiento: string
  peso_kg: number | null
  talla_cm: number | null
  procedencia_id: string | null
  procedencia_otro: string | null
  municipio_narino_id: string | null
  telefono: string | null
  eps_id: string | null
  eps_otro: string | null
  estado_modulo: EstadoModulo
  eliminado: boolean
}

export interface DiagnosticoAdultoDetalle {
  id: string
  episodio_id: string
  diagnostico_id: string | null
  diagnostico_otro: string | null
  diagnosticos_adicionales: DiagnosticoAdicional[]
  valvulopatia_id: string | null
  euroscore: number | null
  estado_modulo: EstadoModulo
}

export interface PacienteAdultoResumen {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
  fecha_nacimiento: string
  edad_dias: number
  fecha_cirugia: string | null
  edad_cirugia_dias: number | null
  dias_uci: number | null
  dias_hospitalizacion_posqx: number | null
  estado_m1: EstadoModulo
  estado_m2: EstadoModulo
  estado_m3: EstadoModulo
  estado_m4: EstadoModulo
  estado_m5: EstadoModulo
  diagnostico_valor: string | null
  euroscore: number | null
  eps_valor: string | null
  procedencia_valor: string | null
  condicion_salida_valor: string | null
  eliminado: boolean
  /** Cuántas intervenciones tiene el paciente en total (ver EpisodioAdulto); los módulos 2-5 de
   * este resumen son los de la más reciente. */
  total_episodios: number
}

/** Una intervención quirúrgica de un paciente adulto. La mayoría de los pacientes tiene solo una
 * (numero_episodio = 1, creada junto con el paciente); una reintervención agrega la siguiente. Trae
 * su fecha de cirugía, su diagnóstico y el estado de sus módulos 2 a 5, para que la ficha muestre los
 * de la intervención elegida. */
export interface EpisodioAdulto {
  id: string
  paciente_id: string
  numero_episodio: number
  creado_en: string
  fecha_cirugia: string | null
  diagnostico_valor: string | null
  estado_m2: EstadoModulo
  estado_m3: EstadoModulo
  estado_m4: EstadoModulo
  estado_m5: EstadoModulo
}

/** Un procedimiento guardado de una cirugía (en orden, 1 a 3): su especificación si es un "Otro…" y si
 * llevó implante (Sí / No / No aplica), con su tipo solo cuando sí lo llevó. */
export interface ProcedimientoGuardado {
  procedimiento_id: string
  especificacion: string | null
  implante: 'SI' | 'NO' | 'NA' | null
  tipo_implante_id: string | null
}
