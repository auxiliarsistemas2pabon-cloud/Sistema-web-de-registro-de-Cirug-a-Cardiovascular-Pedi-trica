import express from 'express'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autenticar, rutasAuth } from './auth.mjs'
import { config } from './config.mjs'
import { pool } from './db.mjs'
import { ErrorApi, manejadorErrores } from './errores.mjs'
import { rutasAdmin, rutasListas } from './rutas-admin.mjs'
import { rutasAlertas, rutasExportacion, rutasIndicadores } from './rutas-consultas.mjs'
import { rutasImportaciones } from './rutas-importaciones.mjs'
import { rutasPacientes } from './rutas-pacientes.mjs'
import { inicializarBase } from './schema.mjs'

const app = express()
app.disable('x-powered-by')
// Detrás de un proxy inverso (nginx, IIS...) defina TRUST_PROXY=1 para que el límite de intentos use la IP real.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || true)
app.use(helmet({ contentSecurityPolicy: { directives: { 'default-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:'] } } }))
app.use(express.json({ limit: '15mb' }))

// Los datos clínicos nunca deben quedar en cachés del navegador o de proxies.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/salud', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', rutasAuth)
app.use('/api/listas', autenticar, rutasListas)
app.use('/api/pacientes', autenticar, rutasPacientes)
app.use('/api/alertas', autenticar, rutasAlertas)
app.use('/api/indicadores', autenticar, rutasIndicadores)
app.use('/api/exportacion', autenticar, rutasExportacion)
app.use('/api/importaciones', autenticar, rutasImportaciones)
app.use('/api/admin', autenticar, rutasAdmin)
app.use('/api', (_req, _res, next) => next(new ErrorApi(404, 'NO_ENCONTRADO', 'Ruta no encontrada.')))

// En producción el mismo servidor entrega la aplicación compilada (npm run build).
const dist = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*ruta}', (_req, res) => res.sendFile(`${dist}/index.html`))
}

app.use(manejadorErrores)

await inicializarBase(pool, config.admin)
app.listen(config.puerto, () => console.log(`API escuchando en http://localhost:${config.puerto}`))
