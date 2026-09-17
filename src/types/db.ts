export type Rol = 'administrador' | 'registrador' | 'consulta'

export type EstadoModulo = 'pendiente' | 'completo' | 'no_aplica'

export interface Perfil {
  id: string
  nombre_completo: string
  rol: Rol
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
  fecha_nacimiento: string
  peso_kg: number | null
  talla_cm: number | null
  procedencia_id: string | null
  municipio_narino_id: string | null
  telefonos: string[] | null
  sin_telefono: boolean
  eps_id: string | null
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

export interface DiagnosticoDetalle {
  id: string
  paciente_id: string
  diagnostico_id: string | null
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
