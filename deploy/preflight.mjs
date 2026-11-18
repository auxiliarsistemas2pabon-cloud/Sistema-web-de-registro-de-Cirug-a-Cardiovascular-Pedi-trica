import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { configInstance } from './lib.mjs'

export function inspectDeployment(state) {
  const c = configInstance(state)
  if (c.name !== state.env.STACK_NAME || c.services.db || c.services.app.ports || c.services.mysql.ports) throw new Error('El despliegue debe publicar solo el proxy y usar su MySQL independiente.')
  const app = c.services.app, proxy = c.services.proxy
  if (!app.read_only || app.user === '0' || !app.cap_drop.includes('ALL') || !app.security_opt.includes('no-new-privileges:true')) throw new Error('Faltan restricciones del servicio web.')
  if(c.services.mysql.user!=='999:999'||!c.services.mysql.read_only||c.services.mysql.cap_add?.length)throw new Error('MySQL debe ejecutarse sin root ni capacidades adicionales.')
  if (app.environment.NODE_ENV !== 'production' || app.environment.RUN_MIGRATIONS !== 'false' || app.environment.TRUST_PROXY !== '1') throw new Error('Configuración de producción no válida.')
  if (!c.networks.datos.internal || !c.networks.proxy_app.internal || !c.volumes.mysql_data.external || !c.volumes.caddy_data.external) throw new Error('Falta aislamiento o persistencia protegida.')
  const appSecrets = app.secrets.map((s) => s.source).sort()
  if (appSecrets.join(',') !== 'app_db_password,mfa_key') throw new Error('El servicio web no debe recibir secretos administrativos ni de respaldo.')
  if (proxy.ports.some((p) => p.host_ip !== state.env.BIND_IP)) throw new Error('El proxy publica una interfaz no prevista.')
  for (const k of ['mfa_key','backup_key']) if (!/^[a-f0-9]{64}$/i.test(readFileSync(resolve(state.secrets,k),'utf8').trim())) throw new Error(`Clave no válida: ${k}`)
  if (process.platform !== 'win32' && (statSync(state.directory).mode & 0o077)) throw new Error('El directorio privado requiere permisos 0700.')
  for (const p of ['/var/run/docker.sock','/run/docker.sock']) if (JSON.stringify(c).includes(p)) throw new Error('No se permite montar el socket de Docker.')
  return { configuracion_valida: true, origen: state.env.APP_ORIGIN, interfaz: state.env.BIND_IP,
    redes_permitidas: state.env.CLINIC_CIDRS, base_sin_puerto_publicado: true, pendientes: ['DNS interno del servidor','confianza del certificado en los equipos','firewall/VPN y copias externas'] }
}
