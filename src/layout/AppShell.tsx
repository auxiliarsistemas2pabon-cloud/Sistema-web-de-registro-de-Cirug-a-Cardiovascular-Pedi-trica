import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useInactivityLogout } from '../auth/useInactivityLogout'

const enlaces = [
  { to: '/pacientes', etiqueta: 'Pacientes' },
  { to: '/alertas', etiqueta: 'Alertas de seguimiento' },
  { to: '/indicadores', etiqueta: 'Indicadores' },
]

function linkClase(activo: boolean) {
  return `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
    activo
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`
}

export function AppShell() {
  const { perfil, cerrarSesion } = useAuth()
  useInactivityLogout(15)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <NavLink to="/pacientes" className="mr-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
              Cirugía Cardiovascular Pediátrica
            </NavLink>
            {enlaces.map((enlace) => (
              <NavLink
                key={enlace.to}
                to={enlace.to}
                className={({ isActive }) => linkClase(isActive)}
              >
                {enlace.etiqueta}
              </NavLink>
            ))}
            {(perfil?.rol === 'administrador' || perfil?.rol === 'registrador') && (
              <NavLink to="/datos" className={({ isActive }) => linkClase(isActive)}>
                Importar / exportar
              </NavLink>
            )}
            {perfil?.rol === 'administrador' && (
              <NavLink to="/administracion" className={({ isActive }) => linkClase(isActive)}>
                Administración
              </NavLink>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {perfil?.nombre_completo} · {perfil?.rol}
            </span>
            <button
              type="button"
              onClick={() => cerrarSesion()}
              className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
