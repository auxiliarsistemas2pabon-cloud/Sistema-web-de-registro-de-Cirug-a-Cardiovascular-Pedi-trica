import 'dotenv/config'
import { readFileSync } from 'node:fs'

function secreto(nombre) {
  const archivo = process.env[`${nombre}_FILE`]
  return archivo ? readFileSync(archivo, 'utf8').trim() : process.env[nombre]
}

function requerida(nombre) {
  const valor = secreto(nombre)
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}. Revise su archivo .env.`)
  return valor
}

function entero(nombre, defecto, minimo, maximo) {
  const valor = Number(process.env[nombre] ?? defecto)
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}.`)
  }
  return valor
}

const produccion = process.env.NODE_ENV === 'production'
const mfaKey = requerida('MFA_ENCRYPTION_KEY')
if (!/^[a-f0-9]{64}$/i.test(mfaKey)) throw new Error('MFA_ENCRYPTION_KEY debe contener 32 bytes aleatorios en hexadecimal.')
const dbHost = process.env.DB_HOST || '127.0.0.1'
const ssl = process.env.DB_TLS === 'true' ? {
  rejectUnauthorized: true,
  ...(process.env.DB_TLS_CA_FILE ? { ca: readFileSync(process.env.DB_TLS_CA_FILE, 'utf8') } : {}),
} : undefined
if (produccion && !['127.0.0.1', 'localhost', 'mysql'].includes(dbHost) && !ssl) {
  throw new Error('Una base de datos remota en producción requiere DB_TLS=true y un certificado válido.')
}

export const config = {
  puerto: entero('PORT', 3001, 1, 65535),
  host: process.env.HOST || '127.0.0.1',
  trustProxy: entero('TRUST_PROXY', 0, 0, 5),
  produccion,
  httpsLocal: process.env.LOCAL_HTTPS === 'true',
  tls: process.env.LOCAL_HTTPS === 'true' ? {
    pfx: readFileSync(requerida('LOCAL_TLS_PFX_FILE')),
    passphrase: requerida('LOCAL_TLS_PFX_PASSWORD'),
    minVersion: 'TLSv1.2',
  } : null,
  mfaKey: Buffer.from(mfaKey, 'hex'),
  migrarAlIniciar: process.env.RUN_MIGRATIONS === 'true' || (!produccion && process.env.RUN_MIGRATIONS !== 'false'),
  db: {
    host: dbHost,
    port: entero('DB_PORT', 3306, 1, 65535),
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
    database: requerida('DB_NAME'),
    ...(ssl ? { ssl } : {}),
  },
  minutosSesion: entero('SESSION_MINUTES', 15, 1, 60),
  horasSesionMaximas: entero('SESSION_MAX_HOURS', 12, 1, 24),
  admin: {
    email: process.env.INITIAL_ADMIN_EMAIL,
    password: secreto('INITIAL_ADMIN_PASSWORD'),
    nombre: process.env.INITIAL_ADMIN_NAME || 'Administrador',
  },
}
