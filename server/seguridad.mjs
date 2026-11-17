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
