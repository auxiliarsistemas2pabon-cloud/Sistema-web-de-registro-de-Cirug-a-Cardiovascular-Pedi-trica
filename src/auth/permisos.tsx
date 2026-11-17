import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

export const NOMBRES_ROL = { administrador: 'Administrador', registrador: 'Registro clínico', consulta: 'Consulta' } as const
export function usePermisos() {
  const { perfil } = useAuth()
  return { administrar: perfil?.rol === 'administrador', escribir: perfil?.rol === 'administrador' || perfil?.rol === 'registrador' }
}
export function SoloEscritura({ children }: { children: ReactNode }) {
  return usePermisos().escribir ? children : null
}
