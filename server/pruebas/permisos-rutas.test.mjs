import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { randomUUID, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import * as OTPAuth from 'otpauth'
if(process.env.SECURITY_TEST_DB!=='1'||process.env.DB_NAME!=='cardio_pruebas')throw new Error('Use la base aislada de pruebas.')
const {pool}=await import('../db.mjs')
const {nuevoTotp,cifrarSecreto}=await import('../mfa.mjs')
const {rutasPacientes}=await import('../rutas-pacientes.mjs')
const {rutasPacientesAdultos}=await import('../rutas-pacientes-adultos.mjs')
const {rutasAdmin,rutasListas}=await import('../rutas-admin.mjs')
const {rutasAlertas,rutasIndicadores,rutasExportacion}=await import('../rutas-consultas.mjs')
const {rutasImportaciones}=await import('../rutas-importaciones.mjs')
const groups=[['pacientes',rutasPacientes],['pacientes-adultos',rutasPacientesAdultos],['admin',rutasAdmin],['listas',rutasListas],
  ['alertas',rutasAlertas],['indicadores',rutasIndicadores],['exportacion',rutasExportacion],['importaciones',rutasImportaciones]]
const inventory=groups.flatMap(([group,router])=>router.stack.filter(l=>l.route).flatMap(l=>Object.keys(l.route.methods).map(method=>({group,method,path:'/'+group+(l.route.path==='/'?'':l.route.path)}))))
after(()=>pool.end())
async function call(route,cookie,variant=false){
  let path=route.path.replace(/:[a-zA-Z]+/g,'00000000-0000-4000-8000-000000000001')
  if(variant)path=path.toUpperCase()+'/'
  const method=route.method.toUpperCase()
  return fetch(process.env.API_URL+'/api'+path,{method,headers:{Cookie:cookie??'','Content-Type':'application/json','X-Cardio-Request':'1'},body:['GET','HEAD'].includes(method)?undefined:'{}'})
}
test('el inventario completo de rutas clínicas exige sesión para cada operación',async()=>{
  assert.ok(inventory.length>=45)
  for(const route of inventory){
    const r=await call(route);await r.arrayBuffer()
    assert.equal(r.status,401,route.method+' '+route.path)
  }
  console.log(JSON.stringify({rutas_clinicas_inventariadas:inventory.length}))
})
test('consulta y registro conservan la denegación en cada ruta y variante sensible',async()=>{
  for(const rol of ['consulta','registrador']){
    const id=randomUUID(),email=id+'@example.test',secret=nuevoTotp(email).secret.base32,password='Cc1'+randomBytes(16).toString('hex')
    await pool.query("INSERT INTO usuarios (id,email,nombre_completo,password_hash,rol,clave_temporal,mfa_secret) VALUES (?,?,'Matriz ficticia',?,?,false,?)",[id,email,await bcrypt.hash(password,4),rol,cifrarSecreto(secret)])
    const request=async(path,body,cookie)=>{const r=await fetch(process.env.API_URL+'/api/auth/'+path,{method:'POST',headers:{Cookie:cookie??'','Content-Type':'application/json','X-Cardio-Request':'1'},body:JSON.stringify(body)});await r.arrayBuffer();assert.equal(r.status,200);return r.headers.getSetCookie().find(c=>!c.includes('Expires='))?.split(';')[0]}
    let cookie=await request('login',{email,password})
    cookie=await request('mfa/verificar',{codigo:OTPAuth.TOTP.generate({secret})},cookie)
    for(const route of inventory){
      const sensible=['admin','exportacion','importaciones'].includes(route.group)||route.path.endsWith('/exportar')||route.path.endsWith('/eliminado')
      const escritura=!['get','head'].includes(route.method)
      if(!sensible&&!(rol==='consulta'&&escritura))continue
      for(const variant of [false,true]){
        const r=await call(route,cookie,variant);await r.arrayBuffer()
        assert.equal(r.status,403,rol+' '+route.method+' '+route.path+' variante='+variant)
      }
    }
  }
})
