import { parse } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

if (!existsSync('.env')) writeFileSync('.env', readFileSync('.env.example'), { mode: 0o600, flag: 'wx' })
let texto = readFileSync('.env', 'utf8')
const valores = parse(texto)
if (valores.RUN_MIGRATIONS === 'false') throw new Error('La instalación ya está preparada. Use npm run server; este script es solo para instalaciones nuevas.')
const email = process.argv.find((v) => v.startsWith('--email='))?.slice(8) || valores.INITIAL_ADMIN_EMAIL
if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indique --email=correo-institucional para el primer administrador.')
if (process.platform === 'win32') {
  const identidad = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
  const r = spawnSync('icacls', ['.env', '/inheritance:r', '/grant:r', `${identidad}:F`, '*S-1-5-18:F'], { windowsHide: true, stdio: 'pipe' })
  if (r.status !== 0) throw new Error('No se pudo proteger el entorno local.')
}
for (const [nombre, valor] of Object.entries({ INITIAL_ADMIN_EMAIL: email,
  MFA_ENCRYPTION_KEY: valores.MFA_ENCRYPTION_KEY || randomBytes(32).toString('hex'),
  DB_PASSWORD: !valores.DB_PASSWORD || valores.DB_PASSWORD.startsWith('cambie-') ? randomBytes(32).toString('hex') : valores.DB_PASSWORD,
  MYSQL_ROOT_PASSWORD: valores.MYSQL_ROOT_PASSWORD || randomBytes(32).toString('hex'),
  INITIAL_ADMIN_PASSWORD: valores.INITIAL_ADMIN_PASSWORD || 'Cc1' + randomBytes(24).toString('hex'),
})) {
  const patron = new RegExp(`^${nombre}=.*$`, 'm'), linea = `${nombre}=${JSON.stringify(valor)}`
  texto = patron.test(texto) ? texto.replace(patron, linea) : texto.trimEnd() + '\n' + linea + '\n'
}
writeFileSync('.env', texto, { mode: 0o600 })
console.log('Entorno inicial preparado. La contraseña temporal está en el archivo privado .env; no se imprime. Continúe con Docker y el aprovisionamiento local.')
