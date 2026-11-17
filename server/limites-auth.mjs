import { createHash } from 'node:crypto'
import { pool, una } from './db.mjs'
import { ErrorApi } from './errores.mjs'

export const claveIntentos = (tipo, identidad) => createHash('sha256').update(`${tipo}:${identidad}`).digest('hex')

/** Contador atómico en MySQL, compartido entre procesos y reinicios. No almacena correos ni claves. */
export async function limitarCuenta(tipo, identidad, maximo = 10) {
  const clave = claveIntentos(tipo, identidad)
  await pool.query(`INSERT INTO intentos_auth (clave) VALUES (?) ON DUPLICATE KEY UPDATE
    intentos = IF(ventana_en <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), 1, intentos + 1),
    ventana_en = IF(ventana_en <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), UTC_TIMESTAMP(), ventana_en)`, [clave])
  const fila = await una(pool, 'SELECT intentos FROM intentos_auth WHERE clave = ?', [clave])
  if (fila.intentos > maximo) throw new ErrorApi(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espere 15 minutos.')
}

export async function limpiarIntentos(email, usuarioId) {
  await pool.query('DELETE FROM intentos_auth WHERE clave IN (?, ?)', [claveIntentos('login', email), claveIntentos('mfa', usuarioId)])
}
