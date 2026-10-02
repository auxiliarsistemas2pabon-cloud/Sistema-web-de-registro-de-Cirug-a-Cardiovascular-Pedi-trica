// Reglas de negocio y persistencia de los 5 módulos del módulo de adultos. Mismo patrón que
// servicios.mjs (autocorrecciones silenciosas, rechazos 422, auditoría transaccional), separado en
// su propio archivo porque las tablas, listas y algunas reglas (edad mínima, sin RACHS-1, EuroSCORE)
// son distintas de las del módulo pediátrico.
import { hoyBogota, todas, una } from './db.mjs'
import { ErrorApi, noEncontrado, reglaNegocio } from './errores.mjs'
import { Validador, diasEntre } from './validar.mjs'
import { actualizar, codigoDe, eliminarFila, filaApi, idPorCodigo, insertar, valorDe } from './servicios.mjs'

const ESTADOS = ['pendiente', 'completo']

/** Fecha (aaaa-mm-dd) de hace exactamente `anios` años, para validar la edad mínima del módulo de adultos. */
function haceAnios(anios) {
  const [a, m, d] = hoyBogota().split('-')
  return `${String(Number(a) - anios).padStart(4, '0')}-${m}-${d}`
}

// ---------------------------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------------------------

export async function obtenerPacienteAdulto(conexion, id, usuario) {
  const fila = await una(conexion, 'SELECT * FROM pacientes_adultos WHERE id = ?', [id])
  if (!fila || (fila.eliminado && usuario.rol !== 'administrador')) throw noEncontrado('No se encontró el paciente.')
  return fila
}

