import { Navigate, Outlet } from 'react-router-dom'
import type { Rol } from '../types/db'
import { useAuth } from './AuthProvider'

interface Props {
  rolesPermitidos?: Rol[]
}

export function ProtectedRoute({ rolesPermitidos }: Props) {
  const { perfil, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Cargando…
      </div>
    )
  }

  if (!perfil) {
    return <Navigate to="/login" replace />
  }

  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
    return <Navigate to="/pacientes" replace />
  }

  return <Outlet />
}
