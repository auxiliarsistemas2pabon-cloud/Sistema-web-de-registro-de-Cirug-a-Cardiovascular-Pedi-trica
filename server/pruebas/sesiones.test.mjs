import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { randomUUID, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
if(process.env.SECURITY_TEST_DB!=='1'||process.env.DB_NAME!=='cardio_pruebas')throw new Error('Use la base aislada de pruebas.')
const {pool,una}=await import('../db.mjs')
const {nuevoTotp,cifrarSecreto,crearRecuperacion}=await import('../mfa.mjs')
after(()=>pool.end())
async function call(path,cookie,body){
  const r=await fetch(process.env.API_URL+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie??'','Content-Type':'application/json','X-Cardio-Request':'1','User-Agent':'Mozilla/5.0 Windows Chrome/130.0'},body:body===undefined?undefined:JSON.stringify(body)})
  return{status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().find(c=>!c.includes('Expires='))?.split(';')[0]}
}
async function account(){
  const id=randomUUID(),email=id+'@example.test',secret=nuevoTotp(email).secret.base32,codes=crearRecuperacion(),password='Cc1'+randomBytes(16).toString('hex')
  await pool.query("INSERT INTO usuarios (id,email,nombre_completo,password_hash,rol,clave_temporal,mfa_secret,mfa_recuperacion) VALUES (?,?,'Sesiones ficticias',?,'consulta',false,?,?)",[id,email,await bcrypt.hash(password,4),cifrarSecreto(secret),JSON.stringify(codes.hashes)])
  return{id,email,secret,password,codes:codes.codigos}
}
async function login(u){
  const l=await call('/auth/login',null,{email:u.email,password:u.password})
  assert.equal(l.status,200)
  const m=await call('/auth/mfa/verificar',l.cookie,{codigo:u.codes.shift()})
  assert.equal(m.status,200)
  return m.cookie
}
test('las sesiones solo muestran metadatos propios e identificadores distintos de los hashes',async()=>{
  const a=await account(),b=await account(),sa=await login(a),sb=await login(b)
  const list=await call('/auth/sesiones',sa)
  assert.equal(list.status,200);assert.equal(list.data.length,1);assert.equal(list.data[0].actual,true)
  assert.equal(list.data[0].dispositivo,'Chrome · Windows')
  assert.match(list.data[0].id,/^[a-f0-9-]{36}$/)
  assert.ok(Object.keys(list.data[0]).every(k=>['id','actual','verificada','dispositivo','creado_en','actividad_en','expira_en','limite_en'].includes(k)))
  const hash=(await una(pool,'SELECT token_hash FROM sesiones WHERE usuario_id=?',[a.id])).token_hash
  assert.ok(!JSON.stringify(list.data).includes(hash))
  assert.equal((await call('/auth/sesiones/'+list.data[0].id+'/revocar',sb,{})).status,404)
  assert.equal((await call('/auth/me',sa)).status,200)
  assert.equal((await call('/auth/sesiones',null)).status,401)
  const pending=await call('/auth/login',null,{email:a.email,password:a.password})
  assert.equal((await call('/auth/sesiones',pending.cookie)).status,403)
})
test('cerrar una sesión exige reautenticación y rota la cookie sin prolongar el límite absoluto',async()=>{
  const a=await account();let actual=await login(a);const otra=await login(a)
  const list=(await call('/auth/sesiones',actual)).data,target=list.find(s=>!s.actual)
  await pool.query('UPDATE sesiones SET mfa_verificada_en=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 11 MINUTE) WHERE usuario_id=?',[a.id])
  assert.equal((await call('/auth/sesiones/'+target.id+'/revocar',actual,{})).status,403)
  await pool.query('UPDATE sesiones SET mfa_verificada_en=UTC_TIMESTAMP() WHERE usuario_id=?',[a.id])
  const limite=(await una(pool,'SELECT limite_en FROM sesiones WHERE sesion_id=?',[list.find(s=>s.actual).id])).limite_en
  const closed=await call('/auth/sesiones/'+target.id+'/revocar',actual,{})
  assert.equal(closed.status,200);assert.equal(closed.data.cerradas,1);assert.notEqual(closed.cookie,actual)
  assert.equal((await call('/auth/me',actual)).status,401);actual=closed.cookie
  assert.equal((await call('/auth/me',otra)).status,401)
  assert.equal((await una(pool,'SELECT limite_en FROM sesiones WHERE usuario_id=?',[a.id])).limite_en,limite)
  assert.equal((await call('/auth/sesiones/'+list.find(s=>s.actual).id+'/revocar',actual,{})).status,400)
})
test('cerrar las otras sesiones elimina también desafíos MFA y conserva la sesión actual',async()=>{
  const a=await account(),actual=await login(a),otra=await login(a)
  const pending=await call('/auth/login',null,{email:a.email,password:a.password})
  const r=await call('/auth/sesiones/cerrar-otras',actual,{})
  assert.equal(r.status,200);assert.equal(r.data.cerradas,2)
  for(const cookie of [actual,otra,pending.cookie])assert.equal((await call('/auth/me',cookie)).status,401)
  assert.equal((await call('/auth/me',r.cookie)).status,200)
  assert.equal((await una(pool,'SELECT COUNT(*) n FROM sesiones WHERE usuario_id=?',[a.id])).n,1)
})
