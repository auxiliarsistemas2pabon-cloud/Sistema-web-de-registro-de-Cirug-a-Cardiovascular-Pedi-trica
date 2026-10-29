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
  // No hay roles: todo usuario es administrador, así que las pruebas usan al administrador inicial y
  // no crean usuarios (no hay forma de borrarlos por la API y quedarían en la base en cada ejecución).
  let admin, perfil
  const op = {}

  before(async () => {
    admin = await login(process.env.INITIAL_ADMIN_EMAIL, process.env.INITIAL_ADMIN_PASSWORD)
    perfil = (await api('GET', '/auth/me', { token: admin })).datos
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
    const r = await api('POST', '/admin/usuarios', { token: admin, cuerpo: { email: `x${sufijo}@p.local`, nombre_completo: 'X', password: 'corta' } })
    assert.equal(r.estado, 400)
    assert.ok(r.datos.error.campos.password)
  })

  it('los usuarios no tienen rol y no se puede desactivar al último activo', async () => {
    assert.ok(!('rol' in perfil))
    const usuarios = (await api('GET', '/admin/usuarios', { token: admin })).datos
    assert.ok(usuarios.length >= 1 && usuarios.every((u) => !('rol' in u)))
    // Solo se comprueba la regla si el administrador de las pruebas es el único activo: si no, la
    // petición lo desactivaría de verdad.
    if (usuarios.filter((u) => u.activo).length === 1) {
      const r = await api('PATCH', `/admin/usuarios/${perfil.id}`, { token: admin, cuerpo: { activo: false } })
      assert.equal(r.estado, 422)
    }
  })

  it('siembra las 19 listas (16 del módulo pediátrico y 3 propias de adultos) y los códigos estables', async () => {
    assert.equal(Object.keys(op).length, 19)
    assert.ok(porCodigo('PROCEDENCIA', 'NARINO'))
    assert.ok(porCodigo('CONDICION_SALIDA', 'MUERTE'))
  })

  describe('paciente y módulos', () => {
    let id

    it('crea paciente, valida y limpia el municipio si no es Nariño', async () => {
      const malo = await api('POST', '/pacientes', { token: admin, cuerpo: { nombre_completo: 'A', identificacion: '12ab', fecha_nacimiento: '2999-01-01', peso_kg: 900 } })
      assert.equal(malo.estado, 400)
      assert.ok(malo.datos.error.campos.identificacion && malo.datos.error.campos.fecha_nacimiento && malo.datos.error.campos.peso_kg)

      const r = await api('POST', '/pacientes', {
        token: admin,
        cuerpo: { nombre_completo: `Paciente Prueba ${sufijo}`, identificacion: `9${sufijo}`, fecha_nacimiento: '2023-01-10', procedencia_id: porValor('PROCEDENCIA', 'Antioquia'), municipio_narino_id: porValor('MUNICIPIOS', 'Pasto'), sin_telefono: true, estado_modulo: 'completo' },
      })
      assert.equal(r.estado, 201, JSON.stringify(r.datos))
      id = r.datos.id
      const detalle = (await api('GET', `/pacientes/${id}`, { token: admin })).datos
      assert.equal(detalle.municipio_narino_id, null)
      assert.equal(detalle.sin_telefono, true)
      assert.equal(detalle.eliminado, false)
      const dup = await api('POST', '/pacientes', { token: admin, cuerpo: { nombre_completo: 'Dup', identificacion: `9${sufijo}`, fecha_nacimiento: '2023-01-10' } })
      assert.equal(dup.estado, 409)
      assert.equal(dup.datos.error.codigo, 'IDENTIFICACION_DUPLICADA')
    })

    it('Módulo 2: valvulopatía a N/A y "Ninguno" exclusivo', async () => {
      const cuerpo = { diagnostico_id: porValor('DIAGNOSTICO', 'Coartación de aorta'), valvulopatia_id: porValor('VALVULOPATIA', 'Estenosis'), rachs_id: porValor('RACHS', 'II'), riesgo_ids: [porCodigo('RIESGOS', 'NINGUNO'), porValor('RIESGOS', 'Obesidad')], estado_modulo: 'completo' }
      const malo = await api('PUT', `/pacientes/${id}/diagnostico`, { token: admin, cuerpo })
      assert.equal(malo.estado, 422)
      const ok = await api('PUT', `/pacientes/${id}/diagnostico`, { token: admin, cuerpo: { ...cuerpo, riesgo_ids: [porValor('RIESGOS', 'Obesidad')] } })
      assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
      const d = (await api('GET', `/pacientes/${id}/diagnostico`, { token: admin })).datos
      assert.equal(d.valvulopatia_id, porCodigo('VALVULOPATIA', 'NA'))
      assert.deepEqual(d.riesgo_ids, [porValor('RIESGOS', 'Obesidad')])
    })

    it('Módulo 2: diagnósticos adicionales y especificación de las opciones "Otro…"', async () => {
      const otras = porValor('DIAGNOSTICO', 'Otras cardiopatías congénitas')
      const valvulopatias = porCodigo('DIAGNOSTICO', 'VALVULOPATIAS')
      const otraCondicion = porValor('RIESGOS', 'Otra condición relevante')
      const obesidad = porValor('RIESGOS', 'Obesidad')
      const base = { diagnostico_id: valvulopatias, rachs_id: porValor('RACHS', 'II'), riesgo_ids: [otraCondicion, obesidad], estado_modulo: 'completo' }
      const estenosis = porValor('VALVULOPATIA', 'Estenosis')
      const insuficiencia = porValor('VALVULOPATIA', 'Insuficiencia')
      const adicional = (diagnostico_id, especificacion = null, valvulopatia_id = null) => ({ diagnostico_id, especificacion, valvulopatia_id })
      const guardar = (cuerpo) => api('PUT', `/pacientes/${id}/diagnostico`, { token: admin, cuerpo: { ...base, ...cuerpo } })
      const leer = async () => (await api('GET', `/pacientes/${id}/diagnostico`, { token: admin })).datos
      // Los adicionales no pueden ir sin diagnóstico principal.
      assert.equal((await guardar({ diagnostico_id: null, diagnosticos_adicionales: [adicional(otras)] })).estado, 422)
      // Sí pueden repetir un diagnóstico: dos valvulopatías, cada una con su propio tipo. El tipo de un
      // diagnóstico que no es valvulopatía se descarta.
      const ok = await guardar({
        diagnostico_otro: 'no aplica: no es un "Otro…"',
        valvulopatia_id: estenosis,
        diagnosticos_adicionales: [adicional(valvulopatias, null, insuficiencia), adicional(otras, 'Síndrome de Shone', estenosis)],
        riesgo_especificaciones: { [otraCondicion]: 'Hipotiroidismo', [obesidad]: 'se descarta' },
      })
      assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
      const d = await leer()
      assert.equal(d.diagnostico_otro, null)
      assert.equal(d.valvulopatia_id, estenosis)
      assert.deepEqual(d.diagnosticos_adicionales, [adicional(valvulopatias, null, insuficiencia), adicional(otras, 'Síndrome de Shone')])
      assert.deepEqual(d.riesgo_especificaciones, { [otraCondicion]: 'Hipotiroidismo' })
      // Quien no envía las especificaciones ni los adicionales (p. ej. la importación) no borra los guardados.
      await guardar({ valvulopatia_id: estenosis })
      const sinCambios = await leer()
      assert.deepEqual(sinCambios.riesgo_especificaciones, { [otraCondicion]: 'Hipotiroidismo' })
      assert.equal(sinCambios.diagnosticos_adicionales.length, 2)
      // Cada tipo es de su diagnóstico: con un principal que no es valvulopatía, el suyo queda en N/A
      // aunque un adicional sí lo sea.
      await guardar({
        diagnostico_id: otras, diagnostico_otro: 'Síndrome de Shone', valvulopatia_id: estenosis,
        diagnosticos_adicionales: [adicional(valvulopatias, null, insuficiencia)],
      })
      const final = await leer()
      assert.equal(final.valvulopatia_id, porCodigo('VALVULOPATIA', 'NA'))
      assert.deepEqual(final.diagnosticos_adicionales, [adicional(valvulopatias, null, insuficiencia)])
    })

    it('Módulo 3: fechas, CEC y procedimientos', async () => {
      const base = { fecha_cirugia: '2023-06-01', uso_cec: 'SI', tiempo_cec_min: 80, tiempo_clamp_min: 40, procedimiento_ids: [porValor('PROCEDIMIENTOS', 'Cirugía de coartación de aorta')], estado_modulo: 'completo' }
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, fecha_cirugia: '2022-01-01' } })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, tiempo_clamp_min: 200 } })).estado, 422)
      const p = porValor('PROCEDIMIENTOS', 'Otro')
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, procedimiento_ids: [p, p] } })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: base })).estado, 200)
      const sinCec = await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, uso_cec: 'NO' } })
      assert.equal(sinCec.estado, 200)
      const c = (await api('GET', `/pacientes/${id}/cirugia`, { token: admin })).datos
      assert.equal(c.tiempo_cec_min, null)
      assert.equal(c.procedimiento_ids.length, 1)
    })

    it('Módulo 3: cada procedimiento adicional exige su propia fecha, posterior a la anterior', async () => {
      const base = { fecha_cirugia: '2023-06-01', procedimiento_ids: [porValor('PROCEDIMIENTOS', 'Cirugía de coartación de aorta'), porValor('PROCEDIMIENTOS', 'Otro')], estado_modulo: 'pendiente' }
      // Falta la fecha del procedimiento 2.
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: base })).estado, 422)
      // Mismo día que el procedimiento 1: no está permitido.
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, fecha_procedimiento_2: '2023-06-01' } })).estado, 422)
      // Anterior al procedimiento 1: tampoco.
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, fecha_procedimiento_2: '2023-05-01' } })).estado, 422)
      const ok = await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...base, fecha_procedimiento_2: '2023-06-15' } })
      assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
      const c = (await api('GET', `/pacientes/${id}/cirugia`, { token: admin })).datos
      assert.equal(c.fecha_procedimiento_2, '2023-06-15')
      // Al quitar el procedimiento 2, su fecha se descarta en silencio.
      const sinP2 = await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { fecha_cirugia: '2023-06-01', procedimiento_ids: [base.procedimiento_ids[0]], estado_modulo: 'completo' } })
      assert.equal(sinP2.estado, 200, JSON.stringify(sinP2.datos))
      const c2 = (await api('GET', `/pacientes/${id}/cirugia`, { token: admin })).datos
      assert.equal(c2.fecha_procedimiento_2, null)
    })

    it('Módulo 3: implante y especificación por procedimiento', async () => {
      const coartacion = porValor('PROCEDIMIENTOS', 'Cirugía de coartación de aorta')
      const otro = porValor('PROCEDIMIENTOS', 'Otro')
      const mecanico = porValor('IMPLANTE', 'Mecánico')
      const cuerpo = {
        fecha_cirugia: '2023-06-01', fecha_procedimiento_2: '2023-06-15', estado_modulo: 'completo',
        procedimientos: [
          { procedimiento_id: coartacion, implante: 'NA', tipo_implante_id: mecanico, especificacion: 'se descarta' },
          { procedimiento_id: otro, implante: 'SI', tipo_implante_id: mecanico, especificacion: 'Plastia de arco' },
        ],
      }
      assert.equal((await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { ...cuerpo, procedimientos: [{ implante: 'SI' }] } })).estado, 400)
      const ok = await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo })
      assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
      const c = (await api('GET', `/pacientes/${id}/cirugia`, { token: admin })).datos
      assert.deepEqual(c.procedimientos, [
        { procedimiento_id: coartacion, especificacion: null, implante: 'NA', tipo_implante_id: null },
        { procedimiento_id: otro, especificacion: 'Plastia de arco', implante: 'SI', tipo_implante_id: mecanico },
      ])
      // La forma anterior (solo los ids) conserva el implante y la especificación de cada procedimiento.
      await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { fecha_cirugia: '2023-06-01', fecha_procedimiento_2: '2023-06-15', procedimiento_ids: [coartacion, otro], estado_modulo: 'completo' } })
      assert.deepEqual((await api('GET', `/pacientes/${id}/cirugia`, { token: admin })).datos.procedimientos, c.procedimientos)
      // Deja la cirugía como la esperan las pruebas siguientes: un solo procedimiento.
      await api('PUT', `/pacientes/${id}/cirugia`, { token: admin, cuerpo: { fecha_cirugia: '2023-06-01', procedimientos: [{ procedimiento_id: coartacion, implante: 'NA' }], estado_modulo: 'completo' } })
    })

    it('Módulo 5 exige Módulo 4; Muerte bloquea el Módulo 5 y se revierte', async () => {
      const seg = { fecha_control_cirugia: '2023-06-20', rehabilitacion_cardiaca: 'NO', reingreso_30_dias: 'NO', persona_recibe_llamada: 'Madre', estado_modulo: 'pendiente' }
      const antes = await api('PUT', `/pacientes/${id}/seguimiento`, { token: admin, cuerpo: seg })
      assert.equal(antes.estado, 409)
      assert.equal(antes.datos.error.codigo, 'POSTOPERATORIO_REQUERIDO')

      const pop = { unidad_pop_id: porValor('UNIDAD_POP', 'UCI Pediátrica'), horas_ventilacion_mecanica: 5, complicacion_pop_ids: [porCodigo('COMPLICACION_POP', 'NO')], fecha_salida: '2023-06-08', estado_modulo: 'completo' }
      assert.equal((await api('PUT', `/pacientes/${id}/postoperatorio`, { token: admin, cuerpo: { ...pop, fecha_salida: '2023-05-01' } })).estado, 422)
      const muerte = await api('PUT', `/pacientes/${id}/postoperatorio`, { token: admin, cuerpo: { ...pop, condicion_salida_id: porCodigo('CONDICION_SALIDA', 'MUERTE') } })
      assert.equal(muerte.estado, 200, JSON.stringify(muerte.datos))
      const s1 = (await api('GET', `/pacientes/${id}/seguimiento`, { token: admin })).datos
      assert.equal(s1.no_aplica, true)
      assert.equal(s1.estado_modulo, 'no_aplica')
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: admin, cuerpo: seg })).estado, 422)

      await api('PUT', `/pacientes/${id}/postoperatorio`, { token: admin, cuerpo: { ...pop, condicion_salida_id: porValor('CONDICION_SALIDA', 'Estable') } })
      const s2 = (await api('GET', `/pacientes/${id}/seguimiento`, { token: admin })).datos
      assert.equal(s2.no_aplica, false)
      assert.equal(s2.estado_modulo, 'pendiente')
      const fuera = { ...seg, reingreso_30_dias: 'SI', fecha_reingreso: '2023-08-30', causa_reingreso_id: porValor('CAUSA_REINGRESO', 'Sangrado') }
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: admin, cuerpo: fuera })).estado, 422)
      assert.equal((await api('PUT', `/pacientes/${id}/seguimiento`, { token: admin, cuerpo: seg })).estado, 200)
    })

    it('resumen calcula edad y días; el listado filtra; un eliminado sale del listado y se restaura', async () => {
      const r = (await api('GET', `/pacientes/${id}/resumen`, { token: admin })).datos
      assert.equal(r.estado_m2, 'completo')
      assert.equal(r.dias_hospitalizacion_posqx, 7)
      assert.ok(r.edad_dias > 365)
      const buscar = async (extra = '') => (await api('GET', `/pacientes?busqueda=${encodeURIComponent('prueba ' + sufijo)}${extra}`, { token: admin })).datos
      assert.equal((await buscar()).length, 1)
      assert.equal((await api('PUT', `/pacientes/${id}/eliminado`, { token: admin, cuerpo: { eliminado: true } })).estado, 200)
      // Eliminado: no aparece en el listado normal, sí al pedir los eliminados, y su ficha sigue abriendo.
      assert.equal((await buscar()).length, 0)
      assert.equal((await buscar('&eliminados=1')).length, 1)
      assert.equal((await api('GET', `/pacientes/${id}`, { token: admin })).estado, 200)
      assert.equal((await api('PUT', `/pacientes/${id}/eliminado`, { token: admin, cuerpo: { eliminado: false } })).estado, 200)
      assert.equal((await buscar()).length, 1)
    })

    it('la auditoría registra los cambios con el usuario real', async () => {
      const filas = (await api('GET', '/admin/auditoria?tabla=pacientes', { token: admin })).datos
      const propia = filas.filter((f) => f.registro_id === id)
      assert.ok(propia.some((f) => f.operacion === 'INSERT' && f.usuario_nombre === perfil.nombre_completo))
      assert.ok(propia.some((f) => f.operacion === 'UPDATE' && f.valores_anteriores && f.valores_nuevos))
    })
  })

  it('alertas e indicadores responden con la forma acordada', async () => {
    assert.ok(Array.isArray((await api('GET', '/alertas', { token: admin })).datos))
    const i = (await api('GET', '/indicadores?desde=2000-01-01&hasta=2100-01-01', { token: admin })).datos
    assert.ok(i.resumen.total_cirugias >= 1)
    for (const k of ['por_mes', 'tasas_por_mes', 'por_procedimiento', 'por_rachs', 'por_eps', 'por_procedencia',
      'por_sexo', 'por_peso', 'por_talla', 'por_superficie_corporal', 'por_dias_uci', 'por_horas_vm', 'por_estado_herida']) assert.ok(Array.isArray(i[k]), k)
    // Diagnóstico (principal y adicional) e implante (por procedimiento): un paciente puede contar en varios.
    for (const k of ['por_diagnostico', 'por_implante', 'por_factor_riesgo']) assert.ok(Array.isArray(i[k].conteo) && Number.isInteger(i[k].pacientes), k)
    // Las tasas mensuales suman las mismas cirugías que el total.
    assert.equal(i.tasas_por_mes.reduce((suma, m) => suma + m.total_cirugias, 0), i.resumen.total_cirugias)
    assert.ok(i.tasas_por_mes.every((m) => /^\d{4}-\d{2}$/.test(m.mes)))
    // Las distribuciones por rango traen todos los rangos (también los vacíos) y suman el total de cirugías.
    const sumaPeso = i.por_peso.reduce((suma, r) => suma + r.total_cirugias, 0)
    assert.equal(sumaPeso, i.resumen.total_cirugias)
    // Matriz de resumen: cada variable numérica trae n, mediana, RIC y rango; RACHS trae sus fallecidos.
    for (const k of ['peso', 'talla', 'superficie_corporal', 'dias_uci', 'horas_vm']) {
      for (const medida of ['n', 'promedio', 'mediana', 'q1', 'q3', 'minimo', 'maximo']) assert.ok(medida in i.estadisticas[k], `${k}.${medida}`)
    }
    assert.ok(i.por_rachs.every((r) => Number.isInteger(r.fallecidos) && r.fallecidos <= r.total_cirugias))
    // La dona de la herida agrupa a los mismos pacientes que su distribución.
    const suma = (lista, clave) => lista.reduce((total, x) => total + x[clave], 0)
    assert.equal(suma(i.por_herida_grupo, 'total'), suma(i.por_estado_herida, 'total_cirugias'))
    // Filtro con un clic: el total baja a esos pacientes y el gráfico de su propio campo sigue completo.
    const sexo = i.por_sexo[0]
    const filtros = encodeURIComponent(JSON.stringify([{ campo: 'sexo', valor: sexo.categoria }]))
    const filtrado = (await api('GET', `/indicadores?desde=2000-01-01&hasta=2100-01-01&filtros=${filtros}`, { token: admin })).datos
    assert.equal(filtrado.resumen.total_cirugias, sexo.total_cirugias)
    assert.deepEqual(filtrado.por_sexo, i.por_sexo)
    assert.equal(suma(filtrado.por_peso, 'total_cirugias'), sexo.total_cirugias)
    assert.equal((await api('GET', '/indicadores?desde=2000-01-01&hasta=2100-01-01&filtros=no-es-json', { token: admin })).estado, 400)
    // Matriz de resumen: una fila por paciente operado, con los mismos filtros.
    const { pacientes } = (await api('GET', '/indicadores/pacientes?desde=2000-01-01&hasta=2100-01-01', { token: admin })).datos
    assert.equal(pacientes.length, i.resumen.total_cirugias)
    // Cada fila trae el documento del paciente, para el buscador de la matriz.
    assert.ok(pacientes.every((p) => /^\d+$/.test(p.identificacion)))
    const filtradas = (await api('GET', `/indicadores/pacientes?desde=2000-01-01&hasta=2100-01-01&filtros=${filtros}`, { token: admin })).datos.pacientes
    assert.ok(filtradas.length === sexo.total_cirugias && filtradas.every((p) => p.etiquetas.sexo === sexo.categoria))
    assert.equal((await api('GET', '/indicadores', { token: admin })).estado, 400)
    // Detalle de un indicador: los casos son los que cuenta su tasa, con todos sus datos.
    const casos = (await api('GET', '/indicadores/casos?desde=2000-01-01&hasta=2100-01-01&indicador=mortalidad', { token: admin })).datos
    assert.equal(casos.total, i.resumen.total_cirugias)
    assert.equal(casos.casos.length, i.resumen.fallecidos)
    assert.ok(casos.casos.every((c) => c.fallecido && 'nombre_completo' in c && Array.isArray(c.procedimientos)))
    assert.equal((await api('GET', '/indicadores/casos?desde=2000-01-01&hasta=2100-01-01&indicador=otro', { token: admin })).estado, 400)
    // La matriz en Excel trae todos los campos de los mismos pacientes que la matriz.
    const exportados = (await api('GET', '/indicadores/exportar?desde=2000-01-01&hasta=2100-01-01', { token: admin })).datos.filas
    assert.equal(exportados.length, pacientes.length)
    assert.ok(exportados.every((f) => 'nombre_completo' in f && 'procedimiento_1' in f && 'dias_uci' in f))
  })

  it('adultos: la fecha de la llamada de los 15 días solo va si la llamada se hizo, y no puede ser futura', async () => {
    const r = await api('POST', '/pacientes-adultos', {
      token: admin,
      cuerpo: { nombre_completo: `Paciente Prueba ${sufijo}`, identificacion: `8${sufijo}`, fecha_nacimiento: '1970-03-01', estado_modulo: 'completo' },
    })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    const [episodio] = (await api('GET', `/pacientes-adultos/${r.datos.id}/episodios`, { token: admin })).datos
    const ruta = `/pacientes-adultos/${r.datos.id}/episodios/${episodio.id}`
    assert.equal((await api('PUT', `${ruta}/cirugia`, { token: admin, cuerpo: { fecha_cirugia: '2026-01-05', estado_modulo: 'pendiente' } })).estado, 200)
    const pop = await api('PUT', `${ruta}/postoperatorio`, { token: admin, cuerpo: { fecha_traslado_intermedio: '2026-01-08', fecha_salida: '2026-01-12', condicion_salida_id: porValor('CONDICION_SALIDA', 'Estable'), estado_modulo: 'pendiente' } })
    assert.equal(pop.estado, 200, JSON.stringify(pop.datos))
    const seg = { llamado_15_dias: 'SI', fecha_llamada_15_dias: '2026-01-27', persona_recibe_llamada: 'Hija', reingreso_30_dias: 'NO', estado_modulo: 'pendiente' }
    assert.equal((await api('PUT', `${ruta}/seguimiento`, { token: admin, cuerpo: { ...seg, fecha_llamada_15_dias: '2026-01-10' } })).estado, 422)
    assert.equal((await api('PUT', `${ruta}/seguimiento`, { token: admin, cuerpo: { ...seg, fecha_llamada_15_dias: '2999-01-01' } })).estado, 422)
    assert.equal((await api('PUT', `${ruta}/seguimiento`, { token: admin, cuerpo: seg })).estado, 200)
    assert.equal((await api('GET', `${ruta}/seguimiento`, { token: admin })).datos.fecha_llamada_15_dias, '2026-01-27')
    await api('PUT', `${ruta}/seguimiento`, { token: admin, cuerpo: { ...seg, llamado_15_dias: 'NO' } })
    const sinLlamada = (await api('GET', `${ruta}/seguimiento`, { token: admin })).datos
    assert.equal(sinLlamada.fecha_llamada_15_dias, null)
    assert.equal(sinLlamada.persona_recibe_llamada, null)
    // Los días de UCI y de hospitalización salen de las fechas: 3 días hasta el traslado y 7 hasta la salida.
    const resumen = (await api('GET', `/pacientes-adultos/${r.datos.id}/resumen`, { token: admin })).datos
    assert.equal(resumen.dias_uci, 3)
    assert.equal(resumen.dias_hospitalizacion_posqx, 7)
  })

  it('protege el código de las opciones al editar listas', async () => {
    assert.equal((await api('PATCH', `/admin/listas/opciones/${porCodigo('RIESGOS', 'NINGUNO')}`, { token: admin, cuerpo: { codigo: 'OTRO' } })).estado, 422)
    assert.equal((await api('PATCH', `/admin/listas/opciones/${porCodigo('RIESGOS', 'NINGUNO')}`, { token: admin, cuerpo: { orden: 150 } })).estado, 200)
  })

  it('exportación plana', async () => {
    const filas = (await api('GET', '/exportacion/pacientes', { token: admin })).datos
    assert.ok(filas.length >= 1)
    assert.ok('nombre_completo' in filas[0] && 'procedimiento_1' in filas[0] && 'implante_1' in filas[0] && 'dias_hospitalizacion' in filas[0])
  })
})
