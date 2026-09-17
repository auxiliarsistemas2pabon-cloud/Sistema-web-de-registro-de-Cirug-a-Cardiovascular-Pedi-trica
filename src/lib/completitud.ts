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
