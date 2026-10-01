import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export type GrupoActivo = 'pediatricos' | 'adultos'

interface GrupoActivoState {
  grupo: GrupoActivo
  setGrupo: (grupo: GrupoActivo) => void
}

const GrupoActivoContext = createContext<GrupoActivoState | null>(null)

/**
 * Pediátricos/Adultos como un contexto global de la aplicación, no una preferencia de cada
 * página: entrar a /adultos (pestaña "Adultos" del menú, o cualquier enlace a una ficha de
 * adulto) dice "ahora estoy viendo adultos", y Alertas, Indicadores y Exportar datos abren
 * mostrando ese grupo por defecto hasta que se visite la otra sección. Se deriva de la URL (no de
 * un clic puntual) para que también funcione con "atrás/adelante" del navegador o un enlace
 * directo, no solo con un clic en la pestaña del menú.
 */
export function GrupoActivoProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [grupo, setGrupo] = useState<GrupoActivo>('pediatricos')

  useEffect(() => {
    if (location.pathname.startsWith('/adultos')) setGrupo('adultos')
    else if (location.pathname.startsWith('/pacientes')) setGrupo('pediatricos')
  }, [location.pathname])

  return <GrupoActivoContext.Provider value={{ grupo, setGrupo }}>{children}</GrupoActivoContext.Provider>
}

export function useGrupoActivo() {
  const ctx = use(GrupoActivoContext)
  if (!ctx) throw new Error('useGrupoActivo debe usarse dentro de GrupoActivoProvider')
  return ctx
}
