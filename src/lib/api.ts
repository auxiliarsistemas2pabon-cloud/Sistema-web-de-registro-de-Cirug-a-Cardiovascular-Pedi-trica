// La sesión viaja en una cookie HttpOnly: JavaScript no puede leer su identificador.
import { refrescarTodo } from './clienteConsultas'

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

let alExpirarSesion: (() => void) | null = null
export function alExpirar(callback: (() => void) | null) {
  alExpirarSesion = callback
}

interface OpcionesPeticion { signal?: AbortSignal }

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown, opciones: OpcionesPeticion = {}): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    credentials: 'same-origin',
    signal: opciones.signal,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-Cardio-Request': '1',
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  })

  const texto = await respuesta.text()
  const datos = texto ? JSON.parse(texto) : null

  if (!respuesta.ok) {
    const error: CuerpoError = datos?.error ?? { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' }
    if (respuesta.status === 401 && error.codigo === 'NO_AUTENTICADO') {
      alExpirarSesion?.()
    }
    throw new ErrorApi(respuesta.status, error)
  }
  // Todo guardado (lo que no es una consulta) deja desactualizado lo que se ve en otras partes:
  // un paciente nuevo cambia las listas, el inicio, las alertas y los indicadores.
  if (metodo !== 'GET' && !ruta.startsWith('/auth')) refrescarTodo()
  return datos as T
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown, opciones?: OpcionesPeticion) => peticion<T>('POST', ruta, cuerpo ?? {}, opciones),
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
