// Datos de prueba FICTICIOS (15 pacientes). Ninguno corresponde a una persona real.
// Uso: npm run seed:demo   (solo desarrollo; se niega a correr si ya hay pacientes salvo con --forzar)
import { conTransaccion, hoyBogota, pool, todas, una } from './db.mjs'
import { inicializarBase } from './schema.mjs'
import { config } from './config.mjs'
import {
  crearPaciente, guardarCirugia, guardarDiagnostico, guardarPostoperatorio, guardarSeguimiento,
} from './servicios.mjs'

await inicializarBase(pool, config.admin)

const [{ n }] = await todas(pool, 'SELECT COUNT(*) AS n FROM pacientes')
if (n > 0 && !process.argv.includes('--forzar')) {
  console.log(`Ya hay ${n} pacientes; no se cargan datos de prueba (use --forzar para agregar de todos modos).`)
  await pool.end()
  process.exit(0)
}

const admin = await una(pool, "SELECT id, rol FROM usuarios WHERE rol = 'administrador' AND activo = 1 ORDER BY creado_en LIMIT 1")
if (!admin) throw new Error('No hay un administrador activo. Configure INITIAL_ADMIN_* en .env y reinicie el servidor.')

const filasOpciones = await todas(pool, 'SELECT o.id, o.codigo, o.valor, c.codigo AS categoria FROM opciones_lista o JOIN categorias_lista c ON c.id = o.categoria_id')
const op = (categoria, valor) => {
  const fila = filasOpciones.find((o) => o.categoria === categoria && (o.valor === valor || o.codigo === valor))
  if (!fila) throw new Error(`Opción no encontrada: ${categoria} / ${valor}`)
  return fila.id
}

