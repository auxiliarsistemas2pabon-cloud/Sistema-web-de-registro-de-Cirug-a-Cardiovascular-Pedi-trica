import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useInactivityLogout } from '../auth/useInactivityLogout'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'

const enlaces = [
  { to: '/pacientes', etiqueta: 'Pacientes' },
  { to: '/alertas', etiqueta: 'Alertas de seguimiento' },
  { to: '/indicadores', etiqueta: 'Indicadores' },
]

const rolEtiqueta: Record<string, string> = {
  administrador: 'Administrador',
  registrador: 'Registrador',
  consulta: 'Consulta',
}

/** Iniciales para el avatar circular (primeras letras del primer y segundo nombre/apellido). */
function iniciales(nombreCompleto: string | undefined) {
  if (!nombreCompleto) return '?'
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function tabClase(activo: boolean) {
  return `whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
    activo
      ? 'border-[var(--pabon-azul-oscuro)] text-[var(--pabon-azul-oscuro)]'
      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
  }`
}

export function AppShell() {
  const { perfil, cerrarSesion } = useAuth()
  useInactivityLogout(15)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/pacientes" className="flex min-w-0 items-center gap-3">
            <img
              src="/branding/centro-cardioneurovascular-icono.png"
              alt=""
              className="h-9 w-9 flex-none rounded-full ring-2 ring-[var(--pabon-azul-oscuro)]/10"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-slate-900">Cirugía Cardiovascular Pediátrica</p>
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Centro de Cuidados Cardioneurovasculares Pabón
              </p>
            </div>
          </NavLink>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex flex-none items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]/40">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium text-slate-800">{perfil?.nombre_completo}</p>
                <p className="text-xs text-slate-400">{perfil ? rolEtiqueta[perfil.rol] : ''}</p>
              </div>
              <div
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)] text-xs font-semibold text-white"
                title={perfil?.nombre_completo}
              >
                {iniciales(perfil?.nombre_completo)}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="sm:hidden">
                <p className="font-medium text-slate-800">{perfil?.nombre_completo}</p>
                <p className="text-xs font-normal text-slate-400">{perfil ? rolEtiqueta[perfil.rol] : ''}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem variant="destructive" onClick={() => cerrarSesion()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                  <path d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {enlaces.map((enlace) => (
            <NavLink key={enlace.to} to={enlace.to} className={({ isActive }) => tabClase(isActive)}>
              {enlace.etiqueta}
            </NavLink>
          ))}
          {(perfil?.rol === 'administrador' || perfil?.rol === 'registrador') && (
            <NavLink to="/datos" className={({ isActive }) => tabClase(isActive)}>
              Exportar datos
            </NavLink>
          )}
          {perfil?.rol === 'administrador' && (
            <NavLink to="/administracion" className={({ isActive }) => tabClase(isActive)}>
              Administración
            </NavLink>
          )}
        </nav>

        <div className="flex h-[3px]" aria-hidden>
          <span className="flex-1 bg-[var(--pabon-gris)]" />
          <span className="flex-1 bg-[var(--pabon-azul-oscuro)]" />
          <span className="flex-1 bg-[var(--pabon-azul-claro)]" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
