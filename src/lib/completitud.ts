import type { EstadoModulo } from '../types/db'

export interface ResultadoCompletitud {
  estado: EstadoModulo
  /** Etiquetas (tal como las ve el usuario en el formulario) de los campos obligatorios que
   * quedaron vacíos — alimenta el aviso no bloqueante de PieFormulario al guardar. */
  faltantes: string[]
}

function resultado(faltantes: string[]): ResultadoCompletitud {
  return { estado: faltantes.length === 0 ? 'completo' : 'pendiente', faltantes }
}

/** Módulo 1: nombre, identificación y fecha de nacimiento son siempre obligatorios (ya
 * los exige la BD con NOT NULL); municipio es obligatorio solo si procedencia = Nariño;
 * debe haber al menos un teléfono o "sin_telefono" marcado. */
export function calcularEstadoModulo1(v: {
  nombreCompleto: string
  identificacion: string
  fechaNacimiento: string
  procedenciaEsNarino: boolean
  municipioNarinoId: string
  sinTelefono: boolean
  telefonos: string[]
}): ResultadoCompletitud {
  const tieneTelefono = v.sinTelefono || v.telefonos.some((t) => t.trim() !== '')
  const faltantes: string[] = []
  if (v.nombreCompleto.trim() === '') faltantes.push('Nombre completo')
  if (v.identificacion.trim() === '') faltantes.push('Identificación')
  if (v.fechaNacimiento === '') faltantes.push('Fecha de nacimiento')
  if (v.procedenciaEsNarino && !v.municipioNarinoId) faltantes.push('Municipio de Nariño')
  if (!tieneTelefono) faltantes.push('Teléfono')
  return resultado(faltantes)
}

/** Módulo 2: diagnóstico y RACHS-1 obligatorios; valvulopatía obligatoria solo si el
 * diagnóstico es Valvulopatías; al menos un riesgo seleccionado (o "Ninguno"). */
export function calcularEstadoModulo2(v: {
  diagnosticoId: string
  rachsId: string
  diagnosticoEsValvulopatias: boolean
  valvulopatiaId: string
  riesgoIds: string[]
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.diagnosticoId) faltantes.push('Diagnóstico')
  if (!v.rachsId) faltantes.push('Escala RACHS-1')
  if (v.diagnosticoEsValvulopatias && !v.valvulopatiaId) faltantes.push('Tipo de valvulopatía')
  if (v.riesgoIds.length === 0) faltantes.push('Factores de riesgo')
  return resultado(faltantes)
}

/** Módulo 3: fecha de cirugía y procedimiento 1 obligatorios; tiempo de CEC obligatorio
 * solo si se usó circulación extracorpórea. */
export function calcularEstadoModulo3(v: {
  fechaCirugia: string
  procedimiento1Id: string
  usoCec: 'SI' | 'NO' | ''
  tiempoCecMin: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.fechaCirugia) faltantes.push('Fecha de cirugía')
  if (!v.procedimiento1Id) faltantes.push('Procedimiento quirúrgico 1')
  if (v.usoCec === 'SI' && !v.tiempoCecMin) faltantes.push('Tiempo de CEC (min)')
  return resultado(faltantes)
}

/** Módulo 4: unidad postoperatoria, horas de ventilación, complicación POP y condición
 * de salida son los obligatorios (fechas de traslado/salida quedan fuera del enunciado). */
export function calcularEstadoModulo4(v: {
  unidadPopId: string
  horasVentilacion: string
  complicacionPopIds: string[]
  condicionSalidaId: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.unidadPopId) faltantes.push('Unidad postoperatoria')
  if (v.horasVentilacion === '') faltantes.push('Horas de ventilación mecánica')
  if (v.complicacionPopIds.length === 0) faltantes.push('Complicación postoperatoria')
  if (!v.condicionSalidaId) faltantes.push('Condición en que sale el paciente')
  return resultado(faltantes)
}

/** Módulo 5: todos los campos son obligatorios salvo que Reingreso≠SI (ahí fecha/causa
 * de reingreso no aplican). No_aplica (muerte) se maneja aparte, antes de llamar a esto. */
export function calcularEstadoModulo5(v: {
  fechaControl: string
  rehabilitacionCardiaca: string
  estadoHeridaId: string
  fechaLlamada15Dias: string
  personaRecibeLlamada: string
  reingreso: string
  fechaReingreso: string
  causaReingresoId: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.fechaControl) faltantes.push('Fecha de control por cirugía cardiovascular')
  if (!v.rehabilitacionCardiaca) faltantes.push('Terapia de rehabilitación cardíaca')
  if (!v.estadoHeridaId) faltantes.push('Estado de la herida quirúrgica')
  if (!v.fechaLlamada15Dias) faltantes.push('Fecha de la llamada')
  if (v.personaRecibeLlamada.trim() === '') faltantes.push('Persona que recibe la llamada')
  if (!v.reingreso) faltantes.push('¿Hubo reingreso?')
  if (v.reingreso === 'SI' && !v.fechaReingreso) faltantes.push('Fecha de reingreso')
  if (v.reingreso === 'SI' && !v.causaReingresoId) faltantes.push('Causa de reingreso')
  return resultado(faltantes)
}