const hoy = hoyBogota()
const dia = (base, n) => {
  const fecha = new Date(`${base}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + n)
  return fecha.toISOString().slice(0, 10)
}
const haceDias = (n) => dia(hoy, -n)

let consecutivo = 0
async function paciente({ nombre, nac, sexo, peso, talla, procedencia, municipio, telefonos, eps, diagnostico, valvulopatia, riesgos, rachs, cirugia, postop, seguimiento }) {
  consecutivo += 1
  await conTransaccion(async (conexion) => {
    const id = await crearPaciente(conexion, admin, {
      nombre_completo: nombre, identificacion: String(1000000000 + consecutivo * 137), fecha_nacimiento: nac,
      sexo_id: op('SEXO', sexo), peso_kg: peso, talla_cm: talla,
      procedencia_id: op('PROCEDENCIA', procedencia), municipio_narino_id: municipio ? op('MUNICIPIOS', municipio) : null,
      telefonos: telefonos ?? [], sin_telefono: !telefonos, eps_id: op('EPS', eps), estado_modulo: 'completo',
    })
    if (diagnostico) {
      await guardarDiagnostico(conexion, admin, id, {
        diagnostico_id: op('DIAGNOSTICO', diagnostico), valvulopatia_id: valvulopatia ? op('VALVULOPATIA', valvulopatia) : null,
        rachs_id: op('RACHS', rachs), riesgo_ids: riesgos.map((r) => op('RIESGOS', r)), estado_modulo: 'completo',
      })
    }
    if (cirugia) {
      await guardarCirugia(conexion, admin, id, {
        fecha_cirugia: cirugia.fecha, implante_id: cirugia.implante ? op('IMPLANTE', cirugia.implante) : null,
        uso_cec: cirugia.cec ? 'SI' : 'NO', tiempo_cec_min: cirugia.cec ?? null, tiempo_clamp_min: cirugia.clamp ?? null,
        complicacion_intraqx_id: op('COMPLICACION_INTRAQX', cirugia.complicacion ?? 'NINGUNA'),
        cierre_esternal_diferido: cirugia.cierreDiferido ? 'SI' : 'NO', extubacion_quirofano: cirugia.extubado ? 'SI' : 'NO',
        procedimiento_ids: cirugia.procedimientos.map((p) => op('PROCEDIMIENTOS', p)), estado_modulo: 'completo',
      })
    }
    if (postop) {
      await guardarPostoperatorio(conexion, admin, id, {
        unidad_pop_id: op('UNIDAD_POP', postop.unidad ?? 'UCI Pediátrica'), horas_ventilacion_mecanica: postop.horasVM,
        complicacion_pop_id: op('COMPLICACION_POP', postop.complicacion ?? 'NO'),
        fecha_traslado_intermedio: postop.traslado ?? null, fecha_salida: postop.salida ?? null,
        condicion_salida_id: op('CONDICION_SALIDA', postop.condicion), estado_modulo: 'completo',
      })
    }
    if (seguimiento) {
      await guardarSeguimiento(conexion, admin, id, { ...seguimiento, estado_herida_id: seguimiento.herida ? op('ESTADO_HERIDA', seguimiento.herida) : null,
        causa_reingreso_id: seguimiento.causa ? op('CAUSA_REINGRESO', seguimiento.causa) : null })
    }
  })
}

const completoSeg = (salida, extra = {}) => ({
  fecha_control_cirugia: dia(salida, 12), rehabilitacion_cardiaca: 'NO', herida: 'Cicatrización adecuada',
  fecha_llamada_15_dias: dia(salida, 15), persona_recibe_llamada: 'Madre', reingreso_30_dias: 'NO', observaciones: null,
  estado_modulo: 'completo', ...extra,
})

// 1. Estable, CIA, RACHS I
await paciente({ nombre: 'Valentina Rojas Prueba', nac: '2021-03-14', sexo: 'Femenino', peso: 14.2, talla: 95, procedencia: 'Nariño', municipio: 'Pasto', telefonos: ['3001110001'], eps: 'Emssanar',
  diagnostico: 'Comunicación interauricular (CIA)', rachs: 'I', riesgos: ['Ninguno'],
  cirugia: { fecha: '2024-05-06', cec: 42, clamp: 25, procedimientos: ['Cierre de comunicación interauricular (CIA)'], extubado: true },
  postop: { horasVM: 0, traslado: '2024-05-07', salida: '2024-05-11', condicion: 'Estable' }, seguimiento: completoSeg('2024-05-11') })
// 2. Estable, CIV, RACHS II
await paciente({ nombre: 'Mateo Cárdenas Prueba', nac: '2023-08-02', sexo: 'Masculino', peso: 8.4, talla: 70, procedencia: 'Nariño', municipio: 'Ipiales', telefonos: ['3001110002', '3001110022'], eps: 'Nueva EPS',
  diagnostico: 'Comunicación interventricular (CIV)', rachs: 'II', riesgos: ['Desnutrición'],
  cirugia: { fecha: '2024-09-10', cec: 68, clamp: 41, procedimientos: ['Cierre de comunicación interventricular (CIV)'], extubado: false },
  postop: { horasVM: 18, traslado: '2024-09-13', salida: '2024-09-20', condicion: 'Estable' }, seguimiento: completoSeg('2024-09-20') })
// 3. Fallecido en UCI (Norwood, RACHS VI): sin traslado, condición Muerte => Módulo 5 no aplica
await paciente({ nombre: 'Sara Benavides Prueba', nac: '2025-01-05', sexo: 'Femenino', peso: 3.1, talla: 50, procedencia: 'Putumayo', telefonos: ['3001110003'], eps: 'Asmet Salud',
  diagnostico: 'Síndrome de corazón izquierdo hipoplásico', rachs: 'VI', riesgos: ['Prematuridad / bajo peso al nacer', 'Cirugía cardíaca previa'],
  cirugia: { fecha: '2025-01-15', cec: 120, clamp: 65, procedimientos: ['Procedimiento de Norwood'], complicacion: 'Necesidad de soporte circulatorio mecánico (ECMO)', cierreDiferido: true },
  postop: { horasVM: 96, complicacion: 'Muerte', salida: '2025-01-22', condicion: 'Muerte' } })
// 4. Fallecido intraoperatorio
await paciente({ nombre: 'Julián Erazo Prueba', nac: '2024-06-20', sexo: 'Masculino', peso: 5.5, talla: 60, procedencia: 'Cauca', telefonos: ['3001110004'], eps: 'Sanitas',
  diagnostico: 'Transposición de grandes arterias', rachs: 'IV', riesgos: ['Ninguno'],
  cirugia: { fecha: '2024-07-12', cec: 150, clamp: 95, procedimientos: ['Corrección de transposición de grandes arterias / Switch arterial'], complicacion: 'Muerte intraoperatoria', cierreDiferido: true },
  postop: { horasVM: 0, complicacion: 'Muerte', salida: '2024-07-12', condicion: 'Muerte' } })
// 5. Con reingreso a 30 días (Fontan)
await paciente({ nombre: 'Daniela Guerrero Prueba', nac: '2020-11-30', sexo: 'Femenino', peso: 16.8, talla: 102, procedencia: 'Nariño', municipio: 'Tumaco', telefonos: ['3001110005'], eps: 'Emssanar',
  diagnostico: 'Atresia tricuspídea', rachs: 'IV', riesgos: ['Cirugía cardíaca previa', 'Intervención previa por hemodinamia'],
  cirugia: { fecha: '2025-02-03', cec: 95, clamp: 0 + 30, procedimientos: ['Procedimiento de Fontan'], implante: 'Biológico' },
  postop: { horasVM: 30, complicacion: 'Reintubación', traslado: '2025-02-08', salida: '2025-02-19', condicion: 'Estable con oxígeno domiciliario' },
  seguimiento: completoSeg('2025-02-19', { reingreso_30_dias: 'SI', fecha_reingreso: '2025-03-06', causa: 'Derrame pleural' }) })
// 6. Sin CEC (cierre de ductus)
await paciente({ nombre: 'Emmanuel Realpe Prueba', nac: '2025-03-02', sexo: 'Masculino', peso: 2.2, talla: 44, procedencia: 'Nariño', municipio: 'Pasto', telefonos: ['3001110006'], eps: 'Salud Total',
  diagnostico: 'Persistencia del conducto arterioso (PCA)', rachs: 'I', riesgos: ['Prematuridad / bajo peso al nacer'],
  cirugia: { fecha: '2025-03-20', procedimientos: ['Cierre de ductus arterioso persistente'], extubado: true },
  postop: { horasVM: 0, unidad: 'UCI Neonatos', traslado: '2025-03-21', salida: '2025-03-26', condicion: 'Estable' }, seguimiento: completoSeg('2025-03-26') })
// 7. Seguimiento pendiente: alta hace 10 días, llamada aún no vence (en 5 días)
await paciente({ nombre: 'Isabella Mora Prueba', nac: '2022-09-09', sexo: 'Femenino', peso: 12.0, talla: 86, procedencia: 'Nariño', municipio: 'La Unión', telefonos: ['3001110007'], eps: 'Mallamas',
  diagnostico: 'Coartación de aorta', rachs: 'II', riesgos: ['Ninguno'],
  cirugia: { fecha: haceDias(18), cec: 0 + 55, clamp: 28, procedimientos: ['Cirugía de coartación de aorta'], extubado: true },
  postop: { horasVM: 0, traslado: haceDias(15), salida: haceDias(10), condicion: 'Estable' },
  seguimiento: { fecha_control_cirugia: null, rehabilitacion_cardiaca: null, herida: null, fecha_llamada_15_dias: dia(haceDias(10), 15), persona_recibe_llamada: null, reingreso_30_dias: null, estado_modulo: 'pendiente' } })
// 8. Llamada de 15 días VENCIDA (alta hace 25 días, llamada era hace 10)
await paciente({ nombre: 'Santiago Pantoja Prueba', nac: '2019-12-12', sexo: 'Masculino', peso: 19.5, talla: 108, procedencia: 'Nariño', municipio: 'Túquerres', telefonos: ['3001110008'], eps: 'Emssanar',
  diagnostico: 'Tetralogía de Fallot', rachs: 'II', riesgos: ['Ninguno'],
  cirugia: { fecha: haceDias(34), cec: 88, clamp: 52, procedimientos: ['Corrección de tetralogía de Fallot'], implante: 'Autólogo' },
  postop: { horasVM: 22, traslado: haceDias(30), salida: haceDias(25), condicion: 'Estable' },
  seguimiento: { fecha_control_cirugia: null, rehabilitacion_cardiaca: null, herida: null, fecha_llamada_15_dias: dia(haceDias(25), 15), persona_recibe_llamada: null, reingreso_30_dias: null, estado_modulo: 'pendiente' } })
// 9. Valvulopatía con implante mecánico
await paciente({ nombre: 'Camila Insuasty Prueba', nac: '2012-04-18', sexo: 'Femenino', peso: 41.0, talla: 150, procedencia: 'Nariño', municipio: 'Sandoná', telefonos: ['3001110009'], eps: 'Famisanar',
  diagnostico: 'Valvulopatías', valvulopatia: 'Estenosis', rachs: 'III', riesgos: ['Endocarditis', 'Insuficiencia cardíaca'],
  cirugia: { fecha: '2025-04-08', cec: 110, clamp: 78, procedimientos: ['Reemplazo valvular aórtico'], implante: 'Mecánico' },
  postop: { horasVM: 12, traslado: '2025-04-11', salida: '2025-04-20', condicion: 'Estable' }, seguimiento: completoSeg('2025-04-20', { rehabilitacion_cardiaca: 'SI' }) })
// 10. Neonato operado a los 12 días de vida
await paciente({ nombre: 'Thiago Cabrera Prueba', nac: '2025-05-01', sexo: 'Masculino', peso: 3.4, talla: 51, procedencia: 'Nariño', municipio: 'Ipiales', telefonos: ['3001110010'], eps: 'Nueva EPS',
  diagnostico: 'Drenaje anómalo de venas pulmonares', rachs: 'IV', riesgos: ['Ninguno'],
  cirugia: { fecha: '2025-05-13', cec: 78, clamp: 44, procedimientos: ['Corrección de drenaje venoso pulmonar anómalo'], cierreDiferido: true },
  postop: { horasVM: 60, unidad: 'UCI Neonatos', traslado: '2025-05-20', salida: '2025-05-30', condicion: 'Estable' }, seguimiento: completoSeg('2025-05-30') })
// 11. Procedencia Ecuador, remitido
await paciente({ nombre: 'Lucía Andrade Prueba', nac: '2022-02-25', sexo: 'Femenino', peso: 13.1, talla: 90, procedencia: 'Ecuador', telefonos: null, eps: 'Particular',
  diagnostico: 'Estenosis pulmonar', rachs: 'II', riesgos: ['Ninguno'],
  cirugia: { fecha: '2025-06-09', cec: 50, clamp: 30, procedimientos: ['Valvuloplastia pulmonar'] },
  postop: { horasVM: 6, traslado: '2025-06-10', salida: '2025-06-14', condicion: 'Remitido' } })
// 12. Solo módulos 1 y 2 (registro incompleto)
await paciente({ nombre: 'Andrés Villota Prueba', nac: '2024-10-10', sexo: 'Masculino', peso: 6.8, talla: 65, procedencia: 'Nariño', municipio: 'Pasto', telefonos: ['3001110012'], eps: 'Sanitas',
  diagnostico: 'Canal auriculoventricular', rachs: 'III', riesgos: ['Síndrome genético (Down, Turner, DiGeorge, Noonan, Williams u otro)'] })
// 13. Solo módulo 1
await paciente({ nombre: 'Gabriela Chamorro Prueba', nac: '2023-12-01', sexo: 'Femenino', peso: 10.3, talla: 80, procedencia: 'Nariño', municipio: 'Buesaco', telefonos: ['3001110013'], eps: 'Asmet Salud' })
// 14. Tres procedimientos y varios riesgos
await paciente({ nombre: 'Nicolás Ortiz Prueba', nac: '2020-07-07', sexo: 'Masculino', peso: 17.0, talla: 105, procedencia: 'Valle del Cauca', telefonos: ['3001110014'], eps: 'SURA',
  diagnostico: 'Doble salida del ventrículo derecho', rachs: 'IV', riesgos: ['Hipertensión pulmonar', 'Arritmias cardíacas', 'Infección activa'],
  cirugia: { fecha: '2025-07-01', cec: 135, clamp: 90, procedimientos: ['Corrección de doble salida del ventrículo derecho', 'Cierre de comunicación interventricular (CIV)', 'Valvuloplastia pulmonar'], implante: 'Biológico', complicacion: 'Hemorragia quirúrgica significativa' },
  postop: { horasVM: 72, complicacion: 'Sangrado significativo', traslado: '2025-07-09', salida: '2025-07-18', condicion: 'Estable' }, seguimiento: completoSeg('2025-07-18', { estado_herida_id: null, herida: 'Eritema', observaciones: 'Control en 1 semana.' }) })
// 15. Complicación POP (ECMO) y alta voluntaria
await paciente({ nombre: 'Mariana Salas Prueba', nac: '2023-04-04', sexo: 'Femenino', peso: 9.6, talla: 76, procedencia: 'Nariño', municipio: 'Barbacoas', telefonos: ['3001110015'], eps: 'Emssanar',
  diagnostico: 'Ventrículo único / fisiología univentricular', rachs: 'IV', riesgos: ['Disfunción ventricular'],
  cirugia: { fecha: '2025-08-05', cec: 100, clamp: 55, procedimientos: ['Anastomosis cavopulmonar bidireccional (Glenn)'] },
  postop: { horasVM: 120, complicacion: 'ECMO', traslado: '2025-08-20', salida: '2025-08-28', condicion: 'Alta voluntaria' }, seguimiento: completoSeg('2025-08-28', { persona_recibe_llamada: 'Abuela' }) })

console.log(`${consecutivo} pacientes de prueba cargados.`)
await pool.end()
