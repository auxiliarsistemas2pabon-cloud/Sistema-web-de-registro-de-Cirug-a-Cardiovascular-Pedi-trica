// Cliente HTTP de la API propia (Express + MySQL). El token vive en sessionStorage: se pierde al cerrar
// la pestaña y nunca se comparte entre pestañas ni se persiste en disco.

const CLAVE_TOKEN = 'cardio_token'

export interface CuerpoError {
  codigo: string
  mensaje: string
  campos?: Record<string, string>
}

export class ErrorApi extends Error {
  estado: number
  codigo: string
  campos?: Record<string, string>

  constructor(estado: number, error: CuerpoError) {
    super(error.mensaje)
    this.estado = estado
    this.codigo = error.codigo
    this.campos = error.campos
  }
}

export const obtenerToken = () => sessionStorage.getItem(CLAVE_TOKEN)
export const guardarToken = (token: string) => sessionStorage.setItem(CLAVE_TOKEN, token)
export const borrarToken = () => sessionStorage.removeItem(CLAVE_TOKEN)

let alExpirarSesion: (() => void) | null = null
export function alExpirar(callback: (() => void) | null) {
  alExpirarSesion = callback
}

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const token = obtenerToken()
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  })

  // Sesión deslizante: el servidor entrega un token nuevo mientras el usuario esté activo.
  const renovado = respuesta.headers.get('X-Token-Renovado')
  if (renovado) guardarToken(renovado)

  const texto = await respuesta.text()
  const datos = texto ? JSON.parse(texto) : null

  if (!respuesta.ok) {
    const error: CuerpoError = datos?.error ?? { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' }
    if (respuesta.status === 401 && error.codigo === 'NO_AUTENTICADO' && token) {
      borrarToken()
      alExpirarSesion?.()
    }
    throw new ErrorApi(respuesta.status, error)
  }
  return datos as T
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => peticion<T>('POST', ruta, cuerpo ?? {}),
  put: <T>(ruta: string, cuerpo: unknown) => peticion<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => peticion<T>('PATCH', ruta, cuerpo),
}

/** Arma una query string omitiendo valores vacíos. */
export function consulta(parametros: Record<string, string | undefined | null>): string {
  const busqueda = new URLSearchParams()
  for (const [clave, valor] of Object.entries(parametros)) if (valor) busqueda.set(clave, valor)
  const texto = busqueda.toString()
  return texto ? `?${texto}` : ''
}

/** Mensaje legible para mostrar al usuario a partir de cualquier error. */
export function mensajeDe(error: unknown, alternativo = 'No se pudo completar la operación.'): string {
  if (error instanceof ErrorApi) {
    const detalle = error.campos ? Object.values(error.campos).join(' ') : ''
    return detalle ? `${error.message} ${detalle}` : error.message
  }
  return alternativo
}
