import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { alExpirar, api, borrarToken, guardarToken, obtenerToken } from '../lib/api'
import type { Perfil } from '../types/db'

interface AuthState {
  perfil: Perfil | null
  cargando: boolean
  iniciarSesion: (email: string, password: string) => Promise<void>
  cerrarSesion: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const queryClient = useQueryClient()

  const cerrarSesion = useCallback(() => {
    borrarToken()
    setPerfil(null)
    // Los datos clínicos en caché no deben sobrevivir al cierre de sesión.
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    alExpirar(cerrarSesion)
    if (!obtenerToken()) {
      setCargando(false)
      return () => alExpirar(null)
    }
    api
      .get<Perfil>('/auth/me')
      .then(setPerfil)
      .catch(() => borrarToken())
      .finally(() => setCargando(false))
    return () => alExpirar(null)
  }, [cerrarSesion])

  async function iniciarSesion(email: string, password: string) {
    const { token, perfil: perfilNuevo } = await api.post<{ token: string; perfil: Perfil }>('/auth/login', { email, password })
    guardarToken(token)
    setPerfil(perfilNuevo)
  }

  return <AuthContext.Provider value={{ perfil, cargando, iniciarSesion, cerrarSesion }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
