import { useLayoutEffect, useRef, type ComponentType, type SVGProps } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useInactivityLogout } from '../auth/useInactivityLogout'
import {
  IconoAdultos,
  IconoBajar,
  IconoCampana,
  IconoChevronAbajo,
  IconoEngranaje,
  IconoGrafico,
  IconoPacientes,
  IconoSalir,
} from '../components/iconos'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { useAlertas } from '../hooks/useAlertas'
import { GrupoActivoProvider, useGrupoActivo } from '../lib/grupoActivo'
import type { Rol } from '../types/db'

interface Enlace {
  to: string
  etiqueta: string
  icono: ComponentType<SVGProps<SVGSVGElement>>
  /** Si se indica, la pestaña solo aparece para estos roles (las rutas ya están protegidas aparte). */
  roles?: Rol[]
}

const enlaces: Enlace[] = [
  { to: '/pacientes', etiqueta: 'Pediátricos', icono: IconoPacientes },
  { to: '/adultos', etiqueta: 'Adultos', icono: IconoAdultos },
  { to: '/alertas', etiqueta: 'Alertas de seguimiento', icono: IconoCampana },
  { to: '/indicadores', etiqueta: 'Indicadores', icono: IconoGrafico },
  { to: '/datos', etiqueta: 'Exportar datos', icono: IconoBajar, roles: ['administrador', 'registrador'] },
  { to: '/administracion', etiqueta: 'Administración', icono: IconoEngranaje, roles: ['administrador'] },
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

/** Contador de alertas activas junto a la pestaña: rojo si alguna ya está vencida. Cuenta las del
 * grupo activo (pediátricos/adultos), igual que lo que se ve al entrar a Alertas de seguimiento. */
function ContadorAlertas() {
  const { grupo } = useGrupoActivo()
  const { data: alertas } = useAlertas(grupo)
  const total = alertas?.length ?? 0
  if (total === 0) return null
  const vencidas = alertas?.filter((a) => a.dias_desde_referencia > 0).length ?? 0
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums text-white ${
        vencidas > 0 ? 'bg-[var(--pabon-rojo)]' : 'bg-[var(--pabon-azul-oscuro)]'
      }`}
      title={`${total} ${total === 1 ? 'alerta activa' : 'alertas activas'}${vencidas > 0 ? `, ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : ''}`}
    >
      {total > 99 ? '99+' : total}
    </span>
  )
}

export function AppShell() {
  const { perfil, cerrarSesion } = useAuth()
  useInactivityLogout(15)
  const refEncabezado = useRef<HTMLElement>(null)

  // Publica el alto real del encabezado fijo como variable CSS (--alto-encabezado) para que los
  // encabezados de tabla "sticky" se peguen justo debajo, y no detrás, de él. Se mide en vez de
  // fijarlo a mano porque cambia con el ancho de la pantalla y con la fuente.
  useLayoutEffect(() => {
    const encabezado = refEncabezado.current
    if (!encabezado) return
    const publicar = () => document.documentElement.style.setProperty('--alto-encabezado', `${encabezado.offsetHeight}px`)
    publicar()
    const observador = new ResizeObserver(publicar)
    observador.observe(encabezado)
    return () => observador.disconnect()
  }, [])

  const visibles = enlaces.filter((enlace) => !enlace.roles || (perfil && enlace.roles.includes(perfil.rol)))
  const rol = perfil ? rolEtiqueta[perfil.rol] : ''

  return (
    <GrupoActivoProvider>
    <div className="min-h-screen bg-[var(--lienzo)]">
      {/* Fondo blanco sólido (no translúcido): el logo de Clínica Pabón trae su propio fondo blanco
          y sobre un encabezado semitransparente se notaría como un recuadro al pasar contenido debajo. */}
      <header ref={refEncabezado} className="sticky top-0 z-40 border-b border-slate-200/80 bg-white">
        {/* Franja institucional (gris / azul oscuro / azul claro del manual de marca). Va en el
            borde superior: debajo de las pestañas se confundía con la línea de la pestaña activa. */}
        <div className="flex h-[3px]" aria-hidden>
          <span className="flex-1 bg-[var(--pabon-gris)]" />
          <span className="flex-1 bg-[var(--pabon-azul-oscuro)]" />
          <span className="flex-1 bg-[var(--pabon-azul-claro)]" />
        </div>

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Marca: Clínica Pabón | Centro de Cuidados Cardioneurovasculares (el mismo par de logos que
              en la pantalla de inicio de sesión). En el celular van solo los logos: con el título al
              lado no cabía nada completo y ambos textos quedaban recortados. */}
          <NavLink
            to="/pacientes"
            className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 sm:gap-3.5"
          >
            <img src="/branding/clinica-pabon-logo.png" alt="Clínica Pabón" className="h-9 w-auto flex-none sm:h-10" />
            <span aria-hidden className="h-8 w-px flex-none bg-slate-200" />
            <img
              src="/branding/centro-cardioneurovascular-icono.png"
              alt=""
              className="h-10 w-10 flex-none rounded-full shadow-sm ring-1 ring-slate-200"
            />
            <div className="hidden min-w-0 leading-tight sm:block">
              <p className="truncate text-[15px] font-semibold tracking-tight text-slate-900">Cirugía Cardiovascular Pediátrica</p>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                Centro de Cuidados Cardioneurovasculares Pabón
              </p>
            </div>
          </NavLink>

          <DropdownMenu>
            <DropdownMenuTrigger className="group flex flex-none items-center gap-2.5 rounded-full border border-transparent p-1 outline-none transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 data-[state=open]:border-slate-200 data-[state=open]:bg-slate-50 sm:pr-3">
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] text-xs font-semibold text-white"
                title={perfil?.nombre_completo}
              >
                {iniciales(perfil?.nombre_completo)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold text-slate-900">{perfil?.nombre_completo}</span>
                <span className="block text-xs text-slate-500">{rol}</span>
              </span>
              <IconoChevronAbajo className="hidden h-4 w-4 text-[var(--pabon-azul-oscuro)] opacity-60 transition-transform group-data-[state=open]:rotate-180 sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1.5">
              <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] text-sm font-semibold text-white">
                  {iniciales(perfil?.nombre_completo)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{perfil?.nombre_completo}</span>
                  {perfil?.email && <span className="block truncate text-xs font-normal text-slate-500">{perfil.email}</span>}
                  <span className="mt-1 inline-flex rounded-full bg-[var(--pabon-azul-oscuro)]/[0.08] px-2 py-0.5 text-[11px] font-medium text-[var(--pabon-azul-oscuro)]">
                    {rol}
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => cerrarSesion()} className="px-2 py-2">
                <IconoSalir className="h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav
          aria-label="Secciones"
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
        >
          {visibles.map(({ to, etiqueta, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group relative flex flex-none items-center gap-2 whitespace-nowrap rounded-md px-3 pb-3 pt-1.5 text-sm font-medium outline-none transition-colors focus-visible:bg-slate-100 ${
                  isActive ? 'text-[var(--pabon-azul-oscuro)]' : 'text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icono className={`h-[18px] w-[18px] transition-opacity ${isActive ? '' : 'opacity-55 group-hover:opacity-100'}`} />
                  {etiqueta}
                  {to === '/alertas' && <ContadorAlertas />}
                  <span
                    aria-hidden
                    className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-colors ${
                      isActive ? 'bg-[var(--pabon-azul-oscuro)]' : 'bg-transparent group-hover:bg-slate-200'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
    </GrupoActivoProvider>
  )
}
