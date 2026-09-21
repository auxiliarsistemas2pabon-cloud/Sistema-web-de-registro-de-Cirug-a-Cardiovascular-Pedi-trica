import {
  calcularEstadoModulo1,
  calcularEstadoModulo2,
  calcularEstadoModulo3,
  calcularEstadoModulo4,
  calcularEstadoModulo5,
} from './completitud'
import { hoyIso } from './fechas'
import type { EstadoModulo } from '../types/db'

export interface OpcionImportacion {
  id: string
  categoria: string
  valor: string
  codigo: string | null
}

export interface FilaImportacion {
  numeroFila: number
  datosOriginales: Record<string, string>
  normalizado: Record<string, unknown> | null
  errores: string[]
  estado: 'valido' | 'con_errores' | 'importado'
  idStaging?: string
}

type OpcionesPorCategoria = Map<string, OpcionImportacion[]>

const ALIAS: Record<string, string[]> = {
  nombre_completo: ['nombre completo', 'nombre', 'nombres y apellidos', 'paciente'],
  identificacion: ['identificacion', 'identificación', 'documento', 'numero de documento', 'número de documento', 'cedula', 'cédula'],
  sexo: ['sexo', 'genero', 'género'],
  fecha_nacimiento: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nacimiento'],
  peso_kg: ['peso kg', 'peso', 'peso (kg)'],
  talla_cm: ['talla cm', 'talla', 'talla (cm)'],
  procedencia: ['procedencia', 'departamento de procedencia', 'origen'],
  municipio_narino: ['municipio de nariño', 'municipio narino', 'municipio'],
  telefonos: ['telefonos', 'teléfonos', 'telefono', 'teléfono', 'celular', 'contacto'],
  sin_telefono: ['sin telefono', 'sin teléfono', 'no tiene telefono', 'no tiene teléfono'],
  eps: ['eps', 'aseguradora'],
  diagnostico: ['diagnostico', 'diagnóstico'],
  valvulopatia: ['tipo de valvulopatia', 'tipo de valvulopatía', 'valvulopatia', 'valvulopatía'],
  riesgos: ['factores de riesgo', 'riesgos', 'factor de riesgo'],
  rachs: ['rachs 1', 'rachs-1', 'rachs', 'escala rachs'],
  fecha_cirugia: ['fecha de cirugia', 'fecha de cirugía', 'cirugia', 'cirugía'],
  procedimientos: ['procedimientos quirurgicos', 'procedimientos quirúrgicos', 'procedimiento quirurgico', 'procedimiento quirúrgico', 'procedimientos'],
  implante: ['tipo de implante', 'implante'],
  uso_cec: ['uso de cec', 'cec', 'circulacion extracorporea', 'circulación extracorpórea'],
  tiempo_cec_min: ['tiempo cec min', 'tiempo de cec', 'tiempo cec', 'cec min'],
  tiempo_clamp_min: ['tiempo clamp min', 'tiempo de clamp', 'clamp de aorta', 'clamp min'],
  complicacion_intraqx: ['complicacion intraquirurgica', 'complicación intraquirúrgica', 'complicacion intraqx'],
  cierre_esternal_diferido: ['cierre esternal diferido'],
  extubacion_quirofano: ['extubacion en quirofano', 'extubación en quirófano', 'extubacion quirofano'],
  unidad_pop: ['unidad postoperatoria', 'unidad pop', 'uci'],
  horas_ventilacion_mecanica: ['horas de ventilacion mecanica', 'horas de ventilación mecánica', 'ventilacion mecanica', 'ventilación mecánica'],
  complicacion_pop: ['complicacion postoperatoria', 'complicación postoperatoria', 'complicacion pop'],
  fecha_traslado_intermedio: ['fecha de traslado a intermedio', 'fecha traslado intermedio', 'traslado a intermedio'],
  fecha_salida: ['fecha de salida', 'salida', 'fecha egreso', 'fecha de egreso'],
  condicion_salida: ['condicion de salida', 'condición de salida', 'condicion salida'],
  fecha_control_cirugia: ['fecha de control por cirugia cardiovascular', 'fecha de control por cirugía cardiovascular', 'fecha control cirugia', 'fecha control cirugía'],
  rehabilitacion_cardiaca: ['terapia de rehabilitacion cardiaca', 'terapia de rehabilitación cardíaca', 'rehabilitacion cardiaca', 'rehabilitación cardíaca'],
  estado_herida: ['estado de la herida quirurgica', 'estado de la herida quirúrgica', 'estado herida'],
  fecha_llamada_15_dias: ['fecha de llamada de los 15 dias', 'fecha de llamada de los 15 días', 'fecha llamada 15 dias', 'llamada 15 dias'],
  persona_recibe_llamada: ['persona que recibe la llamada', 'persona recibe llamada', 'recibe llamada'],
  reingreso_30_dias: ['reingreso a la institucion en los primeros 30 dias', 'reingreso a la institución en los primeros 30 días', 'reingreso 30 dias', 'reingreso'],
  fecha_reingreso: ['fecha de reingreso', 'fecha reingreso'],
  causa_reingreso: ['causa de reingreso', 'causa reingreso'],
  observaciones: ['observaciones', 'observacion', 'observación'],
}

