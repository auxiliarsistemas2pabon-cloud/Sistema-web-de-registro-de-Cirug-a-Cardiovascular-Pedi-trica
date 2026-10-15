// Carga puntual de los 71 pacientes adultos de base_de_datos_Adultos_2_DILIGENCIADA (1).xlsx
// hacia pacientes_adultos. Reutiliza las funciones reales de server/servicios-adultos.mjs para que
// se apliquen las mismas reglas de negocio (edad >= 18, valvulopatía por texto, CEC, etc.) y quede
// auditado igual que si se hubiera digitado desde la app. Por defecto corre en modo de solo-revisión
// (DRY RUN): no escribe nada. Pasar --aplicar para escribir de verdad.
import { readFileSync } from 'fs'
import mysql from 'mysql2/promise'
import {
  crearPacienteAdulto, guardarDiagnosticoAdulto, guardarCirugiaAdulto,
  guardarPostoperatorioAdulto, guardarSeguimientoAdulto,
} from './server/servicios-adultos.mjs'
import { conTransaccion, pool as poolReal } from './server/db.mjs'

const APLICAR = process.argv.includes('--aplicar')
const RUTA_JSON = 'C:/Users/USUARIO/AppData/Local/Temp/claude/c--Sistema-Web-de-Cirug-a-Cardiovascular-Pedi-trica/1723d351-e382-4296-90ad-01bc522ec56e/scratchpad/adultos_extraido.json'
const FILA_OMITIDA = 50 // misma persona que la fila 58 (reintervención); se carga solo la 58.

