// Reglas de negocio y persistencia de los 5 módulos del módulo de adultos. Mismo patrón que
// servicios.mjs (autocorrecciones silenciosas, rechazos 422, auditoría transaccional), separado en
// su propio archivo porque las tablas, listas y algunas reglas (edad mínima, sin RACHS-1, EuroSCORE)
// son distintas de las del módulo pediátrico.
import { hoyBogota, todas, una } from './db.mjs'
import { ErrorApi, noEncontrado, reglaNegocio } from './errores.mjs'
import { Validador, diasEntre } from './validar.mjs'
import {
  actualizar, codigoDe, especificacionDe, filaApi, idPorCodigo, insertar, leerProcedimientos, leerProcedimientosGuardados,
  leerSeleccion, normalizarDatosPaciente, normalizarDiagnosticos, normalizarProcedimientos, normalizarReingresoYHerida,
  sincronizarProcedimientos, sincronizarSeleccion,
} from './servicios.mjs'

const ESTADOS = ['pendiente', 'completo']

/** Columnas que el pedido del 23-oct quitó de la ficha (estado preoperatorio, antecedentes y
 * comorbilidades del formato FR-GCC-21, la transfusión intraoperatoria, los días escritos a mano y el
 * implante de la cirugía entera): siguen en la base con lo ya registrado, pero la API no las devuelve. */
const CAMPOS_RETIRADOS = [
  'estado_preoperatorio', 'antecedentes_quirurgicos', 'comorbilidades', 'transfusion_intraoperatoria',
  'dias_estancia_uci', 'dias_hospitalizacion_total', 'implante_id', 'numero_implante',
]

function sinCamposRetirados(fila) {
  for (const campo of CAMPOS_RETIRADOS) delete fila[campo]
  return fila
}

/** Fecha (aaaa-mm-dd) de hace exactamente `anios` años, para validar la edad mínima del módulo de adultos. */
function haceAnios(anios) {
  const [a, m, d] = hoyBogota().split('-')
  return `${String(Number(a) - anios).padStart(4, '0')}-${m}-${d}`
}

// ---------------------------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------------------------

export async function obtenerPacienteAdulto(conexion, id) {
  const fila = await una(conexion, 'SELECT * FROM pacientes_adultos WHERE id = ?', [id])
  if (!fila) throw noEncontrado('No se encontró el paciente.')
  return fila
}

