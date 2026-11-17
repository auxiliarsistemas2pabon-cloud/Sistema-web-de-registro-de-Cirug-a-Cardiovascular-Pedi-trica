import { config as cargarEntorno, parse } from 'dotenv'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, appendFileSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('../', import.meta.url))
cargarEntorno({ path: resolve(raiz, existsSync(resolve(raiz, '.env.backup')) ? '.env.backup' : '.env'), quiet: true })
const secretos = resolve(raiz, '.local-secrets')
const respaldos = resolve(raiz, 'backups')
const contenedor = process.env.MYSQL_CONTAINER || 'cardio-mysql'
if (!/^[a-zA-Z0-9_-]+$/.test(contenedor)) throw new Error('Contenedor no válido.')

function proteger(ruta) {
  if (process.platform === 'win32') {
    const identidad = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    const r = spawnSync('icacls', [ruta, '/inheritance:r', '/grant:r', `${identidad}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe' })
    if (r.status !== 0) throw new Error('No se pudieron restringir los permisos de los respaldos.')
  }
}

function entornoContenedor() {
  const contenido = execFileSync('docker', ['inspect', contenedor, '--format', '{{json .Config.Env}}'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return Object.fromEntries(JSON.parse(contenido).map((v) => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)] }))
}
const terminar = (proceso) => new Promise((aceptar, rechazar) => {
  proceso.on('error', rechazar)
  proceso.on('close', (codigo) => codigo === 0 ? aceptar() : rechazar(new Error('Falló la herramienta de MySQL.')))
})

export async function crearRespaldo() {
  mkdirSync(secretos, { recursive: true, mode: 0o700 }); proteger(secretos)
  mkdirSync(respaldos, { recursive: true, mode: 0o700 }); proteger(respaldos)
  const claveArchivo = resolve(secretos, 'backup.key')
  if (!existsSync(claveArchivo)) writeFileSync(claveArchivo, randomBytes(32), { mode: 0o600, flag: 'wx' })
  const clave = readFileSync(claveArchivo)
  if (clave.length !== 32) throw new Error('Clave de respaldo no válida.')
  const env = entornoContenedor()
  const base = process.env.DB_NAME || env.MYSQL_DATABASE
  if (!/^[a-zA-Z0-9_]+$/.test(base)) throw new Error('Nombre de base no válido.')
  const nombre = `cardio-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}.sql.gz.aes`
  const destino = resolve(respaldos, nombre)
  const iv = randomBytes(12)
  writeFileSync(destino, Buffer.concat([Buffer.from('CCVBACK1'), iv]), { mode: 0o600, flag: 'wx' })
  const cifrador = createCipheriv('aes-256-gcm', clave, iv)
  const usuarioBackup = process.env.BACKUP_DB_USER || 'root'
  const claveBackup = process.env.BACKUP_DB_PASSWORD_FILE ? readFileSync(process.env.BACKUP_DB_PASSWORD_FILE, 'utf8').trim() : process.env.BACKUP_DB_PASSWORD || env.MYSQL_ROOT_PASSWORD
  const proceso = spawn('docker', ['exec', '-i', '-e', `BACKUP_DATABASE=${base}`, '-e', `BACKUP_USER=${usuarioBackup}`, contenedor, 'sh', '-c',
    'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysqldump --user="$BACKUP_USER" --single-transaction --no-tablespaces --set-gtid-purged=OFF --skip-add-locks "$BACKUP_DATABASE"'],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  proceso.stdin.end(claveBackup + '\n')
  proceso.stderr.resume()
  await Promise.all([terminar(proceso), pipeline(proceso.stdout, createGzip(), cifrador, createWriteStream(destino, { flags: 'a' }))])
  appendFileSync(destino, cifrador.getAuthTag())
  // La semilla MFA de cada cuenta está cifrada: restaurar la base también requiere esta clave.
  // Se guarda en un acompañante cifrado, nunca en el SQL ni en un archivo de configuración abierto.
  const entornoApp = parse(readFileSync(resolve(raiz, '.env')))
  const claveMfa = entornoApp.MFA_ENCRYPTION_KEY_FILE ? readFileSync(resolve(raiz, entornoApp.MFA_ENCRYPTION_KEY_FILE), 'utf8').trim() : entornoApp.MFA_ENCRYPTION_KEY
  if (!/^[a-f0-9]{64}$/i.test(claveMfa ?? '')) throw new Error('Falta la clave MFA que requiere la recuperación completa.')
  const ivConfig = randomBytes(12), cifradorConfig = createCipheriv('aes-256-gcm', clave, ivConfig)
  const contenidoConfig = Buffer.concat([cifradorConfig.update(JSON.stringify({ version: 1, MFA_ENCRYPTION_KEY: claveMfa })), cifradorConfig.final()])
  writeFileSync(destino.replace(/\.sql\.gz\.aes$/, '.config.json.aes'), Buffer.concat([Buffer.from('CCVCFG01'), ivConfig, cifradorConfig.getAuthTag(), contenidoConfig]), { mode: 0o600, flag: 'wx' })
  return destino
}

export async function verificarRespaldo(archivo) {
  const ruta = resolve(archivo)
  const tamano = statSync(ruta).size
  const descriptor = openSync(ruta, 'r')
  const cabecera = Buffer.alloc(20), tag = Buffer.alloc(16)
  try { readSync(descriptor, cabecera, 0, 20, 0); readSync(descriptor, tag, 0, 16, tamano - 16) } finally { closeSync(descriptor) }
  if (cabecera.subarray(0, 8).toString() !== 'CCVBACK1' || tamano < 37) throw new Error('Formato de respaldo no válido.')
  // Autentica TODO el archivo antes de ejecutar SQL: un respaldo alterado nunca llega a MySQL.
  const clave = readFileSync(resolve(secretos, 'backup.key'))
  function descifrador() {
    const d = createDecipheriv('aes-256-gcm', clave, cabecera.subarray(8))
    d.setAuthTag(tag)
    return d
  }
  const verificar = descifrador()
  for await (const bloque of createReadStream(ruta, { start: 20, end: tamano - 17 })) verificar.update(bloque)
  verificar.final()
  const configAcompanante = ruta.replace(/\.sql\.gz\.aes$/, '.config.json.aes')
  if (existsSync(configAcompanante)) {
    const datos = readFileSync(configAcompanante)
    if (datos.subarray(0, 8).toString() !== 'CCVCFG01') throw new Error('Configuración de respaldo no válida.')
    const c = createDecipheriv('aes-256-gcm', clave, datos.subarray(8, 20)); c.setAuthTag(datos.subarray(20, 36))
    const configuracion = JSON.parse(Buffer.concat([c.update(datos.subarray(36)), c.final()]).toString('utf8'))
    if (!/^[a-f0-9]{64}$/i.test(configuracion.MFA_ENCRYPTION_KEY ?? '')) throw new Error('Clave MFA de respaldo no válida.')
  }
  const env = entornoContenedor()
  const conexion = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3307), user: 'root', password: env.MYSQL_ROOT_PASSWORD })
  const temporal = `cardio_restore_${randomBytes(6).toString('hex')}`
  let creada = false
  try {
    await conexion.query(`CREATE DATABASE \`${temporal}\` CHARACTER SET utf8mb4`); creada = true
    const proceso = spawn('docker', ['exec', '-i', '-e', `RESTORE_DATABASE=${temporal}`, contenedor, 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root "$RESTORE_DATABASE"'], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    proceso.stderr.resume()
    await Promise.all([terminar(proceso), pipeline(createReadStream(ruta, { start: 20, end: tamano - 17 }), descifrador(), createGunzip(), proceso.stdin)])
    const [tablas] = await conexion.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [temporal])
    let filas = 0
    for (const { TABLE_NAME: tabla } of tablas) {
      const [[r]] = await conexion.query(`SELECT COUNT(*) AS total FROM \`${temporal}\`.${conexion.escapeId(tabla)}`)
      filas += Number(r.total)
    }
    return { tablas: tablas.length, filas }
  } finally {
    // Solo se elimina la base temporal creada por ESTA ejecución.
    if (creada && /^cardio_restore_[a-f0-9]{12}$/.test(temporal)) await conexion.query(`DROP DATABASE \`${temporal}\``)
    await conexion.end()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const archivo = process.argv[2] === 'verificar' ? process.argv[3] : await crearRespaldo()
    if (!archivo) throw new Error('Indique un archivo de respaldo.')
    const verificacion = await verificarRespaldo(archivo)
    console.log(JSON.stringify({ respaldo: archivo, restauracion_verificada: true, ...verificacion }))
  } catch {
    console.error('No se completó el respaldo o su verificación. Revise Docker, el archivo y las credenciales locales.'); process.exitCode = 1
  }
}