function leerPacienteAdulto(cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    nombre_completo: v.texto('nombre_completo', { obligatorio: true }),
    identificacion: v.texto('identificacion', { obligatorio: true, max: 50 }),
    sexo_id: v.id('sexo_id'),
    fecha_nacimiento: v.fecha('fecha_nacimiento', { obligatoria: true }),
    peso_kg: v.decimal('peso_kg', { min: 30, max: 300 }),
    talla_cm: v.entero('talla_cm', { min: 120, max: 230 }),
    procedencia_id: v.id('procedencia_id'),
    municipio_narino_id: v.id('municipio_narino_id'),
    telefono: v.texto('telefono', { max: 50 }),
    eps_id: v.id('eps_id'),
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

async function normalizarPacienteAdulto(conexion, datos) {
  // Misma regla silenciosa que el módulo pediátrico: el municipio solo aplica si la procedencia es Nariño.
  if ((await codigoDe(conexion, datos.procedencia_id)) !== 'NARINO') datos.municipio_narino_id = null
  return datos
}

export async function crearPacienteAdulto(conexion, usuario, cuerpo, extras = {}) {
  const datos = await normalizarPacienteAdulto(conexion, leerPacienteAdulto(cuerpo))
  return insertar(conexion, usuario, 'pacientes_adultos', { ...datos, ...extras, actualizado_por: usuario.id })
}

export async function actualizarPacienteAdulto(conexion, usuario, id, cuerpo) {
  await obtenerPacienteAdulto(conexion, id, usuario)
  const datos = await normalizarPacienteAdulto(conexion, leerPacienteAdulto(cuerpo))
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

export async function obtenerDiagnosticoAdulto(conexion, pacienteId) {
  const fila = await una(conexion, 'SELECT * FROM diagnosticos_adultos WHERE paciente_id = ?', [pacienteId])
  if (!fila) return null
  const riesgos = await todas(conexion, 'SELECT riesgo_id FROM diagnosticos_adultos_riesgos WHERE diagnostico_id = ? ORDER BY id', [fila.id])
  return { ...filaApi('diagnosticos_adultos', fila), riesgo_ids: riesgos.map((r) => r.riesgo_id) }
}

export async function guardarDiagnosticoAdulto(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    diagnostico_id: v.id('diagnostico_id'),
    valvulopatia_id: v.id('valvulopatia_id'),
    euroscore: v.decimal('euroscore', { min: 0, max: 100 }),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const riesgoIds = [...new Set(v.ids('riesgo_ids'))]
  v.finalizar()

  // Regla silenciosa: la valvulopatía solo aplica si el diagnóstico la menciona; si no, queda en N/A.
  if (!(await diagnosticoMencionaValvulopatia(conexion, datos.diagnostico_id))) {
    datos.valvulopatia_id = await idPorCodigo(conexion, 'VALVULOPATIA', 'NA')
  }
  // Regla dura: "Ninguno" excluye cualquier otro factor de riesgo.
  const ningunoId = await idPorCodigo(conexion, 'RIESGOS_ADULTO', 'NINGUNO')
  if (ningunoId && riesgoIds.includes(ningunoId) && riesgoIds.length > 1) {
    throw reglaNegocio('No se puede seleccionar "Ninguno" junto con otros factores de riesgo.')
  }

  const existente = await una(conexion, 'SELECT id FROM diagnosticos_adultos WHERE paciente_id = ?', [pacienteId])
  let diagnosticoId
  if (existente) {
    diagnosticoId = existente.id
    await actualizar(conexion, usuario, 'diagnosticos_adultos', diagnosticoId, datos)
  } else {
    diagnosticoId = await insertar(conexion, usuario, 'diagnosticos_adultos', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }

  const actuales = await todas(conexion, 'SELECT id, riesgo_id FROM diagnosticos_adultos_riesgos WHERE diagnostico_id = ?', [diagnosticoId])
  for (const fila of actuales) {
    if (!riesgoIds.includes(fila.riesgo_id)) await eliminarFila(conexion, usuario, 'diagnosticos_adultos_riesgos', fila.id)
  }
  const presentes = new Set(actuales.map((f) => f.riesgo_id))
  for (const riesgoId of riesgoIds) {
    if (!presentes.has(riesgoId)) {
      await insertar(conexion, usuario, 'diagnosticos_adultos_riesgos', { diagnostico_id: diagnosticoId, riesgo_id: riesgoId }, { conAuditoriaUsuario: false })
    }
  }
  return diagnosticoId
}

// ---------------------------------------------------------------------------------------------
// Módulo 3 · Cirugía y procedimientos
// ---------------------------------------------------------------------------------------------

export async function obtenerCirugiaAdulto(conexion, pacienteId) {
  const fila = await una(conexion, 'SELECT * FROM cirugias_adultos WHERE paciente_id = ?', [pacienteId])
  if (!fila) return null
  const procedimientos = await todas(conexion, 'SELECT procedimiento_id FROM cirugias_adultos_procedimientos WHERE cirugia_id = ? ORDER BY orden', [fila.id])
  return { ...filaApi('cirugias_adultos', fila), procedimiento_ids: procedimientos.map((p) => p.procedimiento_id) }
}

export async function guardarCirugiaAdulto(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    fecha_cirugia: v.fecha('fecha_cirugia'),
    implante_id: v.id('implante_id'),
    numero_implante: v.texto('numero_implante', { max: 100 }),
    uso_cec: v.opcion('uso_cec', ['SI', 'NO']),
    tiempo_cec_min: v.entero('tiempo_cec_min', { min: 0 }),
    tiempo_clamp_min: v.entero('tiempo_clamp_min', { min: 0 }),
    complicacion_intraqx_id: v.id('complicacion_intraqx_id'),
    cierre_esternal_diferido: v.opcion('cierre_esternal_diferido', ['SI', 'NO']),
    extubacion_quirofano: v.opcion('extubacion_quirofano', ['SI', 'NO']),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const procedimientoIds = v.ids('procedimiento_ids')
  if (procedimientoIds.length > 3) v.error('procedimiento_ids', 'Solo se permiten hasta tres procedimientos.')
  v.finalizar()

  if (new Set(procedimientoIds).size !== procedimientoIds.length) throw reglaNegocio('Los procedimientos 1, 2 y 3 no pueden repetirse.')
  // Regla silenciosa: sin CEC no hay tiempos de CEC ni de clamp.
  if (datos.uso_cec !== 'SI') {
    datos.tiempo_cec_min = null
    datos.tiempo_clamp_min = null
  }
  // Regla silenciosa: el número de implante solo aplica si se eligió un tipo de implante real.
  if (!datos.implante_id || (await valorDe(conexion, datos.implante_id)) === 'N/A') {
    datos.numero_implante = null
  }
  if (datos.tiempo_clamp_min !== null && (datos.tiempo_cec_min === null || datos.tiempo_clamp_min > datos.tiempo_cec_min)) {
    throw reglaNegocio('El tiempo de clamp de aorta no puede ser mayor que el tiempo de CEC.')
  }
  const paciente = await una(conexion, 'SELECT fecha_nacimiento FROM pacientes_adultos WHERE id = ?', [pacienteId])
  if (datos.fecha_cirugia && datos.fecha_cirugia < paciente.fecha_nacimiento) {
    throw reglaNegocio('La fecha de cirugía no puede ser anterior a la fecha de nacimiento del paciente.')
  }

  const existente = await una(conexion, 'SELECT id FROM cirugias_adultos WHERE paciente_id = ?', [pacienteId])
  let cirugiaId
  if (existente) {
    cirugiaId = existente.id
    await actualizar(conexion, usuario, 'cirugias_adultos', cirugiaId, datos)
  } else {
    cirugiaId = await insertar(conexion, usuario, 'cirugias_adultos', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }

  const actuales = await todas(conexion, 'SELECT id, procedimiento_id, orden FROM cirugias_adultos_procedimientos WHERE cirugia_id = ?', [cirugiaId])
  const claveNueva = new Set(procedimientoIds.map((p, i) => `${p}:${i + 1}`))
  for (const fila of actuales) {
    if (!claveNueva.has(`${fila.procedimiento_id}:${fila.orden}`)) await eliminarFila(conexion, usuario, 'cirugias_adultos_procedimientos', fila.id)
  }
  const claveActual = new Set(actuales.map((f) => `${f.procedimiento_id}:${f.orden}`))
  for (const [i, procedimientoId] of procedimientoIds.entries()) {
    if (!claveActual.has(`${procedimientoId}:${i + 1}`)) {
      await insertar(conexion, usuario, 'cirugias_adultos_procedimientos', { cirugia_id: cirugiaId, procedimiento_id: procedimientoId, orden: i + 1 }, { conAuditoriaUsuario: false })
    }
  }
  return cirugiaId
}

// ---------------------------------------------------------------------------------------------
// Módulo 4 · Postoperatorio (y sincronización con el Módulo 5)
// ---------------------------------------------------------------------------------------------

export async function obtenerPostoperatorioAdulto(conexion, pacienteId) {
  return filaApi('postoperatorio_adultos', await una(conexion, 'SELECT * FROM postoperatorio_adultos WHERE paciente_id = ?', [pacienteId]))
}

/** Condición de salida = Muerte => Módulo 5 "no aplica"; si se corrige, vuelve a pendiente. */
async function sincronizarSeguimientoAdulto(conexion, usuario, pacienteId, condicionSalidaId) {
  const esMuerte = (await codigoDe(conexion, condicionSalidaId)) === 'MUERTE'
  const estado = esMuerte ? 'no_aplica' : 'pendiente'
  const existente = await una(conexion, 'SELECT id, no_aplica FROM seguimientos_adultos WHERE paciente_id = ?', [pacienteId])
  if (!existente) {
    await insertar(conexion, usuario, 'seguimientos_adultos', { paciente_id: pacienteId, no_aplica: esMuerte, estado_modulo: estado, actualizado_por: usuario.id })
  } else if (Boolean(existente.no_aplica) !== esMuerte) {
    await actualizar(conexion, usuario, 'seguimientos_adultos', existente.id, { no_aplica: esMuerte, estado_modulo: estado })
  }
}

export async function guardarPostoperatorioAdulto(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    unidad_pop_id: v.id('unidad_pop_id'),
    horas_ventilacion_mecanica: v.entero('horas_ventilacion_mecanica', { min: 0 }),
    complicacion_pop_id: v.id('complicacion_pop_id'),
    fecha_traslado_intermedio: v.fecha('fecha_traslado_intermedio'),
    dias_estancia_uci: v.entero('dias_estancia_uci', { min: 0 }),
    fecha_salida: v.fecha('fecha_salida'),
    dias_hospitalizacion_total: v.entero('dias_hospitalizacion_total', { min: 0 }),
    condicion_salida_id: v.id('condicion_salida_id'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  v.finalizar()

  const cirugia = await una(conexion, 'SELECT fecha_cirugia FROM cirugias_adultos WHERE paciente_id = ?', [pacienteId])
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

  const existente = await una(conexion, 'SELECT id FROM postoperatorio_adultos WHERE paciente_id = ?', [pacienteId])
  let id
  if (existente) {
    id = existente.id
    await actualizar(conexion, usuario, 'postoperatorio_adultos', id, datos)
  } else {
    id = await insertar(conexion, usuario, 'postoperatorio_adultos', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }
  await sincronizarSeguimientoAdulto(conexion, usuario, pacienteId, datos.condicion_salida_id)
  return id
}

// ---------------------------------------------------------------------------------------------
// Módulo 5 · Seguimiento post-egreso
// ---------------------------------------------------------------------------------------------

export async function obtenerSeguimientoAdulto(conexion, pacienteId) {
  return filaApi('seguimientos_adultos', await una(conexion, 'SELECT * FROM seguimientos_adultos WHERE paciente_id = ?', [pacienteId]))
}

export async function guardarSeguimientoAdulto(conexion, usuario, pacienteId, cuerpo) {
  const existente = await una(conexion, 'SELECT * FROM seguimientos_adultos WHERE paciente_id = ?', [pacienteId])
  if (!existente) {
    throw new ErrorApi(409, 'POSTOPERATORIO_REQUERIDO', 'Guarde primero el Módulo 4 (Postoperatorio, UCI y egreso) para habilitar el seguimiento.')
  }
  if (existente.no_aplica) throw reglaNegocio('El Módulo 5 no aplica (condición de salida: Muerte) y no puede editarse.')

  const v = new Validador(cuerpo)
  const datos = {
    fecha_control_cirugia: v.fecha('fecha_control_cirugia'),
    rehabilitacion_cardiaca: v.opcion('rehabilitacion_cardiaca', ['SI', 'NO', 'NA']),
    estado_herida_id: v.id('estado_herida_id'),
    llamado_15_dias: v.opcion('llamado_15_dias', ['SI', 'NO']),
    persona_recibe_llamada: v.texto('persona_recibe_llamada'),
    reingreso_30_dias: v.opcion('reingreso_30_dias', ['SI', 'NO']),
    fecha_reingreso: v.fecha('fecha_reingreso'),
    causa_reingreso_id: v.id('causa_reingreso_id'),
    observaciones: v.texto('observaciones', { max: 5000 }),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  v.finalizar()

  if (datos.reingreso_30_dias !== 'SI') {
    datos.fecha_reingreso = null
    datos.causa_reingreso_id = null
  } else {
    if (!datos.fecha_reingreso || !datos.causa_reingreso_id) {
      throw reglaNegocio('Si hubo reingreso, la fecha y la causa de reingreso son obligatorias.')
    }
    const salida = await una(conexion, 'SELECT fecha_salida FROM postoperatorio_adultos WHERE paciente_id = ?', [pacienteId])
    if (salida?.fecha_salida) {
      const dias = diasEntre(salida.fecha_salida, datos.fecha_reingreso)
      if (dias < 0 || dias > 30) throw reglaNegocio('La fecha de reingreso debe estar dentro de los 30 días posteriores a la fecha de salida.')
    }
  }
  await actualizar(conexion, usuario, 'seguimientos_adultos', existente.id, datos)
  return existente.id
}
