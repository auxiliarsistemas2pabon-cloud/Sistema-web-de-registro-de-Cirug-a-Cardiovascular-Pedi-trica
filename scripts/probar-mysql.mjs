import { randomBytes } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { once } from 'node:events'
import { createServer } from 'node:https'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

const identificador = randomBytes(6).toString('hex')
const nombre = `cardio-test-${identificador}`
const directorio = resolve('.local-secrets')
mkdirSync(directorio, { recursive: true, mode: 0o700 })
const archivo = resolve(directorio, `mysql-test-${identificador}.env`)
const password = randomBytes(32).toString('hex')
const probarTls = process.argv[2] === 'tls'
writeFileSync(archivo, `MYSQL_ROOT_PASSWORD=${password}\nMYSQL_ROOT_HOST=%\nMYSQL_DATABASE=cardio_pruebas\n`, { mode: 0o600, flag: 'wx' })
const docker = (argumentos) => execFileSync('docker', argumentos, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let pool, servidor, iniciado = false
try {
  docker(['run', '--rm', '-d', '--name', nombre, '--label', `cardio.security.test=${identificador}`, '--env-file', archivo,
    '-p', '127.0.0.1::3306', '--tmpfs', '/var/lib/mysql:rw,size=1g', 'mysql:8.4'])
  iniciado = true
  const info = JSON.parse(docker(['inspect', nombre]))[0]
  const puerto = info.NetworkSettings.Ports['3306/tcp'][0].HostPort
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: puerto, DB_USER: 'root', DB_PASSWORD: password, DB_NAME: 'cardio_pruebas',
    NODE_ENV: 'development', LOCAL_HTTPS: String(probarTls), TRUST_PROXY: '0', SECURITY_TEST_DB: '1',
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'), RUN_MIGRATIONS: 'false', LOGIN_IP_LIMIT: '120',
    INITIAL_ADMIN_EMAIL: 'admin@example.test', INITIAL_ADMIN_PASSWORD: 'PruebaSegura123', INITIAL_ADMIN_NAME: 'Prueba' })
  const { default: mysql } = await import('mysql2/promise')
  for (let i = 0; i < 60; i++) {
    try {
      const c = await mysql.createConnection({ host: '127.0.0.1', port: Number(puerto), user: 'root', password })
      await c.end(); break
    } catch {
      if (i === 59) throw new Error('MySQL de pruebas no arrancó.')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  const db = await import('../server/db.mjs'); pool = db.pool
  const { config } = await import('../server/config.mjs')
  const { inicializarBase } = await import('../server/schema.mjs')
  await inicializarBase(pool, config.admin)
  const { nuevoTotp, cifrarSecreto } = await import('../server/mfa.mjs')
  const secreto = nuevoTotp('admin@example.test').secret.base32
  process.env.TEST_MFA_SECRET = secreto
  await pool.query('UPDATE usuarios SET clave_temporal = false, mfa_secret = ? WHERE email = ?', [cifrarSecreto(secreto), process.env.INITIAL_ADMIN_EMAIL])
  const { app } = await import('../server/app.mjs')
  servidor = probarTls ? createServer(config.tls, app).listen(0, '127.0.0.1') : app.listen(0, '127.0.0.1')
  await once(servidor, 'listening')
  process.env.API_URL = `${probarTls ? 'https://localhost' : 'http://127.0.0.1'}:${servidor.address().port}`
  if (probarTls) {
    const ca = resolve(directorio, 'localhost.pem')
    writeFileSync(ca, new X509Certificate(readFileSync(resolve(directorio, 'localhost.cer'))).toString())
    process.env.NODE_EXTRA_CA_CERTS = ca
  }
  const archivos = process.argv[2] === 'browser' ? ['server/pruebas/navegador-seguridad.test.mjs']
    : process.argv[2] === 'load' ? ['server/pruebas/carga.test.mjs']
    : ['server/pruebas/seguridad-mysql.test.mjs', 'server/pruebas/api.test.mjs', 'server/pruebas/importaciones.test.mjs', 'server/pruebas/sesiones.test.mjs', 'server/pruebas/permisos-rutas.test.mjs', 'server/pruebas/navegador-seguridad.test.mjs']
  const pruebas = spawn(process.execPath, ['--test', '--test-concurrency=1', ...archivos], { env: process.env, windowsHide: true, stdio: 'inherit' })
  const [codigo] = await once(pruebas, 'exit')
  process.exitCode = codigo ?? 1
} catch {
  console.error('No se pudo completar la ejecución aislada de MySQL. No se utilizó la base clínica.'); process.exitCode = 1
} finally {
  await new Promise((r) => servidor ? servidor.close(r) : r())
  await pool?.end()
  if (iniciado) {
    try {
      const info = JSON.parse(docker(['inspect', nombre]))[0]
      if (info.Config.Labels['cardio.security.test'] === identificador) docker(['stop', '--time', '5', nombre])
    } catch { console.error('Revise la limpieza del contenedor exclusivo de pruebas.') }
  }
  if (archivo.startsWith(directorio + '\\') || archivo.startsWith(directorio + '/')) unlinkSync(archivo)
}
