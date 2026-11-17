import './entorno-mantenimiento.mjs'
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { config } from './config.mjs'
import { inicializarBase } from './schema.mjs'
import { pool as poolAplicacion } from './db.mjs'

const clave = process.env.MIGRATION_DB_PASSWORD_FILE ? readFileSync(process.env.MIGRATION_DB_PASSWORD_FILE, 'utf8').trim() : process.env.MIGRATION_DB_PASSWORD
if (!process.env.MIGRATION_DB_USER || !clave || process.env.MIGRATION_DB_USER === config.db.user) {
  throw new Error('Configure una cuenta de migraciones diferente de la cuenta de aplicación.')
}
const pool = mysql.createPool({ ...config.db, user: process.env.MIGRATION_DB_USER, password: clave,
  dateStrings: true, decimalNumbers: true, charset: 'utf8mb4', timezone: 'Z' })
try {
  await inicializarBase(pool, config.admin)
  console.log('Migraciones completadas.')
} finally { await pool.end(); await poolAplicacion.end() }