const env = Object.fromEntries(
  readFileSync('C:/Sistema Web de Cirugía Cardiovascular Pediátrica/.env', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const filas = JSON.parse(readFileSync(RUTA_JSON, 'utf8'))

function clave(v) {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Correcciones puntuales confirmadas con el usuario (ver memoria del proyecto): errores de tipeo
// del archivo origen, no ambigüedad real de catálogo.
const CORRECCIONES = {
  riesgos: { otro: 'otracondicionrelevante' },
  proc: { otroprocediemitnoquirurgico: 'otroprocedimientoquirurgico' },
  complicacionpop: { reintervencionporotracaudsadiferenteasangrado: 'reintervencionporotracausadiferenteasangrado' },
}
// Fila 17 (FLOR ALBA LARGACHA): "USI PEDIATRICA" confirmado como error de digitación -> UCI Adultos.
const UNIDAD_POP_FORZADA = { 17: 'UCI Adultos' }

const cacheCategorias = new Map()
async function opcionesDeCategoria(conexion, codigo) {
  if (cacheCategorias.has(codigo)) return cacheCategorias.get(codigo)
  const [[cat]] = await conexion.query('SELECT id FROM categorias_lista WHERE codigo = ?', [codigo])
  const [filasOp] = await conexion.query('SELECT id, valor FROM opciones_lista WHERE categoria_id = ? AND activo = 1', [cat.id])
  const mapa = new Map(filasOp.map((o) => [clave(o.valor), o.id]))
  cacheCategorias.set(codigo, mapa)
  return mapa
}

async function idOpcion(conexion, codigo, textoCrudo, correcciones, errores, etiqueta) {
  if (textoCrudo === null || textoCrudo === undefined) return null
  const texto = String(textoCrudo).trim()
  if (texto === '' || ['n/a', 'na'].includes(texto.toLowerCase())) return null
  const mapa = await opcionesDeCategoria(conexion, codigo)
  let k = clave(texto)
  if (correcciones?.[k]) k = correcciones[k]
  const id = mapa.get(k)
  if (!id) errores.push(`${etiqueta}: "${texto}" no coincide con ninguna opción de ${codigo}`)
  return id ?? null
}

function fechaIso(v) {
  if (v === null || v === undefined || v === '') return null
  return String(v).slice(0, 10)
}

function aproximarFechaNacimiento(edadTexto, fechaIngreso, fechaCirugia) {
  const anios = Number(String(edadTexto ?? '').match(/\d+/)?.[0])
  const ancla = fechaIngreso ?? fechaCirugia
  if (!Number.isFinite(anios) || !ancla) return null
  const fecha = new Date(`${ancla}T00:00:00Z`)
  fecha.setUTCFullYear(fecha.getUTCFullYear() - anios)
  return fecha.toISOString().slice(0, 10)
}

const usuario = { id: null }

async function procesarFila(conexion, numeroFila, f) {
  const errores = []
  const [, nombre, identificacion, sexoTxt, , pesoTxt, tallaTxt, procedenciaTxt, municipioTxt, telefonoTxt, epsTxt,
    diagnosticoTxt, valvulopatiaTxt, riesgosTxt, euroscoreTxt, fechaCirugia, proc1Txt, proc2Txt, proc3Txt, implanteTxt,
    usoCecTxt, tiempoCecTxt, tiempoClampTxt, complicIntraqxTxt, cierreTxt, extubacionTxt, unidadPopTxt, horasVmTxt,
    complicPopTxt, trasladoTxt, diasUciTxt, diasHospTxt, fechaSalida, condicionSalidaTxt, fechaControlTxt,
    rehabTxt, estadoHeridaTxt, llamadoTxt, personaLlamadaTxt, reingresoTxt, fechaReingreso, causaReingresoTxt, observacionTxt,
    edadOriginalTxt, fechaIngresoOriginal,
  ] = f

  const sexo_id = await idOpcion(conexion, 'SEXO', sexoTxt, null, errores, 'Sexo')
  const procedencia_id = await idOpcion(conexion, 'PROCEDENCIA', procedenciaTxt, null, errores, 'Procedencia')
  const esNarino = clave(procedenciaTxt ?? '') === clave('Nariño')
  const municipio_narino_id = esNarino ? await idOpcion(conexion, 'MUNICIPIOS', municipioTxt, null, errores, 'Municipio') : null
  const eps_id = await idOpcion(conexion, 'EPS', epsTxt, null, errores, 'EPS')

  const fecha_nacimiento = aproximarFechaNacimiento(edadOriginalTxt, fechaIso(fechaIngresoOriginal), fechaIso(fechaCirugia))

  const paciente = {
    nombre_completo: String(nombre).trim(),
    identificacion: String(identificacion).trim(),
    sexo_id,
    fecha_nacimiento,
    peso_kg: pesoTxt ?? null,
    talla_cm: tallaTxt ?? null,
    procedencia_id,
    municipio_narino_id,
    telefono: telefonoTxt ? String(telefonoTxt).trim() : null,
    eps_id,
    estado_modulo: 'completo',
  }

  const diagnostico_id = await idOpcion(conexion, 'DIAGNOSTICO_ADULTO', diagnosticoTxt, null, errores, 'Diagnóstico')
  const esValvulopatia = /valvulopat/i.test(diagnosticoTxt ?? '')
  const valvulopatia_id = esValvulopatia ? await idOpcion(conexion, 'VALVULOPATIA', valvulopatiaTxt, null, errores, 'Valvulopatía') : null
  const riesgoTextos = String(riesgosTxt ?? '').split('+').map((s) => s.trim()).filter(Boolean)
  const riesgo_ids = []
  for (const r of riesgoTextos) {
    const id = await idOpcion(conexion, 'RIESGOS_ADULTO', r, CORRECCIONES.riesgos, errores, 'Factor de riesgo')
    if (id) riesgo_ids.push(id)
  }
  const euroscore = euroscoreTxt === null || euroscoreTxt === undefined ? null : Number((euroscoreTxt * 100).toFixed(2))

  const procedimiento_ids = []
  for (const [txt, etq] of [[proc1Txt, 'Procedimiento 1'], [proc2Txt, 'Procedimiento 2'], [proc3Txt, 'Procedimiento 3']]) {
    const id = await idOpcion(conexion, 'PROCEDIMIENTOS_ADULTO', txt, CORRECCIONES.proc, errores, etq)
    if (id) procedimiento_ids.push(id)
  }
  const implante_id = await idOpcion(conexion, 'IMPLANTE', implanteTxt, null, errores, 'Implante')
  const usoCec = clave(usoCecTxt ?? '') === clave('SI') ? 'SI' : clave(usoCecTxt ?? '') === clave('NO') ? 'NO' : null
  const complicIntraqxId = await idOpcion(conexion, 'COMPLICACION_INTRAQX', complicIntraqxTxt, null, errores, 'Complicación intraqx')
  const cierre = clave(cierreTxt ?? '') === clave('SI') ? 'SI' : clave(cierreTxt ?? '') === clave('NO') ? 'NO' : null
  const extubacion = clave(extubacionTxt ?? '') === clave('SI') ? 'SI' : clave(extubacionTxt ?? '') === clave('NO') ? 'NO' : null

  const cirugia = {
    fecha_cirugia: fechaIso(fechaCirugia),
    implante_id,
    numero_implante: null,
    uso_cec: usoCec,
    tiempo_cec_min: tiempoCecTxt ?? null,
    tiempo_clamp_min: tiempoClampTxt ?? null,
    complicacion_intraqx_ids: complicIntraqxId ? [complicIntraqxId] : [],
    cierre_esternal_diferido: cierre,
    extubacion_quirofano: extubacion,
    procedimiento_ids,
    estado_modulo: 'completo',
  }

  const unidadPopTextoReal = UNIDAD_POP_FORZADA[numeroFila] ?? unidadPopTxt
  const unidad_pop_id = await idOpcion(conexion, 'UNIDAD_POP', unidadPopTextoReal, null, errores, 'Unidad POP')
  const complicPopId = await idOpcion(conexion, 'COMPLICACION_POP', complicPopTxt, CORRECCIONES.complicacionpop, errores, 'Complicación POP')
  const condicion_salida_id = await idOpcion(conexion, 'CONDICION_SALIDA', condicionSalidaTxt, null, errores, 'Condición de salida')

  const postoperatorio = {
    unidad_pop_id,
    horas_ventilacion_mecanica: horasVmTxt ?? null,
    complicacion_pop_ids: complicPopId ? [complicPopId] : [],
    fecha_traslado_intermedio: fechaIso(trasladoTxt),
    dias_estancia_uci: diasUciTxt ?? null,
    fecha_salida: fechaIso(fechaSalida),
    dias_hospitalizacion_total: diasHospTxt ?? null,
    condicion_salida_id,
    estado_modulo: 'completo',
  }
  const esMuerte = clave(condicionSalidaTxt ?? '').includes('muerte')

  const estado_herida_id = await idOpcion(conexion, 'ESTADO_HERIDA', estadoHeridaTxt, null, errores, 'Estado de herida')
  const causa_reingreso_id = await idOpcion(conexion, 'CAUSA_REINGRESO', causaReingresoTxt, null, errores, 'Causa de reingreso')
  const llamado = clave(llamadoTxt ?? '') === clave('SI') ? 'SI' : clave(llamadoTxt ?? '') === clave('NO') ? 'NO' : null
  const reingreso = clave(reingresoTxt ?? '') === clave('SI') ? 'SI' : clave(reingresoTxt ?? '') === clave('NO') ? 'NO' : null
  const rehab = ['SI', 'NO', 'NA'].find((o) => clave(o) === clave(rehabTxt ?? '')) ?? null

  const seguimiento = esMuerte ? null : {
    fecha_control_cirugia: fechaIso(fechaControlTxt),
    rehabilitacion_cardiaca: rehab,
    estado_herida_id,
    llamado_15_dias: llamado,
    persona_recibe_llamada: personaLlamadaTxt ? String(personaLlamadaTxt).trim() : null,
    reingreso_30_dias: reingreso,
    fecha_reingreso: reingreso === 'SI' ? fechaIso(fechaReingreso) : null,
    causa_reingreso_id: reingreso === 'SI' ? causa_reingreso_id : null,
    observaciones: [observacionTxt, 'Fecha de nacimiento aproximada a partir de la edad registrada en el formato original (no se capturó fecha exacta).']
      .filter(Boolean).join(' | '),
    estado_modulo: 'completo',
  }
  if (reingreso === 'SI' && (!seguimiento?.fecha_reingreso || !seguimiento?.causa_reingreso_id)) {
    errores.push('Reingreso=SI pero falta fecha o causa de reingreso')
  }

  return { numeroFila, nombre: paciente.nombre_completo, identificacion: paciente.identificacion, paciente, diagnostico: { diagnostico_id, valvulopatia_id, euroscore, riesgo_ids, estado_modulo: 'completo' }, cirugia, postoperatorio, seguimiento, errores }
}

async function main() {
  const conexionSoloLectura = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME })
  const [[admin]] = await conexionSoloLectura.query("SELECT id FROM usuarios WHERE email = ? LIMIT 1", [env.INITIAL_ADMIN_EMAIL])
  usuario.id = admin.id

  const resultados = []
  for (const [i, f] of filas.entries()) {
    const numeroFila = i + 3
    if (numeroFila === FILA_OMITIDA) continue
    resultados.push(await procesarFila(conexionSoloLectura, numeroFila, f))
  }
  await conexionSoloLectura.end()

  const limpias = resultados.filter((r) => r.errores.length === 0)
  const conErrores = resultados.filter((r) => r.errores.length > 0)

  console.log(`\n=== RESUMEN (${APLICAR ? 'APLICANDO A LA BASE REAL' : 'SOLO REVISIÓN, nada se escribe'}) ===`)
  console.log(`Total filas a procesar: ${resultados.length} (se omite la fila ${FILA_OMITIDA} por duplicada)`)
  console.log(`Listas para cargar sin problemas: ${limpias.length}`)
  console.log(`Con advertencias/errores: ${conErrores.length}`)
  for (const r of conErrores) {
    console.log(`  Fila ${r.numeroFila} (${r.nombre}, ${r.identificacion}): ${r.errores.join('; ')}`)
  }

  if (!APLICAR) {
    console.log('\nEjecuta con --aplicar para escribir estos pacientes en la base de datos real.')
    return
  }

  let creados = 0
  for (const r of resultados) {
    if (r.errores.length > 0) { console.log(`SALTADA fila ${r.numeroFila} por errores.`); continue }
    try {
      await conTransaccion(async (conexion) => {
        const id = await crearPacienteAdulto(conexion, usuario, r.paciente, { origen: 'importado' })
        await guardarDiagnosticoAdulto(conexion, usuario, id, r.diagnostico)
        await guardarCirugiaAdulto(conexion, usuario, id, r.cirugia)
        await guardarPostoperatorioAdulto(conexion, usuario, id, r.postoperatorio)
        if (r.seguimiento) await guardarSeguimientoAdulto(conexion, usuario, id, r.seguimiento)
      })
      creados++
      console.log(`OK fila ${r.numeroFila}: ${r.nombre}`)
    } catch (err) {
      console.log(`ERROR fila ${r.numeroFila} (${r.nombre}): ${err.message}`)
    }
  }
  console.log(`\nCreados: ${creados} / ${resultados.length}`)
  await poolReal.end()
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
