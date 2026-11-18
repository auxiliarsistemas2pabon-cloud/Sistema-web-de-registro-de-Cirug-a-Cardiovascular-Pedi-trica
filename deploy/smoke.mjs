import assert from 'node:assert/strict'
import https from 'node:https'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, rmSync, lstatSync, existsSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, basename, sep } from 'node:path'
import * as OTPAuth from 'otpauth'
import { instancePaths, root, docker, compose, loadInstance, ensureStorage, writeEnv } from './lib.mjs'
import { inspectDeployment } from './preflight.mjs'

const id = 'prueba-' + randomBytes(6).toString('hex')
const nuevaClaveFicticia = 'Cc1' + randomBytes(16).toString('hex')
const file = instancePaths(id)
let s, started = false
const freePort = async () => {
  const server = createServer(); await new Promise((r) => server.listen(0,'127.0.0.1',r))
  const port = server.address().port; await new Promise((r) => server.close(r)); return String(port)
}
const pause = (ms) => new Promise((r) => setTimeout(r,ms))
let ca
async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return new Promise((ok, fail) => {
    const req = https.request({ host: '127.0.0.1', port: Number(s.env.HTTPS_PORT), servername: s.env.APP_DOMAIN, ca, method, path, agent:false,
      headers: { Host: `${s.env.APP_DOMAIN}:${s.env.HTTPS_PORT}`, ...(body !== undefined ? { 'Content-Type':'application/json', 'X-Cardio-Request':'1', Origin:s.env.APP_ORIGIN } : {}),
        ...(cookie ? {Cookie:cookie} : {}), ...headers }, timeout:10000 }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data',(c)=>text+=c)
      res.on('end',()=>{ const c=(res.headers['set-cookie']??[]).find(v=>!v.includes('Expires=')); ok({status:res.statusCode,text,
        json:()=>JSON.parse(text),cookie:c?.split(';')[0],setCookie:c,headers:res.headers}) })
    })
    req.on('error',fail); req.on('timeout',()=>req.destroy(new Error('Tiempo de espera agotado.')))
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
async function waitApi(){
  for(let i=0;i<40;i++){
    try{if((await request('/api/salud')).status===200)return}catch{}
    await pause(500)
  }
  throw new Error('El proxy no entregó la API después de arrancar.')
}
function allowDesktopGateway(){
  const proxyId=compose(s,['ps','-q','proxy']).trim()
  const info=JSON.parse(docker(['inspect',proxyId]))[0]
  const entrada=Object.entries(info.NetworkSettings.Networks).find(([name])=>name.endsWith('_entrada'))[1]
  s.env.CLINIC_CIDRS=`127.0.0.1/32 ${entrada.Gateway}/32`
  writeEnv(s.envFile,s.env);compose(s,['up','-d','proxy'])
}
try {
  const preparar = spawnSync(process.execPath,['deploy/prepare.mjs',`--instance=${id}`,'--domain=cirugia.localhost',`--http=${await freePort()}`,`--https=${await freePort()}`,'--email=admin@example.test'],
    {cwd:root,windowsHide:true,stdio:'pipe'})
  assert.equal(preparar.status,0)
  s=loadInstance(id); inspectDeployment(s); started=true; ensureStorage(s)
  compose(s,['up','-d','--wait','mysql'])
  compose(s,['run','--rm','--no-deps','migrate'])
  compose(s,['up','-d','--wait','app','proxy'])
  allowDesktopGateway()
  for(let i=0;i<30;i++) {
    try { ca=compose(s,['exec','-T','proxy','cat','/data/caddy/pki/authorities/local/root.crt']); if(ca.includes('BEGIN CERTIFICATE'))break } catch {}
    await pause(500)
  }
  let salud
  for(let i=0;i<30;i++){try{salud=await request('/api/salud');if(salud.status===200)break}catch{}await pause(500)}
  assert.equal(salud?.status,200,'El proxy HTTPS debe entregar la API con certificado válido.')
  assert.equal((await request('/login')).status,200)
  assert.equal((await request('/_health/ready')).status,404)
  assert.equal((await request('/_HEALTH/LIVE/')).status,404)
  const appId=compose(s,['ps','-q','app']).trim()
  const app=JSON.parse(docker(['inspect',appId]))[0]
  assert.ok(!app.HostConfig.PortBindings || !Object.keys(app.HostConfig.PortBindings).length)
  assert.equal(compose(s,['exec','-T','app','node','-p','process.getuid()']).trim(),'1000')
  assert.equal(compose(s,['exec','-T','mysql','id','-u']).trim(),'999')
  const dbInfo=JSON.parse(docker(['inspect',compose(s,['ps','-q','mysql']).trim()]))[0]
  assert.equal(dbInfo.HostConfig.ReadonlyRootfs,true)
  assert.equal(dbInfo.HostConfig.CapAdd?.length??0,0)
  const isolated=compose(s,['exec','-T','app','node','-e',`const fs=require('fs');for(const p of ['/app/.env','/app/.git','/app/.local-secrets','/app/deploy/private','/app/docs','/app/server/pruebas','/run/secrets/mysql_root_password'])if(fs.existsSync(p))process.exit(2);try{fs.writeFileSync('/app/probe','x');process.exit(3)}catch(e){if(e.code!=='EROFS'&&e.code!=='EACCES')throw e};console.log('ok')`]).trim()
  assert.equal(isolated,'ok')
  const password=readFileSync(resolve(s.secrets,'bootstrap_password'),'utf8').trim()
  let r=await request('/api/auth/login',{method:'POST',body:{email:s.env.INITIAL_ADMIN_EMAIL,password}})
  assert.equal(r.status,200); assert.equal(r.json().paso,'clave')
  assert.match(r.setCookie,/^__Host-cardio_session=/); assert.match(r.setCookie,/; Secure/); assert.match(r.setCookie,/; HttpOnly/)
  let cookie=r.cookie
  assert.equal((await request('/api/pacientes',{cookie})).status,403)
  r=await request('/api/auth/clave',{method:'POST',cookie,body:{password_actual:password,password_nueva:nuevaClaveFicticia}})
  assert.equal(r.status,200);cookie=r.cookie
  r=await request('/api/auth/mfa/enrolar',{method:'POST',cookie,body:{}});assert.equal(r.status,200)
  const token=OTPAuth.TOTP.generate({secret:r.json().secreto})
  r=await request('/api/auth/mfa/activar',{method:'POST',cookie,body:{codigo:token}});assert.equal(r.status,200);cookie=r.cookie
  const recovery=r.json().codigos_recuperacion[0]
  assert.equal((await request('/api/pacientes',{cookie})).status,200)
  assert.equal((await request('/api/auth/logout',{method:'POST',cookie,body:{},headers:{Origin:'https://ajeno.localhost'}})).status,403)
  assert.equal((await request('/api/auth/logout',{method:'POST',cookie,body:{}})).status,204)
  assert.equal((await request('/api/pacientes',{cookie})).status,401)
  console.log('HTTPS, inscripción MFA, permisos y revocación verificados con cuenta ficticia.')
  // Un error del proxy tampoco debe registrar búsquedas o encabezados clínicos.
  compose(s,['stop','app'])
  assert.equal((await request('/api/pacientes?busqueda=MARCADOR_PRIVADO_PRUEBA')).status,502)
  const logs=compose(s,['logs','proxy'])
  assert.ok(!logs.includes('MARCADOR_PRIVADO_PRUEBA'),'El proxy debe eliminar la solicitud de sus errores.')
  compose(s,['up','-d','--wait','app'])
  const permitted=s.env.CLINIC_CIDRS
  s.env.CLINIC_CIDRS='10.255.255.255/32';writeEnv(s.envFile,s.env);compose(s,['up','-d','proxy'])
  await pause(1500)
  assert.equal((await request('/api/salud',{headers:{'X-Forwarded-For':'10.255.255.255','X-Real-IP':'10.255.255.255'}})).status,403)
  s.env.CLINIC_CIDRS=permitted;writeEnv(s.envFile,s.env);compose(s,['up','-d','proxy'])
  // El comando real de actualización crea y restaura un respaldo antes de migrar.
  const update=spawnSync(process.execPath,['deploy/ops.mjs','up',`--instance=${id}`],{cwd:root,windowsHide:true,encoding:'utf8'})
  if(update.status!==0)throw new Error(update.stderr||'Falló la actualización repetida.')
  await waitApi()
  console.log('Actualización con respaldo cifrado y restauración aislada verificada.')
  const backup=resolve(s.backups,readdirSync(s.backups).find((p)=>p.endsWith('.sql.gz.aes')))
  const corrupted=backup.replace('.sql.gz.aes','-alterado.sql.gz.aes'), bytes=readFileSync(backup)
  bytes[25]^=1;writeFileSync(corrupted,bytes,{mode:0o600});copyFileSync(backup.replace('.sql.gz.aes','.config.aes'),corrupted.replace('.sql.gz.aes','.config.aes'))
  const verify=spawnSync(process.execPath,['deploy/ops.mjs','verify-backup',`--instance=${id}`,`--file=${corrupted}`],{cwd:root,windowsHide:true,encoding:'utf8'})
  assert.notEqual(verify.status,0,'Un respaldo alterado debe rechazarse antes de ejecutar SQL.')
  const restore=()=>spawnSync(process.execPath,['deploy/ops.mjs','restore-empty',`--instance=${id}`,`--file=${backup}`],{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,DEPLOY_TEST_DIAGNOSTICS:'1'}})
  assert.notEqual(restore().status,0,'La recuperación debe rechazar un destino con datos.')
  assert.equal((await request('/api/salud')).status,200)
  // Simula pérdida total únicamente de los volúmenes ficticios que creó esta prueba.
  compose(s,['down','--remove-orphans'])
  for(const volume of [`${s.env.STACK_NAME}_mysql_data`,`${s.env.STACK_NAME}_caddy_data`]){
    const info=JSON.parse(docker(['volume','inspect',volume]))[0]
    assert.equal(info.Labels?.['cirugia.deploy.instance'],s.env.STACK_NAME)
    docker(['volume','rm',volume])
  }
  const restored=restore();if(restored.status!==0)throw new Error(restored.stderr||'Falló la recuperación en destino vacío.')
  // Al recrear las redes, Docker Desktop puede asignar otra pasarela a este entorno ficticio.
  allowDesktopGateway()
  await waitApi()
  assert.equal(compose(s,['exec','-T','proxy','cat','/data/caddy/pki/authorities/local/root.crt']).trim(),ca.trim())
  r=await request('/api/auth/login',{method:'POST',body:{email:s.env.INITIAL_ADMIN_EMAIL,password:nuevaClaveFicticia}})
  assert.equal(r.status,200);assert.equal(r.json().paso,'mfa');cookie=r.cookie
  r=await request('/api/auth/mfa/verificar',{method:'POST',cookie,body:{codigo:recovery}})
  assert.equal(r.status,200)
  assert.equal((await request('/api/pacientes',{cookie:r.cookie})).status,200)
  console.log(JSON.stringify({despliegue_aislado_verificado:true,https_y_cadena_validos:true,mfa_obligatorio:true,
    filtros_red_anti_suplantacion:true,app_no_root_y_solo_lectura:true,sin_secretos_en_imagen:true,migracion_repetible:true,
    mysql_sin_root:true,registros_sin_busquedas:true,respaldo_alterado_rechazado:true,recuperacion_completa_ca_mfa:true,respaldo_y_restauracion_verificados:true}))
} catch(e) {
  if(s&&started){
    console.error(compose(s,['ps']).trim())
    console.error(compose(s,['logs','--tail','30','app','proxy','mysql']).trim())
  }
  console.error(e.status !== undefined ? String(e.stderr??'Falló el entorno de prueba.') : e.message)
  process.exitCode=1
} finally {
  if(s&&started){
    try {compose(s,['down','--remove-orphans'])}catch{process.exitCode=1}
    for(const volume of [`${s.env.STACK_NAME}_mysql_data`,`${s.env.STACK_NAME}_caddy_data`]){
      try{const v=JSON.parse(docker(['volume','inspect',volume]))[0];if(v.Labels?.['cirugia.deploy.instance']===s.env.STACK_NAME)docker(['volume','rm',volume])}catch{process.exitCode=1}
    }
  }
  // La limpieza solo acepta la carpeta temporal creada por esta prueba, dentro de deploy/private.
  const parent=realpathSync(resolve(root,'deploy/private'))
  if(existsSync(file.directory)&&/^prueba-[a-f0-9]{12}$/.test(id)&&!lstatSync(file.directory).isSymbolicLink()){
    const target=realpathSync(file.directory)
    if(target.startsWith(parent+sep)&&basename(target)===id)rmSync(target,{recursive:true,force:true})
  }
}
