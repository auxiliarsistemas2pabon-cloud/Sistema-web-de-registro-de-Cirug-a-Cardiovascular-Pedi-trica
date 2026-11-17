import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { alExpirar, api } from '../lib/api'
import type { PasoAuth, Perfil } from '../types/db'

interface EstadoAcceso { perfil: Perfil; paso: PasoAuth }

interface AuthState {
  perfil: Perfil | null
  paso: PasoAuth | null
  cargando: boolean
  iniciarSesion: (email: string, password: string) => Promise<void>
  cerrarSesion: () => Promise<void>
  refrescarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const ID_PESTANA = crypto.randomUUID?.() ?? String(Math.random())
const CLAVE_CIERRE_PENDIENTE = 'cardio_logout_pendiente'
let cierrePendienteEnMemoria = false

function marcarCierrePendiente(pendiente: boolean) {
  cierrePendienteEnMemoria = pendiente
  try {
    if (pendiente) localStorage.setItem(CLAVE_CIERRE_PENDIENTE, '1')
    else localStorage.removeItem(CLAVE_CIERRE_PENDIENTE)
  } catch { /* La protección en memoria se mantiene si el almacenamiento está bloqueado. */ }
}

function hayCierrePendiente() {
  try { return cierrePendienteEnMemoria || localStorage.getItem(CLAVE_CIERRE_PENDIENTE) === '1' }
  catch { return cierrePendienteEnMemoria }
}

const MENSAJE_CIERRE = 'No se pudo cerrar la sesión en el servidor. Compruebe la conexión y vuelva a intentar cerrar sesión.'

function avisarCambioSesion() {
  if (typeof BroadcastChannel === 'undefined') return
  const canal = new BroadcastChannel('cardio-auth')
  canal.postMessage({ origen: ID_PESTANA })
  canal.close()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [paso, setPaso] = useState<PasoAuth | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCierre, setErrorCierre] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const versionSesion = useRef(0)
  const cierreEnCurso = useRef<Promise<void> | null>(null)

  const limpiarSesion = useCallback(() => {
    versionSesion.current++
    setPerfil(null)
    setPaso(null)
    // Los datos clínicos en caché no deben sobrevivir al cierre de sesión.
    queryClient.clear()
  }, [queryClient])

  const refrescarSesion = useCallback(async () => {
    const version = versionSesion.current
    const estado = await api.get<EstadoAcceso>('/auth/me')
    if (version !== versionSesion.current) return
    setPerfil(estado.perfil)
    setPaso(estado.paso)
  }, [])

  const revocarEnServidor = useCallback(() => {
    if (cierreEnCurso.current) return cierreEnCurso.current
    const operacion = api.post<void>('/auth/logout', {}, { signal: AbortSignal.timeout(10_000) }).then(() => {
      marcarCierrePendiente(false)
      setErrorCierre(null)
    }).finally(() => { cierreEnCurso.current = null })
    cierreEnCurso.current = operacion
    return operacion
  }, [])

  const cerrarSesion = useCallback(async () => {
    // Solo se persiste la intención, nunca un token ni información clínica.
    marcarCierrePendiente(true)
    limpiarSesion()
    avisarCambioSesion()
    try {
      await revocarEnServidor()
    } catch {
      setErrorCierre(MENSAJE_CIERRE)
    }
  }, [limpiarSesion, revocarEnServidor])

  useEffect(() => {
    // Elimina cualquier token del mecanismo anterior al actualizar la aplicación.
    sessionStorage.removeItem('cardio_token')
    alExpirar(limpiarSesion)
    const canal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cardio-auth')
    if (canal) canal.onmessage = (evento) => {
      if (evento.data?.origen !== ID_PESTANA) limpiarSesion()
    }
    const alCambiarAlmacenamiento = (evento: StorageEvent) => {
      if (evento.key !== CLAVE_CIERRE_PENDIENTE) return
      cierrePendienteEnMemoria = evento.newValue === '1'
      if (cierrePendienteEnMemoria) limpiarSesion()
    }
    window.addEventListener('storage', alCambiarAlmacenamiento)
    const restaurar = async () => {
      if (hayCierrePendiente()) {
        limpiarSesion()
        try { await revocarEnServidor() } catch { setErrorCierre(MENSAJE_CIERRE) }
        return
      }
      await refrescarSesion()
    }
    const alRestaurarPagina = (evento: PageTransitionEvent) => {
      if (!evento.persisted) return
      setCargando(true)
      void restaurar().catch(limpiarSesion).finally(() => setCargando(false))
    }
    window.addEventListener('pageshow', alRestaurarPagina)
    restaurar()
      .catch(() => limpiarSesion())
      .finally(() => setCargando(false))
    return () => {
      alExpirar(null); canal?.close()
      window.removeEventListener('pageshow', alRestaurarPagina)
      window.removeEventListener('storage', alCambiarAlmacenamiento)
    }
  }, [limpiarSesion, refrescarSesion, revocarEnServidor])

  async function iniciarSesion(email: string, password: string) {
    if (hayCierrePendiente()) await revocarEnServidor()
    const version = ++versionSesion.current
    const estado = await api.post<EstadoAcceso>('/auth/login', { email, password })
    if (version !== versionSesion.current) return
    queryClient.clear()
    avisarCambioSesion()
    setErrorCierre(null)
    setPerfil(estado.perfil)
    setPaso(estado.paso)
  }

  return <AuthContext.Provider value={{ perfil, paso, cargando, iniciarSesion, cerrarSesion, refrescarSesion }}>
    {errorCierre && <div role="alert" className="bg-destructive p-3 text-sm text-white">
      {errorCierre} <button type="button" className="underline" onClick={() => void cerrarSesion()}>Reintentar cierre de sesión</button>
    </div>}
    {children}
  </AuthContext.Provider>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
