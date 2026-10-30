import type { ProcedimientoGuardado } from '../types/db'

/** Un procedimiento en el formulario del Módulo 3: cuál, su especificación si es un "Otro…" y si llevó
 * implante (Sí / No / No aplica), con su tipo solo cuando sí lo llevó y, con el tipo elegido, su número
 * o "No aplica". */
export interface ProcedimientoFormulario {
  procedimiento_id: string
  especificacion: string
  implante: 'SI' | 'NO' | 'NA' | ''
  tipo_implante_id: string
  numero_implante: string
  numero_implante_no_aplica: boolean
}

/** Los tres lugares de procedimiento del formulario: los guardados, en su orden, y vacíos los demás. */
export function procedimientosIniciales(guardados: ProcedimientoGuardado[]): ProcedimientoFormulario[] {
  return [0, 1, 2].map((i) => ({
    procedimiento_id: guardados[i]?.procedimiento_id ?? '',
    especificacion: guardados[i]?.especificacion ?? '',
    implante: guardados[i]?.implante ?? '',
    tipo_implante_id: guardados[i]?.tipo_implante_id ?? '',
    numero_implante: guardados[i]?.numero_implante ?? '',
    numero_implante_no_aplica: guardados[i]?.numero_implante_no_aplica ?? false,
  }))
}

/** Lo que se envía al guardar: solo los procedimientos elegidos, en orden, con la especificación solo si
 * es un "Otro…", el tipo de implante solo si lo llevó y el número solo si hay tipo (las mismas reglas
 * aplica el servidor). */
export function procedimientosParaGuardar(procedimientos: ProcedimientoFormulario[], esOtro: (id: string) => boolean) {
  return procedimientos
    .filter((p) => p.procedimiento_id)
    .map((p) => ({
      procedimiento_id: p.procedimiento_id,
      especificacion: esOtro(p.procedimiento_id) ? p.especificacion.trim() || null : null,
      implante: p.implante || null,
      tipo_implante_id: p.implante === 'SI' ? p.tipo_implante_id || null : null,
      numero_implante: tieneTipo(p) && !p.numero_implante_no_aplica ? p.numero_implante.trim() || null : null,
      numero_implante_no_aplica: tieneTipo(p) && p.numero_implante_no_aplica,
    }))
}

const tieneTipo = (p: ProcedimientoFormulario) => p.implante === 'SI' && !!p.tipo_implante_id

/** Lo que pide la completitud del Módulo 3 de cada procedimiento elegido. */
export function implantesParaCompletitud(procedimientos: ProcedimientoFormulario[]) {
  return procedimientos.map((p) => ({
    implante: p.implante,
    tipoImplanteId: p.tipo_implante_id,
    numeroImplante: p.numero_implante,
    numeroImplanteNoAplica: p.numero_implante_no_aplica,
  }))
}
