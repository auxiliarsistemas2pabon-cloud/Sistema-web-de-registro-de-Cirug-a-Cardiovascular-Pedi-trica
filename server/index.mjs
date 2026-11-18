import { app } from './app.mjs'
import { config } from './config.mjs'
import { pool } from './db.mjs'
import { inicializarBase } from './schema.mjs'
import { createServer as crearHttps } from 'node:https'
import { createServer as crearHttp } from 'node:http'
import { verificarPrivilegiosAplicacion } from './privilegios-db.mjs'

if (config.migrarAlIniciar) await inicializarBase(pool, config.admin)
else {
  await verificarPrivilegiosAplicacion(pool)
  await pool.query('SELECT rol, clave_temporal, mfa_secret FROM usuarios LIMIT 0')
  await pool.query('SELECT mfa_verificada, mfa_pendiente, mfa_verificada_en FROM sesiones LIMIT 0')
  await pool.query('SELECT sesion_id, creado_en, actividad_en, dispositivo FROM sesiones LIMIT 0')
}
const servidor = config.tls ? crearHttps({ ...config.tls, maxHeaderSize: 16_384 }, app) : crearHttp({ maxHeaderSize: 16_384 }, app)
servidor.headersTimeout = 15_000
servidor.requestTimeout = 120_000
servidor.keepAliveTimeout = 5000
servidor.maxHeadersCount = 100
// Limpieza de material de autenticación vencido; la auditoría no se borra automáticamente.
const limpiarAutenticacion = async () => {
  await pool.query('DELETE FROM sesiones WHERE expira_en <= UTC_TIMESTAMP() OR limite_en <= UTC_TIMESTAMP()')
  await pool.query('DELETE FROM intentos_auth WHERE ventana_en < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)')
}
await limpiarAutenticacion()
const mantenimiento = setInterval(() => limpiarAutenticacion().catch(() => console.error({ evento: 'fallo_mantenimiento_autenticacion' })), 30 * 60_000)
mantenimiento.unref()
servidor.listen(config.puerto, config.host, () => console.log(`Sistema disponible en ${config.tls ? 'https' : 'http'}://localhost:${config.puerto}`))

let cerrando = false
async function cerrar() {
  if (cerrando) return
  cerrando = true
  clearInterval(mantenimiento)
  const limite = setTimeout(() => { servidor.closeAllConnections(); process.exit(1) }, 20_000)
  limite.unref()
  servidor.close(async () => {
    try { await pool.end(); clearTimeout(limite); process.exitCode = 0 }
    catch { process.exitCode = 1 }
  })
  servidor.closeIdleConnections()
}
process.on('SIGTERM', cerrar)
process.on('SIGINT', cerrar)
