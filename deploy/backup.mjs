import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { createReadStream, createWriteStream, writeFileSync, readFileSync, appendFileSync, statSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { docker, compose, composeArgs, configInstance, protectDirectory } from './lib.mjs'

const completion=(child)=>new Promise((ok,fail)=>{child.on('error',fail);child.on('close',(code)=>code===0?ok():fail(new Error('Falló la herramienta de respaldo o restauración.')))})
const pause=(ms)=>new Promise((r)=>setTimeout(r,ms))
const keyFor=(s)=>{
  const v=readFileSync(resolve(s.secrets,'backup_key'),'utf8').trim()
  if(!/^[a-f0-9]{64}$/i.test(v))throw new Error('Clave de respaldo no válida.')
  return Buffer.from(v,'hex')
}
async function digest(path){const hash=createHash('sha256');for await(const c of createReadStream(path))hash.update(c);return hash.digest('hex')}
function cipher(key){const iv=randomBytes(12);return{iv,c:createCipheriv('aes-256-gcm',key,iv)}}
function writeConfig(path,key,config){
  const {iv,c}=cipher(key), body=Buffer.concat([c.update(JSON.stringify(config)),c.final()])
  writeFileSync(path,Buffer.concat([Buffer.from('CCVPCF01'),iv,c.getAuthTag(),body]),{mode:0o600,flag:'wx'})
}
function readConfig(path,key){
  const b=readFileSync(path)
  if(b.subarray(0,8).toString()!=='CCVPCF01')throw new Error('Formato de configuración cifrada no válido.')
  const d=createDecipheriv('aes-256-gcm',key,b.subarray(8,20));d.setAuthTag(b.subarray(20,36))
  return JSON.parse(Buffer.concat([d.update(b.subarray(36)),d.final()]).toString('utf8'))
}
export async function createBackup(s){
  protectDirectory(s.backups)
  const key=keyFor(s), file=resolve(s.backups,`cirugia-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.sql.gz.aes`)
  const {iv,c}=cipher(key)
  writeFileSync(file,Buffer.concat([Buffer.from('CCVPRD01'),iv]),{mode:0o600,flag:'wx'})
  const p=spawn('docker',composeArgs(s,['run','--rm','--no-deps','-T','backup']),{windowsHide:true,stdio:['ignore','pipe','pipe']})
  p.stderr.resume()
  await Promise.all([completion(p),pipeline(p.stdout,createGzip(),c,createWriteStream(file,{flags:'a'}))])
  appendFileSync(file,c.getAuthTag())
  const mfa=readFileSync(resolve(s.secrets,'mfa_key'),'utf8').trim()
  const ca=docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--mount',`type=volume,source=${s.env.STACK_NAME}_caddy_data,target=/data,readonly`,'--entrypoint','tar',configInstance(s).services.proxy.image,
    '-C','/data','-czf','-','caddy/pki'],{encoding:null,maxBuffer:4*1024*1024})
  writeConfig(file.replace(/\.sql\.gz\.aes$/,'.config.aes'),key,{version:1,stack:s.env.STACK_NAME,mfa_key:mfa,caddy_pki:ca.toString('base64'),sql_sha256:await digest(file)})
  return file
}
export async function verifyBackup(s,path){
  const file=resolve(path), key=keyFor(s), size=statSync(file).size
  if(!file.endsWith('.sql.gz.aes')||size<37)throw new Error('Seleccione un archivo .sql.gz.aes válido.')
  const fd=openSync(file,'r'), header=Buffer.alloc(20),tag=Buffer.alloc(16)
  try{readSync(fd,header,0,20,0);readSync(fd,tag,0,16,size-16)}finally{closeSync(fd)}
  if(header.subarray(0,8).toString()!=='CCVPRD01')throw new Error('Formato de respaldo no válido.')
  const decrypt=()=>{const d=createDecipheriv('aes-256-gcm',key,header.subarray(8));d.setAuthTag(tag);return d}
  // Primera pasada de autenticación: no se ejecuta SQL antes de comprobar el archivo completo.
  const auth=decrypt();for await(const c of createReadStream(file,{start:20,end:size-17}))auth.update(c);auth.final()
  const config=readConfig(file.replace(/\.sql\.gz\.aes$/,'.config.aes'),key)
  if(config.stack!==s.env.STACK_NAME||config.sql_sha256!==await digest(file)||!/^[a-f0-9]{64}$/i.test(config.mfa_key??''))throw new Error('El SQL y su configuración no pertenecen al mismo respaldo.')
  const id=randomBytes(6).toString('hex'), container=`cirugia-restore-${id}`, passwordFile=resolve(s.directory,`restore-${id}.secret`)
  writeFileSync(passwordFile,randomBytes(32).toString('hex'),{mode:0o444,flag:'wx'})
  let created=false
  try{
    const image=configInstance(s).services.mysql.image
    docker(['run','--rm','-d','--name',container,'--label',`cirugia.restore.test=${id}`,'--network','none',
      '--mount',`type=bind,source=${passwordFile},target=/run/secrets/root_password,readonly`,'-e','MYSQL_ROOT_PASSWORD_FILE=/run/secrets/root_password',
      '-e','MYSQL_DATABASE=cardio_restore','--tmpfs','/var/lib/mysql:rw,size=1g',image]);created=true
    let ready=false
    for(let i=0;i<60;i++){
      try{docker(['exec',container,'mysqladmin','ping','-h','127.0.0.1']);ready=true;break}catch{await pause(1000)}
    }
    if(!ready)throw new Error('La base temporal de restauración no arrancó.')
    const p=spawn('docker',['exec','-i',container,'sh','-ec','export MYSQL_PWD="$(cat /run/secrets/root_password)"; exec mysql --no-defaults --user=root cardio_restore'],{windowsHide:true,stdio:['pipe','ignore','pipe']})
    p.stderr.resume()
    await Promise.all([completion(p),pipeline(createReadStream(file,{start:20,end:size-17}),decrypt(),createGunzip(),p.stdin)])
    const query=(sql)=>docker(['exec','-i',container,'sh','-ec','export MYSQL_PWD="$(cat /run/secrets/root_password)"; exec mysql --no-defaults --user=root -N -B cardio_restore'],{input:sql}).trim()
    const tables=Number(query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='cardio_restore';"))
    if(tables<31)throw new Error('La restauración no contiene las tablas esperadas.')
    const seed=query('SELECT mfa_secret FROM usuarios WHERE mfa_secret IS NOT NULL LIMIT 1;')
    let mfaChecked=false
    if(seed){
      const [iv,t,b]=seed.split('.').map((v)=>Buffer.from(v,'base64url'))
      const d=createDecipheriv('aes-256-gcm',Buffer.from(config.mfa_key,'hex'),iv);d.setAuthTag(t)
      const secret=Buffer.concat([d.update(b),d.final()]).toString('utf8')
      if(!/^[A-Z2-7]+$/.test(secret))throw new Error('La clave MFA de restauración no corresponde a las cuentas.')
      mfaChecked=true
    }
    return{restauracion_aislada_verificada:true,tablas:tables,configuracion_mfa_verificada:mfaChecked,configuracion_ca_incluida:Boolean(config.caddy_pki)}
  }finally{
    try{
      if(created){const info=JSON.parse(docker(['inspect',container]))[0];if(info.Config.Labels?.['cirugia.restore.test']===id)docker(['stop','--timeout','5',container])}
    }finally{unlinkSync(passwordFile)}
  }
}

export async function recoverConfiguration(s,path){
  await verifyBackup(s,path)
  const c=readConfig(resolve(path).replace(/\.sql\.gz\.aes$/,'.config.aes'),keyFor(s))
  const archive=Buffer.from(c.caddy_pki,'base64')
  const image=configInstance(s).services.proxy.image
  const args=['run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--entrypoint','tar',image]
  const entries=docker([...args,'-tzf','-'],{input:archive}).trim().split('\n')
  const details=docker([...args,'-tvzf','-'],{input:archive}).trim().split('\n')
  if(entries.some((p)=>!p.startsWith('caddy/pki/')||p.split('/').includes('..'))||details.some((p)=>!['-','d'].includes(p[0])))throw new Error('El archivo de certificados contiene entradas no permitidas.')
  const directory=resolve(s.directory,'recovery-'+randomBytes(6).toString('hex'));protectDirectory(directory)
  const mfa=resolve(directory,'mfa_key'),ca=resolve(directory,'caddy-pki.tar.gz')
  writeFileSync(mfa,c.mfa_key+'\n',{mode:0o444,flag:'wx'});writeFileSync(ca,archive,{mode:0o600,flag:'wx'})
  return{directorio_privado:directory,clave_mfa:mfa,archivo_ca:ca,aplicado:false,
    siguiente:'Con los servicios detenidos, el operador puede recuperar estos archivos según la guía. No se sobrescriben claves activas.'}
}

// Recuperación deliberadamente limitada a un destino vacío: nunca borra una base existente.
export async function restoreEmpty(s,path){
  const estado=JSON.parse(compose(s,['run','--rm','--no-deps','migrate','node','deploy/provision.mjs','--check-only']))
  if(estado.tablas!==0)throw new Error('La restauración requiere una base vacía; se conserva el destino existente.')
  const configImage=configInstance(s).services.proxy.image
  try{
    docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
      '--mount',`type=volume,source=${s.env.STACK_NAME}_caddy_data,target=/data,readonly`,'--entrypoint','sh',configImage,'-ec','test ! -e /data/caddy/pki'])
  }catch{throw new Error('La recuperación requiere un volumen de certificados accesible y sin PKI inicializada.')}
  const recovered=await recoverConfiguration(s,path)
  if(readFileSync(recovered.clave_mfa,'utf8').trim()!==readFileSync(resolve(s.secrets,'mfa_key'),'utf8').trim())throw new Error('La clave MFA del destino no coincide con el respaldo. Recupérela antes de iniciar servicios.')
  compose(s,['stop','app','proxy'])
  const file=resolve(path),size=statSync(file).size,b=Buffer.alloc(20),tag=Buffer.alloc(16),fd=openSync(file,'r')
  try{readSync(fd,b,0,20,0);readSync(fd,tag,0,16,size-16)}finally{closeSync(fd)}
  const d=createDecipheriv('aes-256-gcm',keyFor(s),b.subarray(8));d.setAuthTag(tag)
  const p=spawn('docker',composeArgs(s,['exec','-T','mysql','sh','-ec',
    'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysql --no-defaults --user=root "$MYSQL_DATABASE"']),{windowsHide:true,stdio:['pipe','ignore','pipe']})
  p.stderr.resume()
  await Promise.all([completion(p),pipeline(createReadStream(file,{start:20,end:size-17}),d,createGunzip(),p.stdin)])
  docker(['run','--rm','-i','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--mount',`type=volume,source=${s.env.STACK_NAME}_caddy_data,target=/data`,'--entrypoint','tar',configImage,
    '-C','/data','-xzf','-'],{input:readFileSync(recovered.archivo_ca)})
  compose(s,['run','--rm','--no-deps','migrate'])
  compose(s,['up','-d','--wait','app','proxy'])
  return{restauracion_en_destino_vacio:true,sesiones_previas_revocadas:true,ca_y_mfa_recuperados:true}
}
