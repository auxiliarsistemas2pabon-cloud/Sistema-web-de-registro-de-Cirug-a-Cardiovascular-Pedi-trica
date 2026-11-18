import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { config } from '../server/config.mjs'
import { inicializarBase } from '../server/schema.mjs'
import { concederPrivilegiosAplicacion, verificarPrivilegiosAplicacion } from '../server/privilegios-db.mjs'
import { pool as runtimePool } from '../server/db.mjs'

const rootPassword = readFileSync(process.env.MIGRATION_DB_PASSWORD_FILE, 'utf8').trim()
const backupPassword = readFileSync(process.env.BACKUP_DB_PASSWORD_FILE, 'utf8').trim()
if (!rootPassword || !backupPassword || process.env.MIGRATION_DB_USER === config.db.user) throw new Error('Se necesitan credenciales de mantenimiento separadas.')
const admin = mysql.createPool({ ...config.db, user: process.env.MIGRATION_DB_USER, password: rootPassword,
  connectionLimit: 2, dateStrings: true, decimalNumbers: true, charset: 'utf8mb4', timezone: 'Z' })
let c
try {
  c = await admin.getConnection()
  if (process.argv.includes('--check-only')) {
    const [[r]] = await c.query('SELECT COUNT(*) AS tablas FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')
    console.log(JSON.stringify({ tablas: Number(r.tablas) }))
  } else {
  const [[lock]] = await c.query("SELECT GET_LOCK(CONCAT('migrar:', DATABASE()), 30) AS adquirido")
  if (lock.adquirido !== 1) throw new Error('Otra migración está en curso.')
  await inicializarBase(admin, config.admin)
  for (const [usuario, password] of [[config.db.user, config.db.password], ['cardio_backup', backupPassword]]) {
    await c.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [usuario, '%', password])
    // No rota contraseñas existentes: un secreto incorrecto debe detener el despliegue.
    const prueba = await mysql.createConnection({ ...config.db, user: usuario, password, database: undefined })
    await prueba.end()
    await c.query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [usuario, '%'])
  }
  await concederPrivilegiosAplicacion(c, config.db.database, config.db.user)
  await c.query(`GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON ${c.escapeId(config.db.database)}.* TO 'cardio_backup'@'%'`)
  await verificarPrivilegiosAplicacion(runtimePool)
  // Los cookies emitidos por el entorno anterior no se reutilizan después del mantenimiento.
  await c.query('DELETE FROM sesiones')
  await c.query('DELETE FROM intentos_auth')
  console.log('Migraciones y permisos verificados. No se muestran credenciales.')
  }
} catch (error) {
  console.error({ evento: 'fallo_migracion', codigo: error?.code ?? error?.name ?? 'Error' }); process.exitCode = 1
} finally {
  if (c) { await c.query("SELECT RELEASE_LOCK(CONCAT('migrar:', DATABASE()))").catch(() => {}); c.release() }
  await admin.end(); await runtimePool.end()
}
