import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import * as OTPAuth from 'otpauth'
if (process.env.SECURITY_TEST_DB !== '1' || process.env.DB_NAME !== 'cardio_pruebas') throw new Error('Use la base aislada de pruebas.')
const { pool, una } = await import('../db.mjs')
const { nuevoTotp, cifrarSecreto } = await import('../mfa.mjs')
const base = process.env.API_URL + '/api'
let cookie
async function pedir(ruta, body) {
  const r = await fetch(base + ruta, { method: 'POST', headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json', 'X-Cardio-Request': '1' }, body: JSON.stringify(body) })
  return { estado: r.status, datos: await r.json(), cookie: r.headers.getSetCookie().find((c) => !c.includes('Expires='))?.split(';')[0] }
}
before(async () => {
  const id = randomUUID(), email = id + '@example.test', secreto = nuevoTotp(email).secret.base32
  await pool.query("INSERT INTO usuarios (id,email,nombre_completo,password_hash,rol,clave_temporal,mfa_secret) VALUES (?,?,'Importación de prueba',?,'administrador',false,?)",
    [id, email, await bcrypt.hash('PruebaImportacion123', 4), cifrarSecreto(secreto)])
  cookie = (await pedir('/auth/login', { email, password: 'PruebaImportacion123' })).cookie
  const verificada = await pedir('/auth/mfa/verificar', { codigo: OTPAuth.TOTP.generate({ secret: secreto }) })
  assert.equal(verificada.estado, 200); cookie = verificada.cookie
})
after(async () => pool.end())
async function lote(identificacion, nombre = 'Ficticio importación') {
  return pedir('/importaciones/lotes', { archivo_nombre: 'ficticio.xlsx', filas: [{ numero_fila: 2, estado: 'valido',
    datos_normalizados: { paciente: { nombre_completo: nombre, identificacion, fecha_nacimiento: '2020-01-01', sin_telefono: true } } }] })
}
test('aplicar simultáneamente una misma fila es idempotente y conserva su estado importado', async () => {
  const identificacion = '8' + Date.now() + randomBytes(2).readUInt16BE().toString()
  const l = await lote(identificacion); assert.equal(l.estado, 201)
  const ruta = `/importaciones/filas/${l.datos.filas[0].id}/aplicar`
  const resultados = await Promise.all([pedir(ruta, {}), pedir(ruta, {}), pedir(ruta, {})])
  assert.ok(resultados.every((r) => r.estado === 200), JSON.stringify(resultados))
  assert.equal(new Set(resultados.map((r) => r.datos.paciente_id)).size, 1)
  assert.equal((await una(pool, 'SELECT COUNT(*) AS n FROM pacientes WHERE identificacion = ?', [identificacion])).n, 1)
  const otra = await pedir(ruta, {}); assert.equal(otra.estado, 200)
  assert.equal((await una(pool, 'SELECT estado FROM importaciones_filas WHERE id = ?', [l.datos.filas[0].id])).estado, 'importado')
})
test('dos archivos concurrentes no duplican el mismo documento y cirugía', async () => {
  const identificacion = '9' + Date.now() + randomBytes(2).readUInt16BE().toString()
  const a = await lote(identificacion), b = await lote(identificacion)
  const r = await Promise.all([a,b].map((l) => pedir(`/importaciones/filas/${l.datos.filas[0].id}/aplicar`, {})))
  assert.deepEqual(r.map((x) => x.estado).sort(), [200,409])
  assert.equal((await una(pool, 'SELECT COUNT(*) AS n FROM pacientes WHERE identificacion = ?', [identificacion])).n, 1)
})
test('rechaza objetos como identificación sin interpolarlos en consultas', async () => {
  const l = await lote({ identificacion: '1' })
  assert.equal(l.estado, 400)
  assert.equal(l.datos.error.codigo, 'VALIDACION')
})
test('rechaza lotes manipulados sin dejar filas o lotes parciales', async()=>{
  const antes=(await una(pool,'SELECT COUNT(*) n FROM importaciones_lote')).n
  const fila={numero_fila:2,estado:'valido',datos_normalizados:{paciente:{identificacion:'123',nombre_completo:'Ficticio'}}}
  for(const body of [
    {archivo_nombre:'../secretos.xlsx',filas:[fila]}, {archivo_nombre:'x\n.xlsx',filas:[fila]},
    {archivo_nombre:'x.xlsx',filas:Array(5001).fill(fila)}, {archivo_nombre:'x.xlsx',filas:[fila,fila]},
    {archivo_nombre:'x.xlsx',filas:[{...fila,numero_fila:-1}]},
    {archivo_nombre:'x.xlsx',filas:[{...fila,errores:{length:3}}]},
    {archivo_nombre:'x.xlsx',filas:[{...fila,datos_normalizados:{paciente:[],rol:'administrador'}}]},
    {archivo_nombre:'x.xlsx',filas:[{...fila,datos_originales:{observaciones:'x'.repeat(140000)}}]},
  ])assert.equal((await pedir('/importaciones/lotes',body)).estado,400)
  assert.equal((await una(pool,'SELECT COUNT(*) n FROM importaciones_lote')).n,antes)
})
test('no acepta prototipos, profundidad excesiva ni cuerpos de más de 15 MB',async()=>{
  const headers={Cookie:cookie,'Content-Type':'application/json','X-Cardio-Request':'1'}
  for(const body of ['{"__proto__":{"admin":true}}',JSON.stringify({datos:JSON.parse('{"a":'.repeat(20)+'0'+'}'.repeat(20))}), '[]']){
    assert.equal((await fetch(base+'/importaciones/lotes',{method:'POST',headers,body})).status,400)
  }
  assert.equal((await fetch(base+'/importaciones/lotes',{method:'POST',headers,body:JSON.stringify({datos:'x'.repeat(16*1024*1024)})})).status,413)
  assert.equal((await pedir('/importaciones/identificaciones-existentes',{identificaciones:[]})).estado,200)
  assert.equal({}.admin,undefined)
})
test('una fecha manipulada revierte la ficha completa y las escrituras de módulos',async()=>{
  const identificacion='7'+Date.now()
  const r=await pedir('/importaciones/lotes',{archivo_nombre:'ficticio.xlsx',filas:[{numero_fila:2,estado:'valido',datos_normalizados:{paciente:{identificacion,nombre_completo:'Ficticio',fecha_nacimiento:'2020-01-01',sin_telefono:true},cirugia:{fecha_cirugia:'2026-02-31'}}}]})
  assert.equal(r.estado,201)
  assert.equal((await pedir('/importaciones/filas/'+r.datos.filas[0].id+'/aplicar',{})).estado,400)
  assert.equal((await una(pool,'SELECT COUNT(*) n FROM pacientes WHERE identificacion=?',[identificacion])).n,0)
})
