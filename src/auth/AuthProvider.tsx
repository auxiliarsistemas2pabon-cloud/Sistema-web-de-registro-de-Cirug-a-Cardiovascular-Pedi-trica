import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types/db'

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function cargarPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, rol, activo')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('No se pudo cargar el perfil del usuario', error)
    return null
  }
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return
      setSession(data.session)
      if (data.session) {
        setPerfil(await cargarPerfil(data.session.user.id))
      }
      setCargando(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_evento, nuevaSesion) => {
      if (!activo) return
      setSession(nuevaSesion)
      if (nuevaSesion) {
        setPerfil(await cargarPerfil(nuevaSesion.user.id))
      } else {
        setPerfil(null)
      }
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, perfil, cargando, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
