// Reglas de negocio y persistencia de los 5 módulos. Aquí viven las reglas que antes hacían triggers y RLS:
// autocorrecciones silenciosas, rechazos 422, sincronización Módulo 4 -> Módulo 5 y auditoría transaccional.
import { aBooleanos, hoyBogota, isoUtc, nuevoId, todas, una } from './db.mjs'
import { ErrorApi, noEncontrado, reglaNegocio } from './errores.mjs'
import { Validador, diasEntre } from './validar.mjs'

const BOOLEANOS = {
  pacientes: ['sin_telefono', 'eliminado'],
  seguimientos: ['no_aplica'],
}

/** Convierte una fila de BD a su forma JSON de API/auditoría (booleanos reales, fechas ISO UTC). */
export function filaApi(tabla, fila) {
  if (!fila) return fila
  const salida = aBooleanos(fila, BOOLEANOS[tabla] ?? [])
  for (const clave of Object.keys(salida)) if (clave.endsWith('_en')) salida[clave] = isoUtc(salida[clave])
  return salida
}

const canonico = (v) => {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export async function auditar(conexion, { tabla, registroId, operacion, usuarioId, antes = null, despues = null }) {
  await conexion.query(
    'INSERT INTO auditoria (tabla, registro_id, operacion, usuario_id, valores_anteriores, valores_nuevos) VALUES (?, ?, ?, ?, ?, ?)',
    [tabla, registroId, operacion, usuarioId, antes ? JSON.stringify(filaApi(tabla, antes)) : null, despues ? JSON.stringify(filaApi(tabla, despues)) : null],
  )
}

const valorSql = (v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)

export async function insertar(conexion, usuario, tabla, datos, { conAuditoriaUsuario = true } = {}) {
  const id = datos.id ?? nuevoId()
  const fila = { id, ...datos }
  if (conAuditoriaUsuario) fila.creado_por = usuario.id
  const columnas = Object.keys(fila)
  await conexion.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    columnas.map((c) => valorSql(fila[c])),
  )
  const despues = await una(conexion, `SELECT * FROM ${tabla} WHERE id = ?`, [id])
  await auditar(conexion, { tabla, registroId: id, operacion: 'INSERT', usuarioId: usuario.id, despues })
  return id
}

/** UPDATE con auditoría; si ningún valor cambia no toca la fila ni audita. Devuelve true si hubo cambios. */
export async function actualizar(conexion, usuario, tabla, id, cambios, { conAuditoriaUsuario = true } = {}) {
  const antes = await una(conexion, `SELECT * FROM ${tabla} WHERE id = ?`, [id])
  const modificados = Object.keys(cambios).filter((c) => canonico(antes[c]) !== canonico(cambios[c]))
  if (modificados.length === 0) return false
  const asignaciones = modificados.map((c) => `${c} = ?`)
  const valores = modificados.map((c) => valorSql(cambios[c]))
  if (conAuditoriaUsuario) {
    asignaciones.push('actualizado_por = ?')
    valores.push(usuario.id)
  }
  await conexion.query(`UPDATE ${tabla} SET ${asignaciones.join(', ')} WHERE id = ?`, [...valores, id])
  const despues = await una(conexion, `SELECT * FROM ${tabla} WHERE id = ?`, [id])
  await auditar(conexion, { tabla, registroId: id, operacion: 'UPDATE', usuarioId: usuario.id, antes, despues })
  return true
}

async function eliminarFila(conexion, usuario, tabla, id) {
  const antes = await una(conexion, `SELECT * FROM ${tabla} WHERE id = ?`, [id])
  await conexion.query(`DELETE FROM ${tabla} WHERE id = ?`, [id])
  await auditar(conexion, { tabla, registroId: id, operacion: 'DELETE', usuarioId: usuario.id, antes })
}

// ---------------------------------------------------------------------------------------------
// Listas: consultas por código estable (nunca por el texto visible, que el Administrador edita)
// ---------------------------------------------------------------------------------------------

export async function codigoDe(conexion, opcionId) {
  if (!opcionId) return null
  const fila = await una(conexion, 'SELECT codigo FROM opciones_lista WHERE id = ?', [opcionId])
  return fila?.codigo ?? null
}

export async function idPorCodigo(conexion, categoria, codigo) {
  const fila = await una(
    conexion,
    `SELECT o.id FROM opciones_lista o JOIN categorias_lista c ON c.id = o.categoria_id WHERE c.codigo = ? AND o.codigo = ?`,
    [categoria, codigo],
  )
  return fila?.id ?? null
}

