import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import * as OTPAuth from 'otpauth'
if(process.env.SECURITY_TEST_DB!=='1'||process.env.DB_NAME!=='cardio_pruebas')throw new Error('La carga solo se ejecuta en la base aislada.')
const url=new URL(process.env.API_URL)
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.port)throw new Error('La carga requiere un servidor efímero en loopback.')
const {pool,una}=await import('../db.mjs')
after(()=>pool.end())
async function request(path,body,cookie){
  const start=performance.now()
  const r=await fetch(process.env.API_URL+'/api'+path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(15000),headers:{Cookie:cookie??'','Content-Type':'application/json','X-Cardio-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)})
  return{status:r.status,data:await r.json(),ms:performance.now()-start,cookie:r.headers.getSetCookie().find(c=>!c.includes('Expires='))?.split(';')[0]}
}
test('80 solicitudes concurrentes reciben contrapresión acotada y el servicio se recupera',async()=>{
  const login=await request('/auth/login',{email:'admin@example.test',password:'PruebaSegura123'})
  const mfa=await request('/auth/mfa/verificar',{codigo:OTPAuth.TOTP.generate({secret:process.env.TEST_MFA_SECRET})},login.cookie)
  assert.equal(mfa.status,200)
  const own=await una(pool,"SELECT s.token_hash FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE u.email='admin@example.test' AND s.mfa_verificada=true")
  const connection=await pool.getConnection(),times=monitorEventLoopDelay({resolution:20})
  times.enable()
  let released=false,timer
  try{
    await connection.beginTransaction()
    await connection.query('SELECT token_hash FROM sesiones WHERE token_hash=? FOR UPDATE',[own.token_hash])
    timer=setTimeout(()=>{connection.rollback().then(()=>{released=true})},1000)
    const results=await Promise.all(Array.from({length:80},()=>request('/auth/me',undefined,mfa.cookie)))
    assert.ok(results.every(r=>[200,503].includes(r.status)))
    assert.ok(results.some(r=>r.status===503),'Debe comprobarse la cola saturada, no solo el camino rápido.')
    for(const r of results.filter(r=>r.status===503))assert.equal(r.data.error.codigo,'SERVICIO_OCUPADO')
    for(let i=0;i<10;i++)assert.equal((await request('/auth/me',undefined,mfa.cookie)).status,200)
    const sorted=results.map(r=>r.ms).sort((a,b)=>a-b)
    console.log(JSON.stringify({ensayo_aislado:true,concurrencia:80,correctas:results.filter(r=>r.status===200).length,
      rechazadas_controladas:results.filter(r=>r.status===503).length,p95_ms:Math.round(sorted[Math.floor(sorted.length*.95)]),recuperacion_verificada:true}))
  }finally{clearTimeout(timer);if(!released)await connection.rollback();connection.release();times.disable()}
})
test('la ráfaga de solicitudes anónimas queda limitada con 429 sin tocar datos clínicos',async()=>{
  let limited=0
  for(let batch=0;batch<13;batch++){
    const result=await Promise.all(Array.from({length:100},()=>request('/salud')))
    assert.ok(result.every(r=>[200,429].includes(r.status)))
    limited+=result.filter(r=>r.status===429).length
  }
  assert.ok(limited>0)
  console.log(JSON.stringify({solicitudes_sin_autenticacion:1300,respuestas_429:limited}))
})
