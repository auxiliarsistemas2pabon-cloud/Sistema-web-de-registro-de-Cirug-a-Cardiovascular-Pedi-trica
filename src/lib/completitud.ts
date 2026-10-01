import type { EstadoModulo } from '../types/db'

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
}): EstadoModulo {
  const tieneTelefono = v.sinTelefono || v.telefonos.some((t) => t.trim() !== '')
  const municipioOk = !v.procedenciaEsNarino || !!v.municipioNarinoId
  const completo =
    v.nombreCompleto.trim() !== '' &&
    v.identificacion.trim() !== '' &&
    v.fechaNacimiento !== '' &&
    municipioOk &&
    tieneTelefono
  return completo ? 'completo' : 'pendiente'
}

/** Módulo 2: diagnóstico y RACHS-1 obligatorios; valvulopatía obligatoria solo si el
 * diagnóstico es Valvulopatías; al menos un riesgo seleccionado (o "Ninguno"). */
export function calcularEstadoModulo2(v: {
  diagnosticoId: string
  rachsId: string
  diagnosticoEsValvulopatias: boolean
  valvulopatiaId: string
  riesgoIds: string[]
}): EstadoModulo {
  const valvulopatiaOk = !v.diagnosticoEsValvulopatias || !!v.valvulopatiaId
  const completo = !!v.diagnosticoId && !!v.rachsId && valvulopatiaOk && v.riesgoIds.length > 0
  return completo ? 'completo' : 'pendiente'
}

/** Módulo 3: fecha de cirugía y procedimiento 1 obligatorios; tiempo de CEC obligatorio
 * solo si se usó circulación extracorpórea. */
export function calcularEstadoModulo3(v: {
  fechaCirugia: string
  procedimiento1Id: string
  usoCec: 'SI' | 'NO' | ''
  tiempoCecMin: string
}): EstadoModulo {
  const cecOk = v.usoCec !== 'SI' || !!v.tiempoCecMin
  const completo = !!v.fechaCirugia && !!v.procedimiento1Id && cecOk
  return completo ? 'completo' : 'pendiente'
}

/** Módulo 4: unidad postoperatoria, horas de ventilación, complicación POP y condición
 * de salida son los obligatorios (fechas de traslado/salida quedan fuera del enunciado). */
export function calcularEstadoModulo4(v: {
  unidadPopId: string
  horasVentilacion: string
  complicacionPopId: string
  condicionSalidaId: string
}): EstadoModulo {
  const completo =
    !!v.unidadPopId && v.horasVentilacion !== '' && !!v.complicacionPopId && !!v.condicionSalidaId
  return completo ? 'completo' : 'pendiente'
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
}): EstadoModulo {
  const reingresoOk = v.reingreso !== 'SI' || (!!v.fechaReingreso && !!v.causaReingresoId)
  const completo =
    !!v.fechaControl &&
    !!v.rehabilitacionCardiaca &&
    !!v.estadoHeridaId &&
    !!v.fechaLlamada15Dias &&
    v.personaRecibeLlamada.trim() !== '' &&
    !!v.reingreso &&
    reingresoOk
  return completo ? 'completo' : 'pendiente'
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
}): EstadoModulo {
  const municipioOk = !v.procedenciaEsNarino || !!v.municipioNarinoId
  const completo =
    v.nombreCompleto.trim() !== '' && v.identificacion.trim() !== '' && v.fechaNacimiento !== '' && municipioOk
  return completo ? 'completo' : 'pendiente'
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
}): EstadoModulo {
  const valvulopatiaOk = !v.diagnosticoEsValvulopatia || !!v.valvulopatiaId
  const completo = !!v.diagnosticoId && v.euroscore !== '' && valvulopatiaOk && v.riesgoIds.length > 0
  return completo ? 'completo' : 'pendiente'
}

/** Módulo 3 (adultos): igual regla que el pediátrico (fecha de cirugía, procedimiento 1 y,
 * si hubo CEC, su tiempo), sin los procedimientos 2/3 con fecha propia: en el módulo de adultos
 * comparten la fecha de cirugía. */
export function calcularEstadoModulo3Adulto(v: {
  fechaCirugia: string
  procedimiento1Id: string
  usoCec: 'SI' | 'NO' | ''
  tiempoCecMin: string
}): EstadoModulo {
  const cecOk = v.usoCec !== 'SI' || !!v.tiempoCecMin
  const completo = !!v.fechaCirugia && !!v.procedimiento1Id && cecOk
  return completo ? 'completo' : 'pendiente'
}

/** Módulo 4 (adultos): igual que el pediátrico más los días de estancia en UCI y de
 * hospitalización total, que en este módulo se escriben a mano (no se calculan de otras fechas). */
export function calcularEstadoModulo4Adulto(v: {
  unidadPopId: string
  horasVentilacion: string
  complicacionPopId: string
  diasEstanciaUci: string
  diasHospitalizacionTotal: string
  condicionSalidaId: string
}): EstadoModulo {
  const completo =
    !!v.unidadPopId &&
    v.horasVentilacion !== '' &&
    !!v.complicacionPopId &&
    v.diasEstanciaUci !== '' &&
    v.diasHospitalizacionTotal !== '' &&
    !!v.condicionSalidaId
  return completo ? 'completo' : 'pendiente'
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
}): EstadoModulo {
  const personaOk = v.llamado15Dias !== 'SI' || v.personaRecibeLlamada.trim() !== ''
  const reingresoOk = v.reingreso !== 'SI' || (!!v.fechaReingreso && !!v.causaReingresoId)
  const completo =
    !!v.fechaControl &&
    !!v.rehabilitacionCardiaca &&
    !!v.estadoHeridaId &&
    !!v.llamado15Dias &&
    personaOk &&
    !!v.reingreso &&
    reingresoOk
  return completo ? 'completo' : 'pendiente'
}
