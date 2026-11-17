import 'dotenv/config'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { config } from '../server/config.mjs'
import { inicializarBase } from '../server/schema.mjs'
import { pool as poolAplicacion } from '../server/db.mjs'
import { concederPrivilegiosAplicacion } from '../server/privilegios-db.mjs'

// Solo se ejecuta deliberadamente en la instancia Docker local de este proyecto.
const contenedor = process.env.MYSQL_CONTAINER || 'cardio-mysql'
if (!/^[a-zA-Z0-9_-]+$/.test(contenedor) || !['127.0.0.1', 'localhost'].includes(config.db.host)) throw new Error('Este script solo admite MySQL local.')
let conexion
try {
  const info = JSON.parse(execFileSync('docker', ['inspect', contenedor], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }))[0]
  const variables = Object.fromEntries(info.Config.Env.map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] }))
  const proyecto = info.Config.Labels?.['com.docker.compose.project']
  if (!proyecto || !info.Mounts.some((m) => m.Destination === '/var/lib/mysql' && m.Type === 'volume')) throw new Error('Contenedor sin volumen verificable de Compose.')
  conexion = await mysql.createConnection({ ...config.db, user: 'root', password: variables.MYSQL_ROOT_PASSWORD })
  const migracionPool = mysql.createPool({ ...config.db, user: 'root', password: variables.MYSQL_ROOT_PASSWORD,
    dateStrings: true, decimalNumbers: true, charset: 'utf8mb4', timezone: 'Z' })
  try { await inicializarBase(migracionPool, config.admin) } finally { await migracionPool.end() }
  const existentes = await conexion.query('SELECT User FROM mysql.user WHERE User IN (?, ?, ?)', ['cardio_runtime', 'cardio_migrador', 'cardio_backup'])
  if (existentes[0].length) throw new Error('Las cuentas de servicio ya existen; no se rotan automáticamente. Use sus credenciales actuales y el procedimiento de rotación.')
  const claves = { DB_PASSWORD: randomBytes(32).toString('hex'), MIGRATION_DB_PASSWORD: randomBytes(32).toString('hex'),
    BACKUP_DB_PASSWORD: randomBytes(32).toString('hex'), MYSQL_ROOT_PASSWORD: randomBytes(32).toString('hex') }
  for (const [usuario, clave] of [['cardio_runtime', claves.DB_PASSWORD], ['cardio_migrador', claves.MIGRATION_DB_PASSWORD], ['cardio_backup', claves.BACKUP_DB_PASSWORD]]) {
    await conexion.query('CREATE USER ?@? IDENTIFIED BY ?', [usuario, '%', clave])
  }
  const db = conexion.escapeId(config.db.database)
  await conexion.query(`GRANT ALL PRIVILEGES ON ${db}.* TO 'cardio_migrador'@'%'`)
  await conexion.query(`GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON ${db}.* TO 'cardio_backup'@'%'`)
  await concederPrivilegiosAplicacion(conexion, config.db.database, 'cardio_runtime')
  let entorno = readFileSync('.env', 'utf8')
  const actualizar = (nombre, valor) => {
    const linea = `${nombre}=${JSON.stringify(valor)}`
    const patron = new RegExp(`^${nombre}=.*$`, 'm')
    entorno = patron.test(entorno) ? entorno.replace(patron, linea) : `${entorno.trimEnd()}\n${linea}\n`
  }
  for (const [nombre, valor] of Object.entries({ ...claves, DB_USER: 'cardio_runtime', MIGRATION_DB_USER: 'cardio_migrador', BACKUP_DB_USER: 'cardio_backup', RUN_MIGRATIONS: 'false' })) actualizar(nombre, valor)
  // Se guarda primero el secreto nuevo, con ACL restringida, antes de cambiar la clave root.
  writeFileSync('.env', entorno, { mode: 0o600 })
  if (process.platform === 'win32') {
    const identidad = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    const permisos = spawnSync('icacls', ['.env', '/inheritance:r', '/grant:r', `${identidad}:F`, '*S-1-5-18:F'], { windowsHide: true, stdio: 'pipe' })
    if (permisos.status !== 0) throw new Error('No se pudieron restringir los permisos del entorno.')
  }
  const [cuentasRoot] = await conexion.query("SELECT Host FROM mysql.user WHERE User = 'root'")
  for (const { Host: host } of cuentasRoot) await conexion.query('ALTER USER ?@? IDENTIFIED BY ?', ['root', host, claves.MYSQL_ROOT_PASSWORD])
  if (!['root', 'cardio_runtime', 'cardio_migrador', 'cardio_backup'].includes(config.db.user)) {
    const [antiguas] = await conexion.query('SELECT Host FROM mysql.user WHERE User = ?', [config.db.user])
    for (const { Host: host } of antiguas) await conexion.query('ALTER USER ?@? ACCOUNT LOCK', [config.db.user, host])
  }
  await conexion.end(); conexion = null
  // El mismo proyecto conserva su volumen y actualiza variables/healthcheck del contenedor.
  execFileSync('docker', ['compose', '--project-name', proyecto, 'up', '-d', 'mysql'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  console.log('Base migrada. Cuenta de aplicación con permisos limitados, credenciales separadas y contraseñas locales rotadas. No se muestran secretos.')
} catch {
  console.error('La configuración no terminó. Revise la base local y el entorno sin publicar credenciales. La copia cifrada anterior permanece disponible.')
  process.exitCode = 1
} finally { await conexion?.end(); await poolAplicacion.end() }