function clave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function texto(valor: string | undefined): string {
  return (valor ?? '').replace(/\u00a0/g, ' ').trim()
}

function valorDe(datos: Record<string, string>, campo: string): string {
  const claves = new Set((ALIAS[campo] ?? [campo]).map(clave))
  return Object.entries(datos).find(([encabezado]) => claves.has(clave(encabezado)))?.[1] ?? ''
}

function esVacio(valor: string): boolean {
  return texto(valor) === ''
}

function esNa(valor: string): boolean {
  return ['na', 'n/a', 'n.a.'].includes(clave(valor))
}

function fechaIso(valor: string, etiqueta: string, errores: string[]): string | null {
  const entrada = texto(valor)
  if (!entrada || esNa(entrada)) return null

  let coincidencia = entrada.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  let anio: number
  let mes: number
  let dia: number
  if (coincidencia) {
    anio = Number(coincidencia[1])
    mes = Number(coincidencia[2])
    dia = Number(coincidencia[3])
  } else {
    coincidencia = entrada.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
    if (!coincidencia) {
      errores.push(`${etiqueta}: use una fecha válida (dd/mm/aaaa o aaaa-mm-dd).`)
      return null
    }
    dia = Number(coincidencia[1])
    mes = Number(coincidencia[2])
    anio = Number(coincidencia[3])
  }
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia))
  if (
    comprobacion.getUTCFullYear() !== anio ||
    comprobacion.getUTCMonth() !== mes - 1 ||
    comprobacion.getUTCDate() !== dia
  ) {
    errores.push(`${etiqueta}: la fecha no existe.`)
    return null
  }
  return `${anio.toString().padStart(4, '0')}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`
}

function numero(valor: string, etiqueta: string, errores: string[], entero = false): number | null {
  const entrada = texto(valor)
  if (!entrada || esNa(entrada)) return null
  const sinEspacios = entrada.replace(/\s/g, '')
  const normalizado =
    sinEspacios.includes(',') && sinEspacios.includes('.')
      ? sinEspacios.replace(/\./g, '').replace(',', '.')
      : sinEspacios.replace(',', '.')
  const resultado = Number(normalizado)
  if (!Number.isFinite(resultado) || (entero && !Number.isInteger(resultado))) {
    errores.push(`${etiqueta}: debe ser ${entero ? 'un número entero' : 'un número'}.`)
    return null
  }
  return resultado
}

function siNo(valor: string, etiqueta: string, errores: string[], permiteNa = false): 'SI' | 'NO' | 'NA' | null {
  const entrada = clave(valor)
  if (!entrada) return null
  if (['si', 's', 'yes'].includes(entrada)) return 'SI'
  if (['no', 'n'].includes(entrada)) return 'NO'
  if (permiteNa && ['na', 'n/a'].includes(entrada)) return 'NA'
  errores.push(`${etiqueta}: use Sí, No${permiteNa ? ' o N/A' : ''}.`)
  return null
}

