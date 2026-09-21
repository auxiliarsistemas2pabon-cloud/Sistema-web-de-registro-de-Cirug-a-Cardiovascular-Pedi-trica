import { randomUUID } from 'node:crypto'
import mysql from 'mysql2/promise'
import { config } from './config.mjs'

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE => 'YYYY-MM-DD'
  decimalNumbers: true, // DECIMAL => number
  charset: 'utf8mb4',
  timezone: 'Z',
})

// Todas las marcas de tiempo se guardan en UTC; "hoy" se calcula en Node con la zona America/Bogota.
pool.pool.on('connection', (conexion) => {
  conexion.query("SET time_zone = '+00:00'")
})

export const nuevoId = () => randomUUID()

/** Fecha de hoy (yyyy-mm-dd) en la zona horaria de Bogotá. */
export function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

/** Ejecuta `fn(conexion)` dentro de una transacción; hace commit o rollback. */
export async function conTransaccion(fn) {
  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()
    const resultado = await fn(conexion)
    await conexion.commit()
    return resultado
  } catch (error) {
    await conexion.rollback()
    throw error
  } finally {
    conexion.release()
  }
}

/** MySQL devuelve BOOLEAN como 0/1: la API siempre expone true/false. */
export function aBooleanos(fila, campos) {
  if (!fila) return fila
  const copia = { ...fila }
  for (const campo of campos) if (campo in copia && copia[campo] !== null) copia[campo] = Boolean(copia[campo])
  return copia
}

/** DATETIME guardado en UTC ('YYYY-MM-DD HH:MM:SS') => ISO 8601. */
export const isoUtc = (valor) => (valor ? `${String(valor).replace(' ', 'T')}Z` : valor)

export async function una(conexion, sql, parametros = []) {
  const [filas] = await conexion.query(sql, parametros)
  return filas[0] ?? null
}

export async function todas(conexion, sql, parametros = []) {
  const [filas] = await conexion.query(sql, parametros)
  return filas
}