// ---------------------------------------------------------------------------------------------
// Módulo de adultos: mismo criterio ("obligatorio" = lo que la BD ya exige con NOT NULL, más las
// reglas condicionales de cada módulo), adaptado a sus propios campos — ver [[project-repo-setup]].
// ---------------------------------------------------------------------------------------------

/** Módulo 1 (adultos): igual que el pediátrico, pero sin la lista de teléfonos/"sin_telefono"
 * (el módulo de adultos tiene un único campo de teléfono, opcional). */
export function calcularEstadoModulo1Adulto(v: {
  nombreCompleto: string
  identificacion: string
  fechaNacimiento: string
  procedenciaEsNarino: boolean
  municipioNarinoId: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (v.nombreCompleto.trim() === '') faltantes.push('Nombre completo')
  if (v.identificacion.trim() === '') faltantes.push('Identificación')
  if (v.fechaNacimiento === '') faltantes.push('Fecha de nacimiento')
  if (v.procedenciaEsNarino && !v.municipioNarinoId) faltantes.push('Municipio de Nariño')
  return resultado(faltantes)
}

/** Módulo 2 (adultos): diagnóstico y EuroSCORE obligatorios (EuroSCORE hace las veces del
 * RACHS-1 pediátrico: una escala de riesgo que se calcula en toda cirugía cardiovascular de
 * adultos); valvulopatía obligatoria solo si el diagnóstico la menciona; al menos un riesgo. */
export function calcularEstadoModulo2Adulto(v: {
  diagnosticoId: string
  euroscore: string
  diagnosticoEsValvulopatia: boolean
  valvulopatiaId: string
  riesgoIds: string[]
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.diagnosticoId) faltantes.push('Diagnóstico')
  if (v.euroscore === '') faltantes.push('Escala EuroSCORE (%)')
  if (v.diagnosticoEsValvulopatia && !v.valvulopatiaId) faltantes.push('Tipo de valvulopatía')
  if (v.riesgoIds.length === 0) faltantes.push('Factores de riesgo')
  return resultado(faltantes)
}

/** Módulo 3 (adultos): igual regla que el pediátrico (fecha de cirugía, procedimiento 1 y,
 * si hubo CEC, su tiempo), sin los procedimientos 2/3 con fecha propia: en el módulo de adultos
 * comparten la fecha de cirugía. */
export function calcularEstadoModulo3Adulto(v: {
  fechaCirugia: string
  procedimiento1Id: string
  usoCec: 'SI' | 'NO' | ''
  tiempoCecMin: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.fechaCirugia) faltantes.push('Fecha de cirugía')
  if (!v.procedimiento1Id) faltantes.push('Procedimiento quirúrgico 1')
  if (v.usoCec === 'SI' && !v.tiempoCecMin) faltantes.push('Tiempo de CEC (min)')
  return resultado(faltantes)
}

/** Módulo 4 (adultos): igual que el pediátrico más los días de estancia en UCI y de
 * hospitalización total, que en este módulo se escriben a mano (no se calculan de otras fechas). */
export function calcularEstadoModulo4Adulto(v: {
  unidadPopId: string
  horasVentilacion: string
  complicacionPopIds: string[]
  diasEstanciaUci: string
  diasHospitalizacionTotal: string
  condicionSalidaId: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.unidadPopId) faltantes.push('Unidad postoperatoria')
  if (v.horasVentilacion === '') faltantes.push('Horas de ventilación mecánica')
  if (v.complicacionPopIds.length === 0) faltantes.push('Complicación postoperatoria')
  if (v.diasEstanciaUci === '') faltantes.push('Días de estancia en UCI')
  if (v.diasHospitalizacionTotal === '') faltantes.push('Días totales de hospitalización posterior a la cirugía')
  if (!v.condicionSalidaId) faltantes.push('Condición en que sale el paciente')
  return resultado(faltantes)
}

/** Módulo 5 (adultos): "Llamado 15 días" (Sí/No) reemplaza la fecha de llamada del módulo
 * pediátrico; la persona que recibió la llamada solo es obligatoria si la llamada sí se hizo.
 * Reingreso a 30 días es Sí/No (sin "N/A": el módulo completo se salta con no_aplica si el
 * paciente falleció, igual que en el módulo pediátrico). */
export function calcularEstadoModulo5Adulto(v: {
  fechaControl: string
  rehabilitacionCardiaca: string
  estadoHeridaId: string
  llamado15Dias: string
  personaRecibeLlamada: string
  reingreso: string
  fechaReingreso: string
  causaReingresoId: string
}): ResultadoCompletitud {
  const faltantes: string[] = []
  if (!v.fechaControl) faltantes.push('Fecha de control por cirugía cardiovascular')
  if (!v.rehabilitacionCardiaca) faltantes.push('Terapia de rehabilitación cardíaca')
  if (!v.estadoHeridaId) faltantes.push('Estado de la herida quirúrgica')
  if (!v.llamado15Dias) faltantes.push('Llamado 15 días')
  if (v.llamado15Dias === 'SI' && v.personaRecibeLlamada.trim() === '') faltantes.push('Persona que recibe la llamada')
  if (!v.reingreso) faltantes.push('¿Hubo reingreso?')
  if (v.reingreso === 'SI' && !v.fechaReingreso) faltantes.push('Fecha de reingreso')
  if (v.reingreso === 'SI' && !v.causaReingresoId) faltantes.push('Causa de reingreso')
  return resultado(faltantes)
}
