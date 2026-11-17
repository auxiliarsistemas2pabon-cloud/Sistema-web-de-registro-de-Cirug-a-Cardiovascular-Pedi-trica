import { parse } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const original = parse(readFileSync('.env'))
const previos = (archivo) => existsSync(archivo) ? parse(readFileSync(archivo)) : {}
const escribir = (archivo, valores) => {
  if (!existsSync(archivo)) writeFileSync(archivo, '', { mode: 0o600, flag: 'wx' })
  if (process.platform === 'win32') {
    const identidad = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    const resultado = spawnSync('icacls', [archivo, '/inheritance:r', '/grant:r', `${identidad}:F`, '*S-1-5-18:F'], { windowsHide: true, stdio: 'pipe' })
    if (resultado.status !== 0) throw new Error('No se pudieron restringir los permisos del entorno.')
  }
  writeFileSync(archivo, Object.entries(valores).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 })
}
const mantenimiento = previos('.env.maintenance')
const backup = previos('.env.backup')
const docker = previos('.env.docker')
for (const [clave, valor] of Object.entries(original)) {
  if (clave.startsWith('MIGRATION_') || clave.startsWith('INITIAL_ADMIN_')) mantenimiento[clave] = valor
  if (clave.startsWith('BACKUP_') || ['DB_HOST', 'DB_PORT', 'DB_NAME', 'MYSQL_CONTAINER'].includes(clave)) backup[clave] = valor
  if (['MYSQL_ROOT_PASSWORD', 'DB_USER', 'DB_PASSWORD', 'DB_PORT', 'DB_NAME'].includes(clave)) docker[clave] = valor
}
escribir('.env.maintenance', mantenimiento)
escribir('.env.backup', backup)
escribir('.env.docker', docker)
const aplicacion = Object.fromEntries(Object.entries(original).filter(([k]) => !k.startsWith('MIGRATION_') && !k.startsWith('BACKUP_') && !k.startsWith('INITIAL_ADMIN_') && !['MYSQL_ROOT_PASSWORD', 'JWT_SECRET'].includes(k)))
escribir('.env', aplicacion)
console.log('Credenciales de aplicación, mantenimiento, Docker y respaldo separadas y protegidas. No se muestran secretos.')
