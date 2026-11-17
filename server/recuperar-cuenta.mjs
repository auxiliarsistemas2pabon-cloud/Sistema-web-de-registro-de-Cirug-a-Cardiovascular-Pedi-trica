import './entorno-mantenimiento.mjs'
import mysql from 'mysql2/promise'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { spawnSync } from 'node:child_process'
import { config } from './config.mjs'
import { pool as poolAplicacion } from './db.mjs'

const id = process.argv.find((v) => v.startsWith('--id='))?.slice(5)
const accion = process.argv.find((v) => v.startsWith('--accion='))?.slice(9)
if (!/^[a-f0-9-]{36}$/.test(id ?? '') || !['mfa', 'clave'].includes(accion) || !process.argv.includes('--identidad-verificada')) {
  throw new Error('Uso: node server/recuperar-cuenta.mjs --id=UUID --accion=mfa|clave --identidad-verificada. Verifique presencialmente la identidad antes de ejecutar.')
}
const password = process.env.MIGRATION_DB_PASSWORD_FILE ? readFileSync(process.env.MIGRATION_DB_PASSWORD_FILE, 'utf8').trim() : process.env.MIGRATION_DB_PASSWORD
if (!password || !process.env.MIGRATION_DB_USER || process.env.MIGRATION_DB_USER === config.db.user) throw new Error('Se requiere la cuenta separada de mantenimiento.')
const conexion = await mysql.createConnection({ ...config.db, user: process.env.MIGRATION_DB_USER, password })
try {
  await conexion.beginTransaction()
  const [[usuario]] = await conexion.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [id])
  if (!usuario) throw new Error('Cuenta no encontrada.')
  let archivo
  if (accion === 'mfa') await conexion.query('UPDATE usuarios SET mfa_secret = NULL, mfa_recuperacion = NULL, mfa_ultimo_paso = -1, clave_temporal = true WHERE id = ?', [id])
  else {
    const clave = 'Cc1' + randomBytes(24).toString('hex')
    mkdirSync('.local-secrets', { recursive: true, mode: 0o700 })
    if (process.platform === 'win32') {
      const identidad = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      const r = spawnSync('icacls', ['.local-secrets', '/inheritance:r', '/grant:r', `${identidad}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe' })
      if (r.status !== 0) throw new Error('No se pudieron proteger los archivos de recuperación.')
    }
    archivo = resolve('.local-secrets', `clave-temporal-${randomBytes(6).toString('hex')}.txt`)
    writeFileSync(archivo, clave, { mode: 0o600, flag: 'wx' })
    await conexion.query('UPDATE usuarios SET password_hash = ?, clave_temporal = true WHERE id = ?', [await bcrypt.hash(clave, 12), id])
  }
  await conexion.query('DELETE FROM sesiones WHERE usuario_id = ?', [id])
  await conexion.query("INSERT INTO eventos_seguridad (evento, usuario_id, recurso, detalles) VALUES ('recuperacion_presencial', ?, 'mantenimiento_local', ?)", [id, JSON.stringify({ accion, operador_local: process.env.USERNAME ?? process.env.USER })])
  await conexion.commit()
  console.log(archivo ? `Contraseña temporal guardada de forma local en ${archivo}. Entréguela por un canal institucional y elimine el archivo después de usarla.` : 'Doble factor restablecido; se exige cambio de contraseña e inscripción nueva. Sesiones revocadas.')
} catch { await conexion.rollback(); console.error('No se completó la recuperación de la cuenta.'); process.exitCode = 1 }
finally { await conexion.end(); await poolAplicacion.end() }
