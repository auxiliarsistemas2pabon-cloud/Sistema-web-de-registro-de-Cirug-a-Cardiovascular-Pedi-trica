import { useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'

const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

/** Cierra la sesión tras `minutos` sin actividad del usuario (mouse, teclado, touch, scroll). */
export function useInactivityLogout(minutos = 15) {
  const { cerrarSesion } = useAuth()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reiniciarTemporizador() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        cerrarSesion()
      }, minutos * 60 * 1000)
    }

    reiniciarTemporizador()
    for (const evento of EVENTOS_ACTIVIDAD) {
      window.addEventListener(evento, reiniciarTemporizador)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      for (const evento of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(evento, reiniciarTemporizador)
      }
    }
  }, [minutos, cerrarSesion])
}
