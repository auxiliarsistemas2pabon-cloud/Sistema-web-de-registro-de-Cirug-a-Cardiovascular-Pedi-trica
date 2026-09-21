// Pruebas de integración de la API. Requieren el servidor en marcha (npm run server) y MySQL disponible.
// Ejecutar: npm run test:api  (usa INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD del .env)
import 'dotenv/config'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`
const sufijo = Date.now().toString().slice(-8)

async function api(metodo, ruta, { token, cuerpo } = {}) {
  const res = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const texto = await res.text()
  return { estado: res.status, datos: texto ? JSON.parse(texto) : null }
}

async function login(email, password) {
  const r = await api('POST', '/auth/login', { cuerpo: { email, password } })
  assert.equal(r.estado, 200, JSON.stringify(r.datos))
  return r.datos.token
}

describe('API cirugía cardiovascular pediátrica', () => {
  let admin, registrador, consulta
  const op = {}

  before(async () => {
    admin = await login(process.env.INITIAL_ADMIN_EMAIL, process.env.INITIAL_ADMIN_PASSWORD)
    for (const [rol, email] of [['registrador', `reg${sufijo}@prueba.local`], ['consulta', `con${sufijo}@prueba.local`]]) {
      const r = await api('POST', '/admin/usuarios', { token: admin, cuerpo: { email, nombre_completo: `Usuario ${rol}`, rol, password: 'ClaveSegura123' } })
      assert.equal(r.estado, 201, JSON.stringify(r.datos))
    }
    registrador = await login(`reg${sufijo}@prueba.local`, 'ClaveSegura123')
    consulta = await login(`con${sufijo}@prueba.local`, 'ClaveSegura123')
    const todas = (await api('GET', '/listas/opciones', { token: admin })).datos
    for (const o of todas) (op[o.categoria_codigo] ??= []).push(o)
  })

  const porCodigo = (cat, codigo) => op[cat].find((o) => o.codigo === codigo).id
  const porValor = (cat, valor) => op[cat].find((o) => o.valor === valor).id

  it('exige autenticación y rechaza credenciales inválidas', async () => {
    assert.equal((await api('GET', '/pacientes')).estado, 401)
    const r = await api('POST', '/auth/login', { cuerpo: { email: 'nadie@x.co', password: 'Incorrecta123' } })
    assert.equal(r.estado, 401)
    assert.equal(r.datos.error.codigo, 'CREDENCIALES_INVALIDAS')
  })

  it('rechaza contraseñas débiles al crear usuarios', async () => {
    const r = await api('POST', '/admin/usuarios', { token: admin, cuerpo: { email: `x${sufijo}@p.local`, nombre_completo: 'X', rol: 'consulta', password: 'corta' } })
    assert.equal(r.estado, 400)
    assert.ok(r.datos.error.campos.password)
  })

  it('siembra las 16 listas y los códigos estables', async () => {
    assert.equal(Object.keys(op).length, 16)
    assert.ok(porCodigo('PROCEDENCIA', 'NARINO'))
    assert.ok(porCodigo('CONDICION_SALIDA', 'MUERTE'))
  })

  describe('paciente y módulos', () => {
    let id

    it('crea paciente, valida y limpia el municipio si no es Nariño', async () => {
      const malo = await api('POST', '/pacientes', { token: registrador, cuerpo: { nombre_completo: 'A', identificacion: '12ab', fecha_nacimiento: '2999-01-01', peso_kg: 900 } })
      assert.equal(malo.estado, 400)
      assert.ok(malo.datos.error.campos.identificacion && malo.datos.error.campos.fecha_nacimiento && malo.datos.error.campos.peso_kg)

      const r = await api('POST', '/pacientes', {
        token: registrador,
        cuerpo: { nombre_completo: `Paciente Prueba ${sufijo}`, identificacion: `9${sufijo}`, fecha_nacimiento: '2023-01-10', procedencia_id: porValor('PROCEDENCIA', 'Antioquia'), municipio_narino_id: porValor('MUNICIPIOS', 'Pasto'), sin_telefono: true, estado_modulo: 'completo' },
      })
      assert.equal(r.estado, 201, JSON.stringify(r.datos))
      id = r.datos.id
      const detalle = (await api('GET', `/pacientes/${id}`, { token: consulta })).datos
      assert.equal(detalle.municipio_narino_id, null)
      assert.equal(detalle.sin_telefono, true)
      assert.equal(detalle.eliminado, false)
      const dup = await api('POST', '/pacientes', { token: registrador, cuerpo: { nombre_completo: 'Dup', identificacion: `9${sufijo}`, fecha_nacimiento: '2023-01-10' } })
      assert.equal(dup.estado, 409)
      assert.equal(dup.datos.error.codigo, 'IDENTIFICACION_DUPLICADA')
    })

    it('consulta no puede escribir', async () => {
      const r = await api('PUT', `/pacientes/${id}`, { token: consulta, cuerpo: { nombre_completo: 'X' } })
      assert.equal(r.estado, 403)
    })

    it('Módulo 2: valvulopatía a N/A y "Ninguno" exclusivo', async () => {
      const cuerpo = { diagnostico_id: porValor('DIAGNOSTICO', 'Coartación de aorta'), valvulopatia_id: porValor('VALVULOPATIA', 'Estenosis'), rachs_id: porValor('RACHS', 'II'), riesgo_ids: [porCodigo('RIESGOS', 'NINGUNO'), porValor('RIESGOS', 'Obesidad')], estado_modulo: 'completo' }
      const malo = await api('PUT', `/pacientes/${id}/diagnostico`, { token: registrador, cuerpo })
      assert.equal(malo.estado, 422)
      const ok = await api('PUT', `/pacientes/${id}/diagnostico`, { token: registrador, cuerpo: { ...cuerpo, riesgo_ids: [porValor('RIESGOS', 'Obesidad')] } })
      assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
      const d = (await api('GET', `/pacientes/${id}/diagnostico`, { token: registrador })).datos
      assert.equal(d.valvulopatia_id, porCodigo('VALVULOPATIA', 'NA'))
      assert.deepEqual(d.riesgo_ids, [porValor('RIESGOS', 'Obesidad')])
    })

    it('Módulo 3: fechas, CEC y procedimientos', async () => {
      const base = { fecha_cirugia: '2023-06-01', uso_cec: 'SI', tiempo_cec_min: 80, tiempo_clamp_min: 40, procedimiento_ids: [porValor('PROCEDIMIENTOS', 'Cirugía de coartación de aorta')], estado_modulo: 'completo' }
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: registrador, cuerpo: { ...base, fecha_cirugia: '2022-01-01' } })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: registrador, cuerpo: { ...base, tiempo_clamp_min: 200 } })).estado, 422)
      const p = porValor('PROCEDIMIENTOS', 'Otro')
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: registrador, cuerpo: { ...base, procedimiento_ids: [p, p] } })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: registrador, cuerpo: base })).estado, 200)
      const sinCec = await api('PUT', `/pacientes/${id}/cirugia`, { token: registrador, cuerpo: { ...base, uso_cec: 'NO' } })
      assert.equal(sinCec.estado, 200)
      const c = (await api('GET', `/pacientes/${id}/cirugia`, { token: registrador })).datos
      assert.equal(c.tiempo_cec_min, null)
      assert.equal(c.procedimiento_ids.length, 1)
    })

    it('Módulo 5 exige Módulo 4; Muerte bloquea el Módulo 5 y se revierte', async () => {
      const seg = { fecha_control_cirugia: '2023-06-20', rehabilitacion_cardiaca: 'NO', reingreso_30_dias: 'NO', persona_recibe_llamada: 'Madre', estado_modulo: 'pendiente' }
      const antes = await api('PUT', `/pacientes/${id}/seguimiento`, { token: registrador, cuerpo: seg })
      assert.equal(antes.estado, 409)
      assert.equal(antes.datos.error.codigo, 'POSTOPERATORIO_REQUERIDO')

      const pop = { unidad_pop_id: porValor('UNIDAD_POP', 'UCI Pediátrica'), horas_ventilacion_mecanica: 5, complicacion_pop_id: porCodigo('COMPLICACION_POP', 'NO'), fecha_salida: '2023-06-08', estado_modulo: 'completo' }
      assert.equal((await api('PUT', `/pacientes/${id}/postoperatorio`, { token: registrador, cuerpo: { ...pop, fecha_salida: '2023-05-01' } })).estado, 422)
      const muerte = await api('PUT', `/pacientes/${id}/postoperatorio`, { token: registrador, cuerpo: { ...pop, condicion_salida_id: porCodigo('CONDICION_SALIDA', 'MUERTE') } })
      assert.equal(muerte.estado, 200, JSON.stringify(muerte.datos))
      const s1 = (await api('GET', `/pacientes/${id}/seguimiento`, { token: registrador })).datos
      assert.equal(s1.no_aplica, true)
      assert.equal(s1.estado_modulo, 'no_aplica')
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: registrador, cuerpo: seg })).estado, 422)

      await api('PUT', `/pacientes/${id}/postoperatorio`, { token: registrador, cuerpo: { ...pop, condicion_salida_id: porValor('CONDICION_SALIDA', 'Estable') } })
      const s2 = (await api('GET', `/pacientes/${id}/seguimiento`, { token: registrador })).datos
      assert.equal(s2.no_aplica, false)
      assert.equal(s2.estado_modulo, 'pendiente')
      const fuera = { ...seg, reingreso_30_dias: 'SI', fecha_reingreso: '2023-08-30', causa_reingreso_id: porValor('CAUSA_REINGRESO', 'Sangrado') }
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: registrador, cuerpo: fuera })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: registrador, cuerpo: seg })).estado, 200)
    })

    it('resumen calcula edad y días; el listado filtra; solo admin elimina y ve eliminados', async () => {
      const r = (await api('GET', `/pacientes/${id}/resumen`, { token: consulta })).datos
      assert.equal(r.estado_m2, 'completo')
      assert.equal(r.dias_hospitalizacion_posqx, 7)
      assert.ok(r.edad_dias > 365)
      const lista = (await api('GET', `/pacientes?busqueda=${encodeURIComponent('prueba ' + sufijo)}`, { token: consulta })).datos
      assert.equal(lista.length, 1)
      assert.equal((await api('PUT', `/pacientes/${id}/eliminado`, { token: registrador, cuerpo: { eliminado: true } })).estado, 403)
      assert.equal((await api('PUT', `/pacientes/${id}/eliminado`, { token: admin, cuerpo: { eliminado: true } })).estado, 200)
      assert.equal((await api('GET', `/pacientes/${id}`, { token: registrador })).estado, 404)
      assert.equal((await api('GET', `/pacientes/${id}`, { token: admin })).estado, 200)
      assert.equal((await api('PUT', `/pacientes/${id}/eliminado`, { token: admin, cuerpo: { eliminado: false } })).estado, 200)
    })

    it('la auditoría registra los cambios con el usuario real (solo admin)', async () => {
      assert.equal((await api('GET', '/admin/auditoria', { token: registrador })).estado, 403)
      const filas = (await api('GET', '/admin/auditoria?tabla=pacientes', { token: admin })).datos
      const propia = filas.filter((f) => f.registro_id === id)
      assert.ok(propia.some((f) => f.operacion === 'INSERT' && f.usuario_nombre === 'Usuario registrador'))
      assert.ok(propia.some((f) => f.operacion === 'UPDATE' && f.valores_anteriores && f.valores_nuevos))
    })
  })

  it('alertas e indicadores responden con la forma acordada', async () => {
    assert.ok(Array.isArray((await api('GET', '/alertas', { token: consulta })).datos))
    const i = (await api('GET', '/indicadores?desde=2000-01-01&hasta=2100-01-01', { token: consulta })).datos
    assert.ok(i.resumen.total_cirugias >= 1)
    for (const k of ['por_mes', 'por_diagnostico', 'por_procedimiento', 'por_rachs', 'por_eps', 'por_procedencia']) assert.ok(Array.isArray(i[k]), k)
    assert.equal((await api('GET', '/indicadores', { token: consulta })).estado, 400)
  })

  it('protege el código de las opciones y solo el admin edita listas', async () => {
    const opcion = op.EPS[0]
    assert.equal((await api('PATCH', `/admin/listas/opciones/${opcion.id}`, { token: registrador, cuerpo: { valor: 'x' } })).estado, 403)
    assert.equal((await api('PATCH', `/admin/listas/opciones/${porCodigo('RIESGOS', 'NINGUNO')}`, { token: admin, cuerpo: { codigo: 'OTRO' } })).estado, 422)
    assert.equal((await api('PATCH', `/admin/listas/opciones/${porCodigo('RIESGOS', 'NINGUNO')}`, { token: admin, cuerpo: { orden: 150 } })).estado, 200)
  })

  it('exportación plana', async () => {
    const filas = (await api('GET', '/exportacion/pacientes', { token: registrador })).datos
    assert.ok(filas.length >= 1)
    assert.ok('nombre_completo' in filas[0] && 'procedimientos' in filas[0])
  })
})