const ESTADOS = ['pendiente', 'completo']

// ---------------------------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------------------------

export async function obtenerPaciente(conexion, id, usuario) {
  const fila = await una(conexion, 'SELECT * FROM pacientes WHERE id = ?', [id])
  if (!fila || (fila.eliminado && usuario.rol !== 'administrador')) throw noEncontrado('No se encontró el paciente.')
  return fila
}

function leerPaciente(cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    nombre_completo: v.texto('nombre_completo', { obligatorio: true }),
    identificacion: v.texto('identificacion', { obligatorio: true, max: 50 }),
    sexo_id: v.id('sexo_id'),
    fecha_nacimiento: v.fecha('fecha_nacimiento', { obligatoria: true }),
    peso_kg: v.decimal('peso_kg', { min: 0.5, max: 150 }),
    talla_cm: v.entero('talla_cm', { min: 30, max: 220 }),
    procedencia_id: v.id('procedencia_id'),
    municipio_narino_id: v.id('municipio_narino_id'),
    telefonos: v.textos('telefonos'),
    sin_telefono: v.booleano('sin_telefono'),
    eps_id: v.id('eps_id'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  if (datos.identificacion && !/^\d+$/.test(datos.identificacion)) v.error('identificacion', 'Solo se permiten números.')
  if (datos.fecha_nacimiento && datos.fecha_nacimiento > hoyBogota()) v.error('fecha_nacimiento', 'No puede ser futura.')
  if (datos.sin_telefono && datos.telefonos.length > 0) v.error('telefonos', 'No puede tener teléfonos si marca "No tiene".')
  v.finalizar()
  return datos
}

async function normalizarPaciente(conexion, datos) {
  // Regla silenciosa: el municipio solo aplica cuando la procedencia es Nariño.
  if ((await codigoDe(conexion, datos.procedencia_id)) !== 'NARINO') datos.municipio_narino_id = null
  return datos
}

export async function crearPaciente(conexion, usuario, cuerpo, extras = {}) {
  const datos = await normalizarPaciente(conexion, leerPaciente(cuerpo))
  return insertar(conexion, usuario, 'pacientes', { ...datos, ...extras, actualizado_por: usuario.id })
}

export async function actualizarPaciente(conexion, usuario, id, cuerpo) {
  await obtenerPaciente(conexion, id, usuario)
  const datos = await normalizarPaciente(conexion, leerPaciente(cuerpo))
  await actualizar(conexion, usuario, 'pacientes', id, datos)
  return id
}

export async function marcarEliminado(conexion, usuario, id, eliminado) {
  const paciente = await una(conexion, 'SELECT * FROM pacientes WHERE id = ?', [id])
  if (!paciente) throw noEncontrado('No se encontró el paciente.')
  await actualizar(conexion, usuario, 'pacientes', id, {
    eliminado,
    eliminado_en: eliminado ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    eliminado_por: eliminado ? usuario.id : null,
  })
  return id
}

// ---------------------------------------------------------------------------------------------
// Módulo 2 · Diagnóstico y riesgos
// ---------------------------------------------------------------------------------------------

export async function obtenerDiagnostico(conexion, pacienteId) {
  const fila = await una(conexion, 'SELECT * FROM diagnosticos WHERE paciente_id = ?', [pacienteId])
  if (!fila) return null
  const riesgos = await todas(conexion, 'SELECT riesgo_id FROM diagnosticos_riesgos WHERE diagnostico_id = ? ORDER BY id', [fila.id])
  return { ...filaApi('diagnosticos', fila), riesgo_ids: riesgos.map((r) => r.riesgo_id) }
}

export async function guardarDiagnostico(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    diagnostico_id: v.id('diagnostico_id'),
    valvulopatia_id: v.id('valvulopatia_id'),
    rachs_id: v.id('rachs_id'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  const riesgoIds = [...new Set(v.ids('riesgo_ids'))]
  v.finalizar()

  // Regla silenciosa: la valvulopatía solo aplica si el diagnóstico es Valvulopatías; si no, queda en N/A.
  if ((await codigoDe(conexion, datos.diagnostico_id)) !== 'VALVULOPATIAS') {
    datos.valvulopatia_id = await idPorCodigo(conexion, 'VALVULOPATIA', 'NA')
  }
  // Regla dura: "Ninguno" excluye cualquier otro factor de riesgo.
  const ningunoId = await idPorCodigo(conexion, 'RIESGOS', 'NINGUNO')
  if (ningunoId && riesgoIds.includes(ningunoId) && riesgoIds.length > 1) {
    throw reglaNegocio('No se puede seleccionar "Ninguno" junto con otros factores de riesgo.')
  }

  const existente = await una(conexion, 'SELECT id FROM diagnosticos WHERE paciente_id = ?', [pacienteId])
  let diagnosticoId
  if (existente) {
    diagnosticoId = existente.id
    await actualizar(conexion, usuario, 'diagnosticos', diagnosticoId, datos)
  } else {
    diagnosticoId = await insertar(conexion, usuario, 'diagnosticos', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }

  // Reemplazo de la selección dentro de la misma transacción: se quita lo que sobra y se agrega lo nuevo.
  const actuales = await todas(conexion, 'SELECT id, riesgo_id FROM diagnosticos_riesgos WHERE diagnostico_id = ?', [diagnosticoId])
  for (const fila of actuales) {
    if (!riesgoIds.includes(fila.riesgo_id)) await eliminarFila(conexion, usuario, 'diagnosticos_riesgos', fila.id)
  }
  const presentes = new Set(actuales.map((f) => f.riesgo_id))
  for (const riesgoId of riesgoIds) {
    if (!presentes.has(riesgoId)) {
      await insertar(conexion, usuario, 'diagnosticos_riesgos', { diagnostico_id: diagnosticoId, riesgo_id: riesgoId }, { conAuditoriaUsuario: false })
    }
  }
  return diagnosticoId
}

// ---------------------------------------------------------------------------------------------
// Módulo 3 · Cirugía y procedimientos
// ---------------------------------------------------------------------------------------------

export async function obtenerCirugia(conexion, pacienteId) {
  const fila = await una(conexion, 'SELECT * FROM cirugias WHERE paciente_id = ?', [pacienteId])
  if (!fila) return null
  const procedimientos = await todas(conexion, 'SELECT procedimiento_id FROM cirugias_procedimientos WHERE cirugia_id = ? ORDER BY orden', [fila.id])
  return { ...filaApi('cirugias', fila), procedimiento_ids: procedimientos.map((p) => p.procedimiento_id) }
}

export async function guardarCirugia(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    fecha_cirugia: v.fecha('fecha_cirugia'),
    implante_id: v.id('implante_id'),
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
  if (datos.tiempo_clamp_min !== null && (datos.tiempo_cec_min === null || datos.tiempo_clamp_min > datos.tiempo_cec_min)) {
    throw reglaNegocio('El tiempo de clamp de aorta no puede ser mayor que el tiempo de CEC.')
  }
  const paciente = await una(conexion, 'SELECT fecha_nacimiento FROM pacientes WHERE id = ?', [pacienteId])
  if (datos.fecha_cirugia && datos.fecha_cirugia < paciente.fecha_nacimiento) {
    throw reglaNegocio('La fecha de cirugía no puede ser anterior a la fecha de nacimiento del paciente.')
  }

  const existente = await una(conexion, 'SELECT id FROM cirugias WHERE paciente_id = ?', [pacienteId])
  let cirugiaId
  if (existente) {
    cirugiaId = existente.id
    await actualizar(conexion, usuario, 'cirugias', cirugiaId, datos)
  } else {
    cirugiaId = await insertar(conexion, usuario, 'cirugias', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }

  // El orden del arreglo es el orden 1..3. Primero se quita lo que cambió y luego se inserta (índices únicos).
  const actuales = await todas(conexion, 'SELECT id, procedimiento_id, orden FROM cirugias_procedimientos WHERE cirugia_id = ?', [cirugiaId])
  const claveNueva = new Set(procedimientoIds.map((p, i) => `${p}:${i + 1}`))
  for (const fila of actuales) {
    if (!claveNueva.has(`${fila.procedimiento_id}:${fila.orden}`)) await eliminarFila(conexion, usuario, 'cirugias_procedimientos', fila.id)
  }
  const claveActual = new Set(actuales.map((f) => `${f.procedimiento_id}:${f.orden}`))
  for (const [i, procedimientoId] of procedimientoIds.entries()) {
    if (!claveActual.has(`${procedimientoId}:${i + 1}`)) {
      await insertar(conexion, usuario, 'cirugias_procedimientos', { cirugia_id: cirugiaId, procedimiento_id: procedimientoId, orden: i + 1 }, { conAuditoriaUsuario: false })
    }
  }
  return cirugiaId
}

// ---------------------------------------------------------------------------------------------
// Módulo 4 · Postoperatorio (y sincronización con el Módulo 5)
// ---------------------------------------------------------------------------------------------

export async function obtenerPostoperatorio(conexion, pacienteId) {
  return filaApi('postoperatorio', await una(conexion, 'SELECT * FROM postoperatorio WHERE paciente_id = ?', [pacienteId]))
}

/** Condición de salida = Muerte => Módulo 5 "no aplica"; si se corrige, vuelve a pendiente. */
async function sincronizarSeguimiento(conexion, usuario, pacienteId, condicionSalidaId) {
  const esMuerte = (await codigoDe(conexion, condicionSalidaId)) === 'MUERTE'
  const estado = esMuerte ? 'no_aplica' : 'pendiente'
  const existente = await una(conexion, 'SELECT id, no_aplica FROM seguimientos WHERE paciente_id = ?', [pacienteId])
  if (!existente) {
    await insertar(conexion, usuario, 'seguimientos', { paciente_id: pacienteId, no_aplica: esMuerte, estado_modulo: estado, actualizado_por: usuario.id })
  } else if (Boolean(existente.no_aplica) !== esMuerte) {
    await actualizar(conexion, usuario, 'seguimientos', existente.id, { no_aplica: esMuerte, estado_modulo: estado })
  }
}

export async function guardarPostoperatorio(conexion, usuario, pacienteId, cuerpo) {
  const v = new Validador(cuerpo)
  const datos = {
    unidad_pop_id: v.id('unidad_pop_id'),
    horas_ventilacion_mecanica: v.entero('horas_ventilacion_mecanica', { min: 0 }),
    complicacion_pop_id: v.id('complicacion_pop_id'),
    fecha_traslado_intermedio: v.fecha('fecha_traslado_intermedio'),
    fecha_salida: v.fecha('fecha_salida'),
    condicion_salida_id: v.id('condicion_salida_id'),
    estado_modulo: v.opcion('estado_modulo', ESTADOS) ?? 'pendiente',
  }
  v.finalizar()

  const cirugia = await una(conexion, 'SELECT fecha_cirugia FROM cirugias WHERE paciente_id = ?', [pacienteId])
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

  const existente = await una(conexion, 'SELECT id FROM postoperatorio WHERE paciente_id = ?', [pacienteId])
  let id
  if (existente) {
    id = existente.id
    await actualizar(conexion, usuario, 'postoperatorio', id, datos)
  } else {
    id = await insertar(conexion, usuario, 'postoperatorio', { paciente_id: pacienteId, ...datos, actualizado_por: usuario.id })
  }
  await sincronizarSeguimiento(conexion, usuario, pacienteId, datos.condicion_salida_id)
  return id
}

// ---------------------------------------------------------------------------------------------
// Módulo 5 · Seguimiento post-egreso
// ---------------------------------------------------------------------------------------------

export async function obtenerSeguimiento(conexion, pacienteId) {
  return filaApi('seguimientos', await una(conexion, 'SELECT * FROM seguimientos WHERE paciente_id = ?', [pacienteId]))
}

export async function guardarSeguimiento(conexion, usuario, pacienteId, cuerpo) {
  const existente = await una(conexion, 'SELECT * FROM seguimientos WHERE paciente_id = ?', [pacienteId])
  if (!existente) {
    throw new ErrorApi(409, 'POSTOPERATORIO_REQUERIDO', 'Guarde primero el Módulo 4 (Postoperatorio, UCI y egreso) para habilitar el seguimiento.')
  }
  if (existente.no_aplica) throw reglaNegocio('El Módulo 5 no aplica (condición de salida: Muerte) y no puede editarse.')

  const v = new Validador(cuerpo)
  const datos = {
    fecha_control_cirugia: v.fecha('fecha_control_cirugia'),
    rehabilitacion_cardiaca: v.opcion('rehabilitacion_cardiaca', ['SI', 'NO', 'NA']),
    estado_herida_id: v.id('estado_herida_id'),
    fecha_llamada_15_dias: v.fecha('fecha_llamada_15_dias'),
    persona_recibe_llamada: v.texto('persona_recibe_llamada'),
    reingreso_30_dias: v.opcion('reingreso_30_dias', ['SI', 'NO', 'NA']),
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
    const salida = await una(conexion, 'SELECT fecha_salida FROM postoperatorio WHERE paciente_id = ?', [pacienteId])
    if (salida?.fecha_salida) {
      const dias = diasEntre(salida.fecha_salida, datos.fecha_reingreso)
      if (dias < 0 || dias > 30) throw reglaNegocio('La fecha de reingreso debe estar dentro de los 30 días posteriores a la fecha de salida.')
    }
  }
  await actualizar(conexion, usuario, 'seguimientos', existente.id, datos)
  return existente.id
}
