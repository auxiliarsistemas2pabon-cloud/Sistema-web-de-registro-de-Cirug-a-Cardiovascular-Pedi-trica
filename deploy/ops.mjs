import { resolve } from 'node:path'
import { writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { loadInstance, compose, ensureStorage, parseOptions } from './lib.mjs'
import { X509Certificate } from 'node:crypto'
import { createBackup, verifyBackup, recoverConfiguration, restoreEmpty } from './backup.mjs'
import { inspectDeployment } from './preflight.mjs'

let lock
try {
  const action = process.argv[2] || 'check', o = parseOptions(process.argv.slice(3))
  if(Object.keys(o).some((k)=>!['instance','file','backup'].includes(k)))throw new Error('Opción no reconocida.')
  const s = loadInstance(o.instance || 'clinica')
  inspectDeployment(s)
  if(['up','stop','backup','restore-empty','recover-config'].includes(action)) {
    const file=resolve(s.directory,'operation.lock')
    try { const fd=openSync(file,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);lock=file }
    catch { throw new Error('Otra operación administra esta instancia. Si quedó un bloqueo tras un fallo, revise el proceso indicado en operation.lock antes de retirarlo.') }
  }
  if (action === 'check') console.log(JSON.stringify(inspectDeployment(s), null, 2))
  else if (action === 'up') {
    ensureStorage(s)
    if(!compose(s,['ps','--status','running','-q','mysql']).trim())compose(s,['up','-d','--wait','mysql'])
    const estado = JSON.parse(compose(s,['run','--rm','--no-deps','migrate','node','deploy/provision.mjs','--check-only']))
    compose(s,['stop','app','proxy'])
    if (estado.tablas > 0) {
      try{
        const respaldo = o.backup || await createBackup(s)
        const verificado = await verifyBackup(s,respaldo)
        console.log(JSON.stringify({respaldo_previo:respaldo,...verificado}))
      }catch(error){
        compose(s,['start','app','proxy'])
        throw error
      }
    }
    // Las migraciones se realizan con el servicio detenido y con secretos exclusivos del job.
    compose(s,['up','-d','--wait','mysql'])
    compose(s,['run','--rm','--no-deps','migrate'])
    compose(s,['up','-d','--wait','app','proxy'])
    console.log(`Servicios iniciados en ${s.env.APP_ORIGIN}. Instale la CA interna en los equipos autorizados.`)
  } else if (action === 'status') console.log(compose(s,['ps']))
  else if (action === 'stop') { compose(s,['stop']); console.log('Servicios detenidos; los volúmenes se conservan.') }
  else if (action === 'ca') {
    const cert = compose(s,['exec','-T','proxy','cat','/data/caddy/pki/authorities/local/root.crt'])
    if (!cert.includes('BEGIN CERTIFICATE') || cert.includes('PRIVATE KEY')) throw new Error('No se obtuvo un certificado público válido.')
    const file = resolve(s.directory,'ca-publica-clinica.crt'); writeFileSync(file,cert,{mode:0o644})
    console.log(JSON.stringify({ca_publica:file,huella_sha256:new X509Certificate(cert).fingerprint256}))
  } else if(action==='backup') {
    const path=await createBackup(s)
    console.log(JSON.stringify({respaldo:path,...await verifyBackup(s,path)}))
  } else if(action==='verify-backup') {
    if(!o.file)throw new Error('Indique --file=RUTA del respaldo cifrado.')
    console.log(JSON.stringify(await verifyBackup(s,o.file)))
  } else if(action==='recover-config') {
    if(!o.file)throw new Error('Indique --file=RUTA del respaldo cifrado.')
    console.log(JSON.stringify(await recoverConfiguration(s,o.file)))
  } else if(action==='restore-empty') {
    if(!o.file)throw new Error('Indique --file=RUTA del respaldo cifrado.')
    ensureStorage(s)
    compose(s,['up','-d','--wait','mysql'])
    console.log(JSON.stringify(await restoreEmpty(s,o.file)))
  } else throw new Error('Operación no válida. Use check, up, status, stop, ca, backup, verify-backup, recover-config o restore-empty.')
} catch (e) {
  if(process.env.DEPLOY_TEST_DIAGNOSTICS==='1' && /^prueba-[a-f0-9]{12}$/.test(parseOptions(process.argv.slice(3)).instance??''))console.error(String(e.stderr?.length?e.stderr:e.message).slice(0,2500))
  // Los argumentos de Docker solo contienen rutas, no contraseñas; no se imprime su configuración resuelta.
  console.error(e.status !== undefined ? 'La operación Docker falló. Revise el estado y los registros de los servicios, sin publicar secretos.' : e.message)
  process.exitCode = 1
} finally {
  if(lock)unlinkSync(lock)
}