function opcionesPorCategoria(opciones: OpcionImportacion[]): OpcionesPorCategoria {
  const resultado = new Map<string, OpcionImportacion[]>()
  for (const opcion of opciones) {
    const actuales = resultado.get(opcion.categoria) ?? []
    actuales.push(opcion)
    resultado.set(opcion.categoria, actuales)
  }
  return resultado
}

function opcionId(
  opciones: OpcionesPorCategoria,
  categoria: string,
  valor: string,
  etiqueta: string,
  errores: string[],
): string | null {
  if (esVacio(valor)) return null
  const buscada = clave(esNa(valor) ? 'N/A' : valor)
  const encontrada = (opciones.get(categoria) ?? []).find((opcion) => clave(opcion.valor) === buscada)
  if (!encontrada) {
    errores.push(`${etiqueta}: “${texto(valor)}” no existe en la lista ${categoria}.`)
    return null
  }
  return encontrada.id
}

function opcionPorId(opciones: OpcionesPorCategoria, categoria: string, id: string | null): OpcionImportacion | null {
  if (!id) return null
  return (opciones.get(categoria) ?? []).find((opcion) => opcion.id === id) ?? null
}

function listaIds(
  opciones: OpcionesPorCategoria,
  categoria: string,
  valor: string,
  etiqueta: string,
  errores: string[],
): string[] {
  if (esVacio(valor) || esNa(valor)) return []
  const valores = texto(valor).split(/[|;]/).map(texto).filter(Boolean)
  const ids = valores.map((item) => opcionId(opciones, categoria, item, etiqueta, errores)).filter((id): id is string => !!id)
  if (new Set(ids).size !== ids.length) errores.push(`${etiqueta}: no puede repetir una opción.`)
  return [...new Set(ids)]
}

