import { parseEnv } from 'node:util'
import { isIP } from 'node:net'
import { readFileSync, existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const composeFile = resolve(root, 'deploy/compose.yml')
export function privateIp(ip) {
  if (isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number)
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return ip === '::1' || (isIP(ip) === 6 && /^(fc|fd)/i.test(ip))
}
export function privateCidr(cidr) {
  const [ip, bits, extra] = cidr.split('/')
  if (extra !== undefined || !/^\d+$/.test(bits ?? '') || !privateIp(ip)) return false
  const n = Number(bits)
  if (isIP(ip) === 6) return ip === '::1' ? n === 128 : n >= 7 && n <= 128
  const [a,b] = ip.split('.').map(Number)
  const minimo = a === 10 || a === 127 ? 8 : a === 172 && b >= 16 && b <= 31 ? 12 : 16
  return n >= minimo && n <= 32
}
export function validateEnv(env) {
  if (!/^[a-z0-9][a-z0-9-]{0,35}$/.test(env.DEPLOY_INSTANCE ?? '')) throw new Error('DEPLOY_INSTANCE no válido.')
  if (!/^cirugia-prod-[a-z0-9][a-z0-9-]{0,45}$/.test(env.STACK_NAME ?? '')) throw new Error('STACK_NAME debe identificar un despliegue separado: cirugia-prod-NOMBRE.')
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(env.APP_DOMAIN ?? '') || !env.APP_DOMAIN.includes('.') || env.APP_DOMAIN.includes('..')) throw new Error('APP_DOMAIN debe ser el nombre DNS interno.')
  if (isIP(env.BIND_IP) !== 4 || !privateIp(env.BIND_IP)) throw new Error('BIND_IP debe ser una IPv4 interna o 127.0.0.1; no se permite 0.0.0.0.')
  for (const key of ['HTTP_PORT','HTTPS_PORT']) if (!/^\d+$/.test(env[key] ?? '') || Number(env[key]) < 1 || Number(env[key]) > 65535) throw new Error(`${key} no válido.`)
  if (env.HTTP_PORT === env.HTTPS_PORT) throw new Error('HTTP y HTTPS requieren puertos distintos.')
  const origen = `https://${env.APP_DOMAIN}${env.HTTPS_PORT === '443' ? '' : ':' + env.HTTPS_PORT}`
  if (env.APP_ORIGIN !== origen) throw new Error('APP_ORIGIN no coincide con APP_DOMAIN y HTTPS_PORT.')
  const cidrs = (env.CLINIC_CIDRS ?? '').trim().split(/\s+/)
  if (!cidrs.length || cidrs.some((r) => !privateCidr(r))) throw new Error('CLINIC_CIDRS solo puede contener redes internas explícitas; no se permiten rangos públicos ni 0.0.0.0/0.')
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(env.DB_NAME ?? '')) throw new Error('DB_NAME no válido.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.INITIAL_ADMIN_EMAIL ?? '')) throw new Error('Defina el correo institucional del administrador inicial.')
  if (!/^[a-z0-9][a-z0-9./:_@-]{1,220}$/i.test(env.APP_IMAGE ?? '')) throw new Error('APP_IMAGE no válida.')
  return env
}
export function instancePaths(instance = 'clinica') {
  if (!/^[a-z0-9][a-z0-9-]{0,35}$/.test(instance)) throw new Error('Instancia no válida.')
  const directory = resolve(root, 'deploy/private', instance)
  return { directory, envFile: resolve(directory, 'production.env'), secrets: resolve(directory, 'secrets'), backups: resolve(directory, 'backups') }
}
export function protectDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(path, 0o700)
  else {
    const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    const p = spawnSync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe' })
    if (p.status !== 0) throw new Error('No se pudieron proteger los archivos privados.')
  }
}
export function writeEnv(path, env) {
  writeFileSync(path, Object.entries(env).map(([k,v]) => `${k}=${JSON.stringify(String(v))}`).join('\n') + '\n', { mode: 0o600 })
}
export function loadInstance(instance) {
  const paths = instancePaths(instance)
  const env = validateEnv(parseEnv(readFileSync(paths.envFile, 'utf8')))
  if (env.DEPLOY_INSTANCE !== instance) throw new Error('El archivo pertenece a otra instancia.')
  for (const name of ['mysql_root_password','app_db_password','backup_db_password','mfa_key','bootstrap_password','backup_key']) {
    const p = resolve(paths.secrets, name)
    if (!existsSync(p) || readFileSync(p, 'utf8').trim().length < 32) throw new Error(`Falta el secreto ${name}.`)
  }
  return { ...paths, env }
}
export function docker(args, options = {}) {
  return execFileSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe','pipe','pipe'], maxBuffer: 8 * 1024 * 1024, ...options })
}
export const composeArgs = (state, args) => ['compose', '--project-name', state.env.STACK_NAME, '--env-file', state.envFile, '-f', composeFile, ...args]
export const compose = (state, args, options) => docker(composeArgs(state, args), options)
export function configInstance(state) { return JSON.parse(compose(state, ['config','--format','json'])) }
export function ensureStorage(state) {
  const config = configInstance(state)
  for (const name of Object.values(config.volumes).map((v) => v.name)) {
    let info
    try { info = JSON.parse(docker(['volume','inspect',name]))[0] } catch {
      docker(['volume','create','--label',`cirugia.deploy.instance=${state.env.STACK_NAME}`,name])
      info = JSON.parse(docker(['volume','inspect',name]))[0]
    }
    if (info.Labels?.['cirugia.deploy.instance'] !== state.env.STACK_NAME) throw new Error('El volumen no pertenece a este despliegue; se requiere revisión antes de reutilizarlo.')
  }
  for(const [volume,uid] of [['caddy_data',1000],['mysql_data',999]]){
    docker(['run','--rm','--network','none','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','FOWNER','--security-opt','no-new-privileges:true',
      '--mount',`type=volume,source=${state.env.STACK_NAME}_${volume},target=/data,volume-nocopy`,'--entrypoint','/bin/sh',config.services.proxy.image,
      '-c',`chown ${uid}:${uid} /data && chmod 700 /data`])
  }
}
export function parseOptions(args) {
  const out = {}
  for (const a of args) {
    const m = /^--([a-z-]+)=(.*)$/.exec(a)
    if (!m || Object.hasOwn(out,m[1])) throw new Error('Use opciones --nombre=valor sin repetir.')
    out[m[1]] = m[2]
  }
  return out
}
