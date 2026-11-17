import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({ administrador = false, escritura = false }: { administrador?: boolean; escritura?: boolean }) {
  const { perfil, paso, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Cargando…
      </div>
    )
  }

  if (!perfil || paso !== 'completo') {
    return <Navigate to="/login" replace />
  }
  if ((administrador && perfil.rol !== 'administrador') || (escritura && perfil.rol === 'consulta')) {
    return <Navigate to="/inicio" replace />
  }

  return <Outlet />
}
