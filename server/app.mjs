import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autenticar, rutasAuth } from './auth.mjs'
import { config } from './config.mjs'
import { ErrorApi, manejadorErrores } from './errores.mjs'
import { rutasAdmin, rutasListas } from './rutas-admin.mjs'
import { rutasAlertas, rutasExportacion, rutasIndicadores } from './rutas-consultas.mjs'
import { rutasImportaciones } from './rutas-importaciones.mjs'
import { rutasPacientes } from './rutas-pacientes.mjs'
import { rutasPacientesAdultos } from './rutas-pacientes-adultos.mjs'
import { protegerPeticion } from './seguridad.mjs'
import { exigirReautenticacion, exigirRoles, permisosClinicos } from './permisos.mjs'
import { auditarAcceso } from './auditoria-seguridad.mjs'

export const app = express()
app.disable('x-powered-by')
app.use((req, _res, next) => {
  if (!config.produccion && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) {
    return next(new ErrorApi(403, 'HOST_NO_PERMITIDO', 'El servidor local solo admite localhost.'))
  }
  next()
})
app.set('trust proxy', config.trustProxy)
app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: config.produccion ? undefined : false,
  contentSecurityPolicy: { directives: {
    'default-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'], 'object-src': ["'none'"],
    'frame-ancestors': ["'none'"], 'form-action': ["'self'"],
    'upgrade-insecure-requests': config.produccion ? [] : null,
  } },
}))
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// Los datos clínicos nunca deben quedar en cachés del navegador o de proxies.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api', protegerPeticion)
app.use('/api', rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { codigo: 'DEMASIADAS_PETICIONES', mensaje: 'Demasiadas peticiones. Intente de nuevo en un minuto.' } }),
}))

const json = express.json({ limit: '256kb' })

app.get('/api/salud', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', express.json({ limit: '8kb' }), rutasAuth)
app.use('/api/listas', autenticar, permisosClinicos, json, rutasListas)
app.use('/api/pacientes', autenticar, permisosClinicos, auditarAcceso(), json, rutasPacientes)
app.use('/api/pacientes-adultos', autenticar, permisosClinicos, auditarAcceso(), json, rutasPacientesAdultos)
app.use('/api/alertas', autenticar, auditarAcceso(), rutasAlertas)
app.use('/api/indicadores', autenticar, auditarAcceso(), rutasIndicadores)
app.use('/api/exportacion', autenticar, exigirRoles('administrador'), exigirReautenticacion, auditarAcceso('exportacion_solicitada'), rutasExportacion)
app.use('/api/importaciones', autenticar, exigirRoles('administrador'), exigirReautenticacion, auditarAcceso('importacion_solicitada'), express.json({ limit: '15mb' }), rutasImportaciones)
app.use('/api/admin', autenticar, exigirRoles('administrador'), auditarAcceso('administracion_solicitada'), json, rutasAdmin)
app.use('/api', (_req, _res, next) => next(new ErrorApi(404, 'NO_ENCONTRADO', 'Ruta no encontrada.')))

// En producción el mismo servidor entrega la aplicación compilada (npm run build).
const dist = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*ruta}', (_req, res) => res.sendFile(`${dist}/index.html`))
}

app.use(manejadorErrores)

