import { config } from './config.mjs'
import { ErrorApi } from './errores.mjs'

export function protegerPeticion(req, _res, next) {
  if ((config.produccion || config.httpsLocal) && !req.secure) {
    return next(new ErrorApi(400, 'HTTPS_REQUERIDO', 'La API requiere HTTPS.'))
  }
  // El frontend y la API comparten origen. No habilitar CORS con credenciales.
  const sitio = req.get('Sec-Fetch-Site')
  if (sitio && !['same-origin', 'none'].includes(sitio)) {
    return next(new ErrorApi(403, 'ORIGEN_NO_PERMITIDO', 'Origen de petición no permitido.'))
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origen = req.get('Origin')
    const esperado = config.origenPublico ?? `${req.protocol}://${req.get('Host')}`
    if (origen && origen !== esperado) return next(new ErrorApi(403, 'ORIGEN_NO_PERMITIDO', 'Origen de petición no permitido.'))
    // Un formulario o fetch de otro origen no puede aportar este encabezado sin un preflight CORS.
    // También cubre login CSRF y navegadores sin Fetch Metadata.
    if (req.get('X-Cardio-Request') !== '1') {
      return next(new ErrorApi(403, 'CSRF', 'Petición no permitida. Recargue la aplicación.'))
    }
    if (!req.is('application/json')) {
      return next(new ErrorApi(415, 'TIPO_NO_ADMITIDO', 'Envíe un objeto application/json.'))
    }
  }
  next()
}

export function protegerDestino(req, _res, next) {
  if ((config.produccion || config.httpsLocal) && !req.secure) return next(new ErrorApi(400, 'HTTPS_REQUERIDO', 'La aplicación requiere HTTPS.'))
  const permitidos = config.produccion ? [new URL(config.origenPublico).hostname] : ['localhost', '127.0.0.1', '[::1]']
  if (!permitidos.includes(req.hostname)) return next(new ErrorApi(403, 'HOST_NO_PERMITIDO', 'Nombre de servidor no permitido.'))
  next()
}

export function saludSoloLocal(req, res, next) {
  const direccion = req.socket.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direccion) || req.get('X-Forwarded-For') || req.get('Origin') || req.get('Sec-Fetch-Site')) return res.status(404).end()
  res.setHeader('Cache-Control', 'no-store')
  next()
}
