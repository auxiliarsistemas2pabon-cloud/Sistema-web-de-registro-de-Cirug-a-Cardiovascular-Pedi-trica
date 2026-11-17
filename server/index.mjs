import { app } from './app.mjs'
import { config } from './config.mjs'
import { pool } from './db.mjs'
import { inicializarBase } from './schema.mjs'
import { createServer } from 'node:https'
import { verificarPrivilegiosAplicacion } from './privilegios-db.mjs'

if (config.migrarAlIniciar) await inicializarBase(pool, config.admin)
else {
  await verificarPrivilegiosAplicacion(pool)
  await pool.query('SELECT rol, clave_temporal, mfa_secret FROM usuarios LIMIT 0')
  await pool.query('SELECT mfa_verificada, mfa_pendiente, mfa_verificada_en FROM sesiones LIMIT 0')
}
const servidor = config.tls ? createServer(config.tls, app) : app
// Limpieza de material de autenticación vencido; la auditoría no se borra automáticamente.
const limpiarAutenticacion = async () => {
  await pool.query('DELETE FROM sesiones WHERE expira_en <= UTC_TIMESTAMP() OR limite_en <= UTC_TIMESTAMP()')
  await pool.query('DELETE FROM intentos_auth WHERE ventana_en < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)')
}
await limpiarAutenticacion()
setInterval(() => limpiarAutenticacion().catch(() => console.error({ evento: 'fallo_mantenimiento_autenticacion' })), 30 * 60_000).unref()
servidor.listen(config.puerto, config.host, () => console.log(`Sistema disponible en ${config.tls ? 'https' : 'http'}://localhost:${config.puerto}`))