function moduloTieneDatos(valores: unknown[]): boolean {
  return valores.some((valor) => Array.isArray(valor) ? valor.length > 0 : valor !== null && valor !== '')
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

function agregarErrorObligatorio(valor: string, etiqueta: string, errores: string[]) {
  if (esVacio(valor) || esNa(valor)) errores.push(`${etiqueta} es obligatorio.`)
}

/** Convierte y valida una fila antes de guardarla en staging. No crea datos clínicos. */
export function normalizarFilaImportacion(
  numeroFila: number,
  datosOriginales: Record<string, string>,
  opcionesDisponibles: OpcionImportacion[],
): FilaImportacion {
  const errores: string[] = []
  const opciones = opcionesPorCategoria(opcionesDisponibles)

  const nombreCompleto = texto(valorDe(datosOriginales, 'nombre_completo'))
  const identificacion = texto(valorDe(datosOriginales, 'identificacion')).replace(/\s/g, '')
  const nacimiento = fechaIso(valorDe(datosOriginales, 'fecha_nacimiento'), 'Fecha de nacimiento', errores)
  agregarErrorObligatorio(nombreCompleto, 'Nombre completo', errores)
  agregarErrorObligatorio(identificacion, 'Identificación', errores)
  if (identificacion && !/^\d+$/.test(identificacion)) errores.push('Identificación: solo se permiten números.')
  if (!nacimiento) errores.push('Fecha de nacimiento es obligatoria.')
  if (nacimiento && nacimiento > hoyIso()) errores.push('Fecha de nacimiento no puede ser futura.')

  const peso = numero(valorDe(datosOriginales, 'peso_kg'), 'Peso', errores)
  if (peso !== null && (peso < 0.5 || peso > 150)) errores.push('Peso: debe estar entre 0.5 y 150 kg.')
  const talla = numero(valorDe(datosOriginales, 'talla_cm'), 'Talla', errores, true)
  if (talla !== null && (talla < 30 || talla > 220)) errores.push('Talla: debe estar entre 30 y 220 cm.')

  const procedenciaId = opcionId(opciones, 'PROCEDENCIA', valorDe(datosOriginales, 'procedencia'), 'Procedencia', errores)
  const procedencia = opcionPorId(opciones, 'PROCEDENCIA', procedenciaId)
  const esNarino = procedencia?.codigo === 'NARINO'
  const municipioTexto = valorDe(datosOriginales, 'municipio_narino')
  const municipioId = esNarino
    ? opcionId(opciones, 'MUNICIPIOS', municipioTexto, 'Municipio de Nariño', errores)
    : null
  if (esNarino && !municipioId) errores.push('Municipio de Nariño es obligatorio cuando la procedencia es Nariño.')

  const telefonos = texto(valorDe(datosOriginales, 'telefonos')).split(/[|;]/).map(texto).filter(Boolean)
  const sinTelefono = siNo(valorDe(datosOriginales, 'sin_telefono'), 'Sin teléfono', errores) === 'SI'
  if (!sinTelefono && telefonos.length === 0) errores.push('Registre al menos un teléfono o marque Sin teléfono.')

  const paciente = {
    nombre_completo: nombreCompleto,
    identificacion,
    sexo_id: opcionId(opciones, 'SEXO', valorDe(datosOriginales, 'sexo'), 'Sexo', errores),
    fecha_nacimiento: nacimiento,
    peso_kg: peso,
    talla_cm: talla,
    procedencia_id: procedenciaId,
    municipio_narino_id: municipioId,
    telefonos,
    sin_telefono: sinTelefono,
    eps_id: opcionId(opciones, 'EPS', valorDe(datosOriginales, 'eps'), 'EPS', errores),
    estado_modulo: 'pendiente' as EstadoModulo,
  }
  paciente.estado_modulo = calcularEstadoModulo1({
    nombreCompleto,
    identificacion,
    fechaNacimiento: nacimiento ?? '',
    procedenciaEsNarino: esNarino,
    municipioNarinoId: municipioId ?? '',
    sinTelefono,
    telefonos,
  })

  const diagnosticoId = opcionId(opciones, 'DIAGNOSTICO', valorDe(datosOriginales, 'diagnostico'), 'Diagnóstico', errores)
  const valvulopatiaId = opcionId(opciones, 'VALVULOPATIA', valorDe(datosOriginales, 'valvulopatia'), 'Tipo de valvulopatía', errores)
  const rachsId = opcionId(opciones, 'RACHS', valorDe(datosOriginales, 'rachs'), 'RACHS-1', errores)
  const riesgoIds = listaIds(opciones, 'RIESGOS', valorDe(datosOriginales, 'riesgos'), 'Factores de riesgo', errores)
  const diagnostico = moduloTieneDatos([diagnosticoId, valvulopatiaId, rachsId, riesgoIds])
    ? {
        diagnostico_id: diagnosticoId,
        valvulopatia_id: valvulopatiaId,
        rachs_id: rachsId,
        riesgo_ids: riesgoIds,
        estado_modulo: 'pendiente' as EstadoModulo,
      }
    : null
  if (diagnostico) {
    const esValvulopatia = opcionPorId(opciones, 'DIAGNOSTICO', diagnosticoId)?.codigo === 'VALVULOPATIAS'
    if (esValvulopatia && !valvulopatiaId) errores.push('Tipo de valvulopatía es obligatorio para el diagnóstico Valvulopatías.')
    diagnostico.estado_modulo = calcularEstadoModulo2({
      diagnosticoId: diagnosticoId ?? '',
      rachsId: rachsId ?? '',
      diagnosticoEsValvulopatias: esValvulopatia,
      valvulopatiaId: valvulopatiaId ?? '',
      riesgoIds,
    })
  }

  const fechaCirugia = fechaIso(valorDe(datosOriginales, 'fecha_cirugia'), 'Fecha de cirugía', errores)
  if (fechaCirugia && nacimiento && fechaCirugia < nacimiento) errores.push('Fecha de cirugía no puede ser anterior al nacimiento.')
  const usoCec = siNo(valorDe(datosOriginales, 'uso_cec'), 'Uso de CEC', errores)
  const tiempoCec = numero(valorDe(datosOriginales, 'tiempo_cec_min'), 'Tiempo de CEC', errores, true)
  const tiempoClamp = numero(valorDe(datosOriginales, 'tiempo_clamp_min'), 'Tiempo de clamp', errores, true)
  if (usoCec !== 'SI' && (tiempoCec !== null || tiempoClamp !== null)) errores.push('Los tiempos CEC y clamp solo aplican si CEC = Sí.')
  if (usoCec === 'SI' && tiempoCec === null) errores.push('Tiempo de CEC es obligatorio cuando CEC = Sí.')
  if (tiempoCec !== null && tiempoClamp !== null && tiempoClamp > tiempoCec) errores.push('Tiempo de clamp no puede ser mayor que el tiempo de CEC.')
  const procedimientoIds = listaIds(opciones, 'PROCEDIMIENTOS', valorDe(datosOriginales, 'procedimientos'), 'Procedimientos', errores)
  if (procedimientoIds.length > 3) errores.push('Solo se permiten hasta tres procedimientos quirúrgicos.')
  const cirugia = moduloTieneDatos([
    fechaCirugia, procedimientoIds, usoCec, tiempoCec, tiempoClamp, valorDe(datosOriginales, 'implante'),
    valorDe(datosOriginales, 'complicacion_intraqx'), valorDe(datosOriginales, 'cierre_esternal_diferido'),
    valorDe(datosOriginales, 'extubacion_quirofano'),
  ])
    ? {
        fecha_cirugia: fechaCirugia,
        procedimiento_ids: procedimientoIds,
        implante_id: opcionId(opciones, 'IMPLANTE', valorDe(datosOriginales, 'implante'), 'Tipo de implante', errores),
        uso_cec: usoCec === 'NA' ? null : usoCec,
        tiempo_cec_min: usoCec === 'SI' ? tiempoCec : null,
        tiempo_clamp_min: usoCec === 'SI' ? tiempoClamp : null,
        complicacion_intraqx_id: opcionId(opciones, 'COMPLICACION_INTRAQX', valorDe(datosOriginales, 'complicacion_intraqx'), 'Complicación intraquirúrgica', errores),
        cierre_esternal_diferido: siNo(valorDe(datosOriginales, 'cierre_esternal_diferido'), 'Cierre esternal diferido', errores),
        extubacion_quirofano: siNo(valorDe(datosOriginales, 'extubacion_quirofano'), 'Extubación en quirófano', errores),
        estado_modulo: 'pendiente' as EstadoModulo,
      }
    : null
  if (cirugia) {
    if (!fechaCirugia) errores.push('Fecha de cirugía es obligatoria cuando hay datos intraoperatorios.')
    if (procedimientoIds.length === 0) errores.push('Procedimiento quirúrgico 1 es obligatorio cuando hay datos intraoperatorios.')
    cirugia.estado_modulo = calcularEstadoModulo3({
      fechaCirugia: fechaCirugia ?? '',
      procedimiento1Id: procedimientoIds[0] ?? '',
      usoCec: usoCec === 'SI' || usoCec === 'NO' ? usoCec : '',
      tiempoCecMin: tiempoCec?.toString() ?? '',
    })
  }

  const traslado = fechaIso(valorDe(datosOriginales, 'fecha_traslado_intermedio'), 'Fecha de traslado', errores)
  const salida = fechaIso(valorDe(datosOriginales, 'fecha_salida'), 'Fecha de salida', errores)
  if (fechaCirugia && traslado && traslado < fechaCirugia) errores.push('Fecha de traslado no puede ser anterior a la cirugía.')
  if (fechaCirugia && salida && salida < fechaCirugia) errores.push('Fecha de salida no puede ser anterior a la cirugía.')
  if (traslado && salida && salida < traslado) errores.push('Fecha de salida no puede ser anterior al traslado.')
  const horasVentilacion = numero(valorDe(datosOriginales, 'horas_ventilacion_mecanica'), 'Horas de ventilación mecánica', errores, true)
  const condicionSalidaId = opcionId(opciones, 'CONDICION_SALIDA', valorDe(datosOriginales, 'condicion_salida'), 'Condición de salida', errores)
  const postoperatorio = moduloTieneDatos([
    traslado, salida, horasVentilacion, condicionSalidaId, valorDe(datosOriginales, 'unidad_pop'),
    valorDe(datosOriginales, 'complicacion_pop'),
  ])
    ? {
        unidad_pop_id: opcionId(opciones, 'UNIDAD_POP', valorDe(datosOriginales, 'unidad_pop'), 'Unidad postoperatoria', errores),
        horas_ventilacion_mecanica: horasVentilacion,
        complicacion_pop_id: opcionId(opciones, 'COMPLICACION_POP', valorDe(datosOriginales, 'complicacion_pop'), 'Complicación postoperatoria', errores),
        fecha_traslado_intermedio: traslado,
        fecha_salida: salida,
        condicion_salida_id: condicionSalidaId,
        estado_modulo: 'pendiente' as EstadoModulo,
      }
    : null
  if (postoperatorio) {
    postoperatorio.estado_modulo = calcularEstadoModulo4({
      unidadPopId: postoperatorio.unidad_pop_id ?? '',
      horasVentilacion: horasVentilacion?.toString() ?? '',
      complicacionPopId: postoperatorio.complicacion_pop_id ?? '',
      condicionSalidaId: condicionSalidaId ?? '',
    })
  }

  const reingreso = siNo(valorDe(datosOriginales, 'reingreso_30_dias'), 'Reingreso a 30 días', errores, true)
  const fechaReingreso = fechaIso(valorDe(datosOriginales, 'fecha_reingreso'), 'Fecha de reingreso', errores)
  if (reingreso === 'SI' && (!fechaReingreso || !valorDe(datosOriginales, 'causa_reingreso'))) {
    errores.push('Fecha y causa de reingreso son obligatorias cuando hubo reingreso.')
  }
  if (reingreso === 'SI' && fechaReingreso && salida && (fechaReingreso < salida || diasEntre(salida, fechaReingreso) > 30)) {
    errores.push('Fecha de reingreso debe estar dentro de los 30 días posteriores a la salida.')
  }
  const esMuerte = opcionPorId(opciones, 'CONDICION_SALIDA', condicionSalidaId)?.codigo === 'MUERTE'
  const seguimientoTieneDatos = moduloTieneDatos([
    valorDe(datosOriginales, 'fecha_control_cirugia'), valorDe(datosOriginales, 'rehabilitacion_cardiaca'), valorDe(datosOriginales, 'estado_herida'),
    valorDe(datosOriginales, 'fecha_llamada_15_dias'), valorDe(datosOriginales, 'persona_recibe_llamada'), reingreso,
    fechaReingreso, valorDe(datosOriginales, 'causa_reingreso'), valorDe(datosOriginales, 'observaciones'),
  ])
  if (seguimientoTieneDatos && !postoperatorio) errores.push('No puede importar seguimiento sin datos postoperatorios y de egreso.')
  const seguimiento = seguimientoTieneDatos && !esMuerte && postoperatorio
    ? {
        fecha_control_cirugia: fechaIso(valorDe(datosOriginales, 'fecha_control_cirugia'), 'Fecha de control', errores),
        rehabilitacion_cardiaca: siNo(valorDe(datosOriginales, 'rehabilitacion_cardiaca'), 'Rehabilitación cardíaca', errores, true),
        estado_herida_id: opcionId(opciones, 'ESTADO_HERIDA', valorDe(datosOriginales, 'estado_herida'), 'Estado de la herida', errores),
        fecha_llamada_15_dias: fechaIso(valorDe(datosOriginales, 'fecha_llamada_15_dias'), 'Fecha de llamada a 15 días', errores),
        persona_recibe_llamada: texto(valorDe(datosOriginales, 'persona_recibe_llamada')) || null,
        reingreso_30_dias: reingreso,
        fecha_reingreso: reingreso === 'SI' ? fechaReingreso : null,
        causa_reingreso_id: reingreso === 'SI'
          ? opcionId(opciones, 'CAUSA_REINGRESO', valorDe(datosOriginales, 'causa_reingreso'), 'Causa de reingreso', errores)
          : null,
        observaciones: texto(valorDe(datosOriginales, 'observaciones')) || null,
        estado_modulo: 'pendiente' as EstadoModulo,
      }
    : null
  if (seguimiento) {
    seguimiento.estado_modulo = calcularEstadoModulo5({
      fechaControl: seguimiento.fecha_control_cirugia ?? '',
      rehabilitacionCardiaca: seguimiento.rehabilitacion_cardiaca ?? '',
      estadoHeridaId: seguimiento.estado_herida_id ?? '',
      fechaLlamada15Dias: seguimiento.fecha_llamada_15_dias ?? '',
      personaRecibeLlamada: seguimiento.persona_recibe_llamada ?? '',
      reingreso: seguimiento.reingreso_30_dias ?? '',
      fechaReingreso: seguimiento.fecha_reingreso ?? '',
      causaReingresoId: seguimiento.causa_reingreso_id ?? '',
    })
  }

  return {
    numeroFila,
    datosOriginales,
    normalizado: errores.length > 0 ? null : { paciente, diagnostico, cirugia, postoperatorio, seguimiento },
    errores,
    estado: errores.length > 0 ? 'con_errores' : 'valido',
  }
}

/** Detecta duplicados dentro del mismo archivo; la comprobación contra la BD se hace en la página. */
export function marcarIdentificacionesDuplicadas(filas: FilaImportacion[]): FilaImportacion[] {
  const conteo = new Map<string, number>()
  for (const fila of filas) {
    const paciente = fila.normalizado?.paciente as Record<string, unknown> | undefined
    const id = String(paciente?.identificacion ?? '')
    if (id) conteo.set(id, (conteo.get(id) ?? 0) + 1)
  }
  return filas.map((fila) => {
    const paciente = fila.normalizado?.paciente as Record<string, unknown> | undefined
    const id = String(paciente?.identificacion ?? '')
    if (!id || conteo.get(id) === 1) return fila
    return {
      ...fila,
      normalizado: null,
      errores: [...fila.errores, 'La identificación está repetida dentro del archivo.'],
      estado: 'con_errores',
    }
  })
}

export const ENCABEZADOS_EXPORTACION = [
  ['numero_paciente', 'N° paciente'], ['nombre_completo', 'Nombre completo'], ['identificacion', 'Identificación'], ['sexo', 'Sexo'],
  ['fecha_nacimiento', 'Fecha de nacimiento'], ['peso_kg', 'Peso (kg)'], ['talla_cm', 'Talla (cm)'], ['procedencia', 'Procedencia'],
  ['municipio_narino', 'Municipio de Nariño'], ['telefonos', 'Teléfonos'], ['sin_telefono', 'Sin teléfono'], ['eps', 'EPS'],
  ['diagnostico', 'Diagnóstico'], ['valvulopatia', 'Tipo de valvulopatía'], ['riesgos', 'Factores de riesgo'], ['rachs', 'RACHS-1'],
  ['fecha_cirugia', 'Fecha de cirugía'], ['procedimientos', 'Procedimientos quirúrgicos'], ['implante', 'Tipo de implante'], ['uso_cec', 'Uso de CEC'],
  ['tiempo_cec_min', 'Tiempo CEC (min)'], ['tiempo_clamp_min', 'Tiempo clamp (min)'], ['complicacion_intraqx', 'Complicación intraquirúrgica'],
  ['cierre_esternal_diferido', 'Cierre esternal diferido'], ['extubacion_quirofano', 'Extubación en quirófano'], ['unidad_pop', 'Unidad postoperatoria'],
  ['horas_ventilacion_mecanica', 'Horas de ventilación mecánica'], ['complicacion_pop', 'Complicación postoperatoria'],
  ['fecha_traslado_intermedio', 'Fecha de traslado a intermedio'], ['fecha_salida', 'Fecha de salida'], ['condicion_salida', 'Condición de salida'],
  ['fecha_control_cirugia', 'Fecha de control por cirugía cardiovascular'], ['rehabilitacion_cardiaca', 'Terapia de rehabilitación cardíaca'],
  ['estado_herida', 'Estado de la herida quirúrgica'], ['fecha_llamada_15_dias', 'Fecha de llamada de los 15 días'],
  ['persona_recibe_llamada', 'Persona que recibe la llamada'], ['reingreso_30_dias', 'Reingreso a la institución en los primeros 30 días'],
  ['fecha_reingreso', 'Fecha de reingreso'], ['causa_reingreso', 'Causa de reingreso'], ['observaciones', 'Observaciones'],
] as const