function leerPacienteAdulto(cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    nombre_completo: v.texto('nombre_completo', { obligatorio: true }),
    identificacion: v.texto('identificacion', { obligatorio: true, max: 50 }),
    sexo_id: v.id('sexo_id'),
    sexo_otro: v.texto('sexo_otro'),
    fecha_nacimiento: v.fecha('fecha_nacimiento', { obligatoria: true }),
    peso_kg: v.decimal('peso_kg', { min: 30, max: 300 }),
    talla_cm: v.entero('talla_cm', { min: 120, max: 230 }),
    procedencia_id: v.id('procedencia_id'),
    procedencia_otro: v.texto('procedencia_otro'),
    municipio_narino_id: v.id('municipio_narino_id'),
    telefono: v.texto('telefono', { max: 50 }),
    eps_id: v.id('eps_id'),
    eps_otro: v.texto('eps_otro'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  if (datos.identificacion && !/^\d+$/.test(datos.identificacion)) v.error('identificacion', 'Solo se permiten números.')
  if (datos.fecha_nacimiento) {
    if (datos.fecha_nacimiento > hoyBogota()) v.error('fecha_nacimiento', 'No puede ser futura.')
    // El módulo de adultos es para pacientes de 18 años o más; menores van en el módulo pediátrico.
    else if (datos.fecha_nacimiento > haceAnios(18)) v.error('fecha_nacimiento', 'El paciente debe ser mayor de edad (18 años o más).')
  }
  v.finalizar()
  return datos
}

export async function crearPacienteAdulto(conexion, usuario, cuerpo, extras = {}) {
  const datos = await normalizarDatosPaciente(conexion, leerPacienteAdulto(cuerpo))
  const pacienteId = await insertar(conexion, usuario, 'pacientes_adultos', { ...datos, ...extras, actualizado_por: usuario.id })
  // La primera intervención se crea junto con el paciente: así el flujo de hoy (llenar los
  // módulos 2-5 en cualquier orden, sin un paso extra) no cambia para el caso común de una sola
  // cirugía. Las reintervenciones se agregan explícitamente desde la ficha.
  await insertar(conexion, usuario, 'episodios_adultos', { paciente_id: pacienteId, numero_episodio: 1 })
  return pacienteId
}

// ---------------------------------------------------------------------------------------------
// Episodios (intervenciones): un paciente adulto puede tener varias cirugías a lo largo del
// tiempo (p. ej. una reintervención meses después). Cada episodio agrupa su propio diagnóstico,
// cirugía, postoperatorio y seguimiento — ver episodio_id en esas 4 tablas (schema.mjs).
// ---------------------------------------------------------------------------------------------

export async function obtenerEpisodioAdulto(conexion, pacienteId, episodioId) {
  const fila = await una(conexion, 'SELECT * FROM episodios_adultos WHERE id = ? AND paciente_id = ?', [episodioId, pacienteId])
  if (!fila) throw noEncontrado('No se encontró la intervención del paciente.')
  return fila
}

/** Las intervenciones del paciente, cada una con lo que la ficha necesita para mostrarla al elegirla:
 * su fecha de cirugía, su diagnóstico y el estado de sus módulos 2 a 5 (cada intervención tiene los
 * suyos; el Módulo 1 es del paciente y vale para todas). */
export async function listarEpisodiosAdultos(conexion, pacienteId) {
  return todas(conexion, `
    SELECT e.id, e.paciente_id, e.numero_episodio, e.creado_en, c.fecha_cirugia, dg.valor AS diagnostico_valor,
      COALESCE(d.estado_modulo, 'pendiente') AS estado_m2, COALESCE(c.estado_modulo, 'pendiente') AS estado_m3,
      COALESCE(po.estado_modulo, 'pendiente') AS estado_m4, COALESCE(s.estado_modulo, 'pendiente') AS estado_m5
    FROM episodios_adultos e
    LEFT JOIN diagnosticos_adultos d ON d.episodio_id = e.id
    LEFT JOIN opciones_lista dg ON dg.id = d.diagnostico_id
    LEFT JOIN cirugias_adultos c ON c.episodio_id = e.id
    LEFT JOIN postoperatorio_adultos po ON po.episodio_id = e.id
    LEFT JOIN seguimientos_adultos s ON s.episodio_id = e.id
    WHERE e.paciente_id = ?
    ORDER BY e.numero_episodio`, [pacienteId])
}

export async function crearEpisodioAdulto(conexion, usuario, pacienteId) {
  await obtenerPacienteAdulto(conexion, pacienteId)
  const { siguiente } = await una(conexion, 'SELECT COALESCE(MAX(numero_episodio), 0) + 1 AS siguiente FROM episodios_adultos WHERE paciente_id = ?', [pacienteId])
  return insertar(conexion, usuario, 'episodios_adultos', { paciente_id: pacienteId, numero_episodio: siguiente })
}

export async function actualizarPacienteAdulto(conexion, usuario, id, cuerpo) {
  await obtenerPacienteAdulto(conexion, id)
  const datos = await normalizarDatosPaciente(conexion, leerPacienteAdulto(cuerpo))
  await actualizar(conexion, usuario, 'pacientes_adultos', id, datos)
  return id
}

export async function marcarEliminadoAdulto(conexion, usuario, id, eliminado) {
  const paciente = await una(conexion, 'SELECT * FROM pacientes_adultos WHERE id = ?', [id])
  if (!paciente) throw noEncontrado('No se encontró el paciente.')
  await actualizar(conexion, usuario, 'pacientes_adultos', id, {
    eliminado,
    eliminado_en: eliminado ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    eliminado_por: eliminado ? usuario.id : null,
  })
  return id
}

// ---------------------------------------------------------------------------------------------
// Módulo 2 · Diagnóstico, riesgos y EuroSCORE
// ---------------------------------------------------------------------------------------------

/** A diferencia del pediátrico (un único `codigo` 'VALVULOPATIAS'), el diagnóstico de adultos tiene
 * tres opciones que implican valvulopatía ("Valvulopatía", "Arritmia cardíaca + valvulopatía",
 * "Enfermedad coronaria + valvulopatía"), así que se detecta por texto en vez de por código. */
async function diagnosticoMencionaValvulopatia(conexion, diagnosticoId) {
  if (!diagnosticoId) return false
  const fila = await una(conexion, 'SELECT valor FROM opciones_lista WHERE id = ?', [diagnosticoId])
  return /valvulopat/i.test(fila?.valor ?? '')
}

export async function obtenerDiagnosticoAdulto(conexion, episodioId) {
  const fila = await una(conexion, 'SELECT * FROM diagnosticos_adultos WHERE episodio_id = ?', [episodioId])
  if (!fila) return null
  const riesgos = await leerSeleccion(conexion, { tabla: 'diagnosticos_adultos_riesgos', columnaDueno: 'diagnostico_id', duenoId: fila.id, columnaOpcion: 'riesgo_id' })
  return { ...sinCamposRetirados(filaApi('diagnosticos_adultos', fila)), riesgo_ids: riesgos.ids, riesgo_especificaciones: riesgos.especificaciones }
}

export async function guardarDiagnosticoAdulto(conexion, usuario, episodioId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    diagnostico_id: v.id('diagnostico_id'),
    diagnostico_otro: v.texto('diagnostico_otro'),
    diagnostico_adicional_id: v.id('diagnostico_adicional_id'),
    diagnostico_adicional_otro: v.texto('diagnostico_adicional_otro'),
    valvulopatia_id: v.id('valvulopatia_id'),
    euroscore: v.decimal('euroscore', { min: 0, max: 100 }),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const riesgoIds = [...new Set(v.ids('riesgo_ids'))]
  const riesgoEspecificaciones = v.especificaciones('riesgo_especificaciones')
  v.finalizar()

  await normalizarDiagnosticos(conexion, datos)
  // Regla silenciosa: la valvulopatía solo aplica si el diagnóstico (principal o adicional) la
  // menciona; si no, queda en N/A.
  if (!(await diagnosticoMencionaValvulopatia(conexion, datos.diagnostico_id)) &&
      !(await diagnosticoMencionaValvulopatia(conexion, datos.diagnostico_adicional_id))) {
    datos.valvulopatia_id = await idPorCodigo(conexion, 'VALVULOPATIA', 'NA')
  }
  // Regla dura: "Ninguno" excluye cualquier otro factor de riesgo.
  const ningunoId = await idPorCodigo(conexion, 'RIESGOS_ADULTO', 'NINGUNO')
  if (ningunoId && riesgoIds.includes(ningunoId) && riesgoIds.length > 1) {
    throw reglaNegocio('No se puede seleccionar "Ninguno" junto con otros factores de riesgo.')
  }

  const existente = await una(conexion, 'SELECT id FROM diagnosticos_adultos WHERE episodio_id = ?', [episodioId])
  let diagnosticoId
  if (existente) {
    diagnosticoId = existente.id
    await actualizar(conexion, usuario, 'diagnosticos_adultos', diagnosticoId, datos)
  } else {
    diagnosticoId = await insertar(conexion, usuario, 'diagnosticos_adultos', { episodio_id: episodioId, ...datos, actualizado_por: usuario.id })
  }

  await sincronizarSeleccion(conexion, usuario, {
    tabla: 'diagnosticos_adultos_riesgos', columnaDueno: 'diagnostico_id', duenoId: diagnosticoId, columnaOpcion: 'riesgo_id',
    ids: riesgoIds, especificaciones: riesgoEspecificaciones,
  })
  return diagnosticoId
}

// ---------------------------------------------------------------------------------------------
// Módulo 3 · Cirugía y procedimientos
// ---------------------------------------------------------------------------------------------

export async function obtenerCirugiaAdulto(conexion, episodioId) {
  const fila = await una(conexion, 'SELECT * FROM cirugias_adultos WHERE episodio_id = ?', [episodioId])
  if (!fila) return null
  const procedimientos = await leerProcedimientosGuardados(conexion, 'cirugias_adultos_procedimientos', fila.id)
  const complicaciones = await leerSeleccion(conexion, { tabla: 'cirugias_adultos_complicaciones_intraqx', columnaDueno: 'cirugia_id', duenoId: fila.id, columnaOpcion: 'complicacion_id' })
  return {
    ...sinCamposRetirados(filaApi('cirugias_adultos', fila)),
    procedimientos,
    procedimiento_ids: procedimientos.map((p) => p.procedimiento_id),
    complicacion_intraqx_ids: complicaciones.ids,
    complicacion_intraqx_especificaciones: complicaciones.especificaciones,
  }
}

export async function guardarCirugiaAdulto(conexion, usuario, episodioId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    fecha_cirugia: v.fecha('fecha_cirugia'),
    uso_cec: v.opcion('uso_cec', ['SI', 'NO']),
    tiempo_cec_min: v.entero('tiempo_cec_min', { min: 0 }),
    tiempo_clamp_min: v.entero('tiempo_clamp_min', { min: 0 }),
    cierre_esternal_diferido: v.opcion('cierre_esternal_diferido', ['SI', 'NO']),
    extubacion_quirofano: v.opcion('extubacion_quirofano', ['SI', 'NO']),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const procedimientos = leerProcedimientos(v, cuerpo)
  if (procedimientos.length > 3) v.error('procedimientos', 'Solo se permiten hasta tres procedimientos.')
  const procedimientoIds = procedimientos.map((p) => p.procedimientoId)
  const complicacionIntraqxIds = [...new Set(v.ids('complicacion_intraqx_ids'))]
  const complicacionIntraqxEspecificaciones = v.especificaciones('complicacion_intraqx_especificaciones')
  v.finalizar()

  if (new Set(procedimientoIds).size !== procedimientoIds.length) throw reglaNegocio('Los procedimientos 1, 2 y 3 no pueden repetirse.')
  await normalizarProcedimientos(conexion, procedimientos)
  // Regla silenciosa: sin CEC no hay tiempos de CEC ni de clamp.
  if (datos.uso_cec !== 'SI') {
    datos.tiempo_cec_min = null
    datos.tiempo_clamp_min = null
  }
  if (datos.tiempo_clamp_min !== null && (datos.tiempo_cec_min === null || datos.tiempo_clamp_min > datos.tiempo_cec_min)) {
    throw reglaNegocio('El tiempo de clamp de aorta no puede ser mayor que el tiempo de CEC.')
  }
  const episodio = await una(conexion, `
    SELECT p.fecha_nacimiento FROM episodios_adultos e JOIN pacientes_adultos p ON p.id = e.paciente_id WHERE e.id = ?`, [episodioId])
  if (datos.fecha_cirugia && datos.fecha_cirugia < episodio.fecha_nacimiento) {
    throw reglaNegocio('La fecha de cirugía no puede ser anterior a la fecha de nacimiento del paciente.')
  }

  const existente = await una(conexion, 'SELECT id FROM cirugias_adultos WHERE episodio_id = ?', [episodioId])
  let cirugiaId
  if (existente) {
    cirugiaId = existente.id
    await actualizar(conexion, usuario, 'cirugias_adultos', cirugiaId, datos)
  } else {
    cirugiaId = await insertar(conexion, usuario, 'cirugias_adultos', { episodio_id: episodioId, ...datos, actualizado_por: usuario.id })
  }

  await sincronizarProcedimientos(conexion, usuario, 'cirugias_adultos_procedimientos', cirugiaId, procedimientos)
  await sincronizarSeleccion(conexion, usuario, {
    tabla: 'cirugias_adultos_complicaciones_intraqx', columnaDueno: 'cirugia_id', duenoId: cirugiaId, columnaOpcion: 'complicacion_id',
    ids: complicacionIntraqxIds, especificaciones: complicacionIntraqxEspecificaciones,
  })
  return cirugiaId
}

// ---------------------------------------------------------------------------------------------
// Módulo 4 · Postoperatorio (y sincronización con el Módulo 5)
// ---------------------------------------------------------------------------------------------

export async function obtenerPostoperatorioAdulto(conexion, episodioId) {
  const fila = await una(conexion, 'SELECT * FROM postoperatorio_adultos WHERE episodio_id = ?', [episodioId])
  if (!fila) return null
  const complicaciones = await leerSeleccion(conexion, { tabla: 'postoperatorio_adultos_complicaciones_pop', columnaDueno: 'postoperatorio_id', duenoId: fila.id, columnaOpcion: 'complicacion_id' })
  return {
    ...sinCamposRetirados(filaApi('postoperatorio_adultos', fila)),
    complicacion_pop_ids: complicaciones.ids,
    complicacion_pop_especificaciones: complicaciones.especificaciones,
  }
}

/** Condición de salida = Muerte => Módulo 5 "no aplica"; si se corrige, vuelve a pendiente. */
async function sincronizarSeguimientoAdulto(conexion, usuario, episodioId, condicionSalidaId) {
  const esMuerte = (await codigoDe(conexion, condicionSalidaId)) === 'MUERTE'
  const estado = esMuerte ? 'no_aplica' : 'pendiente'
  const existente = await una(conexion, 'SELECT id, no_aplica FROM seguimientos_adultos WHERE episodio_id = ?', [episodioId])
  if (!existente) {
    await insertar(conexion, usuario, 'seguimientos_adultos', { episodio_id: episodioId, no_aplica: esMuerte, estado_modulo: estado, actualizado_por: usuario.id })
  } else if (Boolean(existente.no_aplica) !== esMuerte) {
    await actualizar(conexion, usuario, 'seguimientos_adultos', existente.id, { no_aplica: esMuerte, estado_modulo: estado })
  }
}

export async function guardarPostoperatorioAdulto(conexion, usuario, episodioId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    unidad_pop_id: v.id('unidad_pop_id'),
    horas_ventilacion_mecanica: v.entero('horas_ventilacion_mecanica', { min: 0 }),
    // Los días de UCI y de hospitalización ya no se escriben: se calculan de estas fechas y la de
    // cirugía (sqlDiasUci / sqlDiasHospitalizacion en servicios.mjs).
    fecha_traslado_intermedio: v.fecha('fecha_traslado_intermedio'),
    fecha_salida: v.fecha('fecha_salida'),
    condicion_salida_id: v.id('condicion_salida_id'),
    condicion_salida_otro: v.texto('condicion_salida_otro'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const complicacionPopIds = [...new Set(v.ids('complicacion_pop_ids'))]
  const complicacionPopEspecificaciones = v.especificaciones('complicacion_pop_especificaciones')
  v.finalizar()

  datos.condicion_salida_otro = await especificacionDe(conexion, datos.condicion_salida_id, datos.condicion_salida_otro)
  const cirugia = await una(conexion, 'SELECT fecha_cirugia FROM cirugias_adultos WHERE episodio_id = ?', [episodioId])
  if (cirugia?.fecha_cirugia) {
    if (datos.fecha_traslado_intermedio && datos.fecha_traslado_intermedio < cirugia.fecha_cirugia) {
      throw reglaNegocio('La fecha de traslado a intermedio no puede ser anterior a la fecha de cirugía.')
    }
    if (datos.fecha_salida && datos.fecha_salida < cirugia.fecha_cirugia) {
      throw reglaNegocio('La fecha de salida no puede ser anterior a la fecha de cirugía.')
    }
  }
  if (datos.fecha_traslado_intermedio && datos.fecha_salida && datos.fecha_salida < datos.fecha_traslado_intermedio) {
    throw reglaNegocio('La fecha de salida no puede ser anterior a la fecha de traslado a intermedio.')
  }

  const existente = await una(conexion, 'SELECT id FROM postoperatorio_adultos WHERE episodio_id = ?', [episodioId])
  let id
  if (existente) {
    id = existente.id
    await actualizar(conexion, usuario, 'postoperatorio_adultos', id, datos)
  } else {
    id = await insertar(conexion, usuario, 'postoperatorio_adultos', { episodio_id: episodioId, ...datos, actualizado_por: usuario.id })
  }

  await sincronizarSeleccion(conexion, usuario, {
    tabla: 'postoperatorio_adultos_complicaciones_pop', columnaDueno: 'postoperatorio_id', duenoId: id, columnaOpcion: 'complicacion_id',
    ids: complicacionPopIds, especificaciones: complicacionPopEspecificaciones,
  })

  await sincronizarSeguimientoAdulto(conexion, usuario, episodioId, datos.condicion_salida_id)
  return id
}

// ---------------------------------------------------------------------------------------------
// Módulo 5 · Seguimiento post-egreso
// ---------------------------------------------------------------------------------------------

export async function obtenerSeguimientoAdulto(conexion, episodioId) {
  return filaApi('seguimientos_adultos', await una(conexion, 'SELECT * FROM seguimientos_adultos WHERE episodio_id = ?', [episodioId]))
}

export async function guardarSeguimientoAdulto(conexion, usuario, episodioId, cuerpo) {
  const existente = await una(conexion, 'SELECT * FROM seguimientos_adultos WHERE episodio_id = ?', [episodioId])
  if (!existente) {
    throw new ErrorApi(409, 'POSTOPERATORIO_REQUERIDO', 'Guarde primero el Módulo 4 (Postoperatorio, UCI y egreso) para habilitar el seguimiento.')
  }
  if (existente.no_aplica) throw reglaNegocio('El Módulo 5 no aplica (condición de salida: Muerte) y no puede editarse.')

  const v = new Validador(cuerpo)
  const datos = {
    fecha_control_cirugia: v.fecha('fecha_control_cirugia'),
    rehabilitacion_cardiaca: v.opcion('rehabilitacion_cardiaca', ['SI', 'NO', 'NA']),
    estado_herida_id: v.id('estado_herida_id'),
    estado_herida_otro: v.texto('estado_herida_otro'),
    llamado_15_dias: v.opcion('llamado_15_dias', ['SI', 'NO']),
    fecha_llamada_15_dias: v.fecha('fecha_llamada_15_dias'),
    persona_recibe_llamada: v.texto('persona_recibe_llamada'),
    reingreso_30_dias: v.opcion('reingreso_30_dias', ['SI', 'NO']),
    fecha_reingreso: v.fecha('fecha_reingreso'),
    causa_reingreso_id: v.id('causa_reingreso_id'),
    causa_reingreso_otro: v.texto('causa_reingreso_otro'),
    observaciones: v.texto('observaciones', { max: 5000 }),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  v.finalizar()

  await normalizarReingresoYHerida(conexion, datos)
  const salida = await una(conexion, 'SELECT fecha_salida FROM postoperatorio_adultos WHERE episodio_id = ?', [episodioId])
  // Regla silenciosa: si la llamada no se hizo, no hay fecha ni persona que la recibiera. Si se hizo,
  // su fecha es la del día en que se llamó: no puede ser futura ni anterior al egreso.
  if (datos.llamado_15_dias !== 'SI') {
    datos.fecha_llamada_15_dias = null
    datos.persona_recibe_llamada = null
  } else if (datos.fecha_llamada_15_dias) {
    if (datos.fecha_llamada_15_dias > hoyBogota()) throw reglaNegocio('La fecha de la llamada no puede ser futura: registre el día en que se hizo.')
    if (salida?.fecha_salida && datos.fecha_llamada_15_dias < salida.fecha_salida) {
      throw reglaNegocio('La fecha de la llamada no puede ser anterior a la fecha de salida.')
    }
  }
  if (datos.reingreso_30_dias === 'SI' && salida?.fecha_salida) {
    const dias = diasEntre(salida.fecha_salida, datos.fecha_reingreso)
    if (dias < 0 || dias > 30) throw reglaNegocio('La fecha de reingreso debe estar dentro de los 30 días posteriores a la fecha de salida.')
  }
  await actualizar(conexion, usuario, 'seguimientos_adultos', existente.id, datos)
  return existente.id
}
