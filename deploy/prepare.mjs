import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { root, instancePaths, protectDirectory, parseOptions, validateEnv, writeEnv } from './lib.mjs'

try {
  const o = parseOptions(process.argv.slice(2))
  const permitidas = ['instance','domain','bind','cidrs','email','http','https','image','reuse-local-mfa']
  if (Object.keys(o).some((k) => !permitidas.includes(k))) throw new Error('Opción no reconocida.')
  const instance = o.instance || 'clinica', paths = instancePaths(instance)
  if (existsSync(paths.envFile)) throw new Error('La instancia ya existe; no se sobrescriben claves ni configuración.')
  const emailLocal = existsSync(resolve(root,'.env.maintenance')) ? parseEnv(readFileSync(resolve(root,'.env.maintenance'),'utf8')).INITIAL_ADMIN_EMAIL : undefined
  const domain = o.domain || 'cirugia.clinica.internal', httpsPort = o.https || '443'
  const env = validateEnv({ DEPLOY_INSTANCE: instance, STACK_NAME: `cirugia-prod-${instance}`, APP_DOMAIN: domain,
    APP_ORIGIN: `https://${domain}${httpsPort === '443' ? '' : ':' + httpsPort}`, BIND_IP: o.bind || '127.0.0.1',
    HTTP_PORT: o.http || '80', HTTPS_PORT: httpsPort, CLINIC_CIDRS: o.cidrs || '127.0.0.1/32', DB_NAME: 'cardio_pediatrica',
    APP_IMAGE: o.image || 'cirugia-cardiovascular:preparada', INITIAL_ADMIN_EMAIL: o.email || emailLocal || 'admin@example.test' })
  let mfa = randomBytes(32).toString('hex')
  if (o['reuse-local-mfa'] === 'true') {
    const actual = parseEnv(readFileSync(resolve(root,'.env'),'utf8'))
    mfa = actual.MFA_ENCRYPTION_KEY_FILE ? readFileSync(resolve(root,actual.MFA_ENCRYPTION_KEY_FILE),'utf8').trim() : actual.MFA_ENCRYPTION_KEY
    if (!/^[a-f0-9]{64}$/i.test(mfa ?? '')) throw new Error('La clave MFA local no es válida.')
  }
  protectDirectory(resolve(root,'deploy/private'))
  protectDirectory(paths.directory); protectDirectory(paths.secrets); protectDirectory(paths.backups)
  const secrets = { mysql_root_password: randomBytes(32).toString('hex'), app_db_password: randomBytes(32).toString('hex'),
    backup_db_password: randomBytes(32).toString('hex'), mfa_key: mfa, bootstrap_password: 'Cc1' + randomBytes(24).toString('hex'), backup_key: randomBytes(32).toString('hex') }
  if (Object.keys(secrets).some((k) => existsSync(resolve(paths.secrets,k)))) throw new Error('Hay claves de una preparación anterior; no se sobrescriben.')
  // Compose monta archivos sin remapear uid/gid. El directorio 0700 protege el host;
  // los archivos de solo lectura permiten leer únicamente los secretos montados en cada contenedor.
  for (const [name,value] of Object.entries(secrets)) writeFileSync(resolve(paths.secrets,name),value+'\n',{mode:0o444,flag:'wx'})
  writeEnv(paths.envFile, env)
  console.log(JSON.stringify({ preparado: paths.envFile, acceso: 'red interna/VPN', escucha_inicial: env.BIND_IP,
    clave_mfa_local_conservada: o['reuse-local-mfa'] === 'true', credenciales: 'archivos privados, no se imprimen' }))
} catch (e) { console.error(e.message); process.exitCode = 1 }
