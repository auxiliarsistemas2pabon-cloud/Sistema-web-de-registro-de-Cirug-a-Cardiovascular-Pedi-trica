import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { NOMBRES_ROL } from '../auth/permisos'
import { useInactivityLogout } from '../auth/useInactivityLogout'
import {
  IconoAdultos,
  IconoBajar,
  IconoCampana,
  IconoCerrar,
  IconoChevronAbajo,
  IconoEngranaje,
  IconoGrafico,
  IconoInicio,
  IconoMenu,
  IconoPacientes,
  IconoReloj,
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

interface Enlace {
  to: string
  etiqueta: string
  icono: ComponentType<SVGProps<SVGSVGElement>>
}

interface GrupoEnlaces {
  titulo: string
  enlaces: Enlace[]
}

const gruposEnlaces: GrupoEnlaces[] = [
  {
    titulo: 'Registro clínico',
    enlaces: [
      { to: '/inicio', etiqueta: 'Inicio', icono: IconoInicio },
      { to: '/pacientes', etiqueta: 'Pacientes pediátricos', icono: IconoPacientes },
      { to: '/adultos', etiqueta: 'Pacientes adultos', icono: IconoAdultos },
      { to: '/alertas', etiqueta: 'Alertas de seguimiento', icono: IconoCampana },
    ],
  },
  {
    titulo: 'Análisis y datos',
    enlaces: [
      { to: '/indicadores', etiqueta: 'Indicadores', icono: IconoGrafico },
      { to: '/datos', etiqueta: 'Importar y exportar', icono: IconoBajar },
    ],
  },
  {
    titulo: 'Configuración',
    enlaces: [{ to: '/administracion', etiqueta: 'Administración', icono: IconoEngranaje }],
  },
]

const todosLosEnlaces = gruposEnlaces.flatMap((g) => g.enlaces)


/** Iniciales para el avatar circular (primeras letras del primer y segundo nombre/apellido). */
function iniciales(nombreCompleto: string | undefined) {
  if (!nombreCompleto) return '?'
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

/** Franja institucional (gris / azul oscuro / azul claro del manual de marca). */
function FranjaInstitucional() {
  return (
    <div className="flex h-[3px] flex-none" aria-hidden>
      <span className="flex-1 bg-[var(--pabon-gris)]" />
      <span className="flex-1 bg-[var(--pabon-azul-oscuro)]" />
      <span className="flex-1 bg-[var(--pabon-azul-claro)]" />
    </div>
  )
}

/** Contador de alertas activas junto a la sección: rojo si alguna ya está vencida. Cuenta las del
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
        // Azul claro (no el oscuro): se tiene que ver tanto sobre el azul del menú como sobre el blanco del ítem activo.
        vencidas > 0 ? 'bg-[var(--pabon-rojo)]' : 'bg-[var(--pabon-azul-claro)]'
      }`}
      title={`${total} ${total === 1 ? 'alerta activa' : 'alertas activas'}${vencidas > 0 ? `, ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}` : ''}`}
    >
      {total > 99 ? '99+' : total}
    </span>
  )
}

/** Los dos logos (Clínica Pabón | Centro de Cuidados Cardioneurovasculares), los mismos del inicio de sesión. */
function Logos() {
  return (
    <span className="flex items-center gap-3">
      <img src="/branding/clinica-pabon-logo.png" alt="Clínica Pabón" className="h-9 w-auto flex-none" />
      <span aria-hidden className="h-8 w-px flex-none bg-slate-200" />
      <img
        src="/branding/centro-cardioneurovascular-icono.png"
        alt=""
        className="h-10 w-10 flex-none rounded-full shadow-sm ring-1 ring-slate-200"
      />
    </span>
  )
}

/** Logos del encabezado (tableta): sobre blanco, sin placa. */
function Marca() {
  return (
    <NavLink to="/inicio" className="flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40">
      <Logos />
    </NavLink>
  )
}

/** Menú de secciones agrupado, en el azul institucional (el mismo degradado de la bienvenida y del
 * inicio de sesión) para que se distinga a simple vista del contenido. Fijo a la izquierda desde
 * `lg`; en pantallas pequeñas se despliega encima. */
function BarraLateral({ abierta, cerrar }: { abierta: boolean; cerrar: () => void }) {
  const { perfil } = useAuth()
  return (
    <aside
      id="menu-secciones"
      aria-label="Navegación principal"
      className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col bg-gradient-to-b from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] text-white transition-transform duration-300 lg:z-30 lg:translate-x-0 ${
        abierta ? 'translate-x-0 shadow-2xl shadow-slate-900/30' : '-translate-x-full'
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 top-24 h-56 w-56 rounded-full bg-[var(--pabon-azul-claro)]/15 blur-3xl" />

      <div className="relative px-4 pb-4 pt-[calc(1rem+3px)]">
        <div className="flex items-start gap-2">
          {/* El logo de Clínica Pabón trae fondo blanco: va sobre una placa blanca para que no se
              vea como un recuadro encima del azul. */}
          <NavLink
            to="/inicio"
            onClick={cerrar}
            className="flex min-w-0 flex-1 rounded-xl bg-white px-3 py-2 shadow-md shadow-black/15 outline-none focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <Logos />
          </NavLink>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar menú"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/50 lg:hidden"
          >
            <IconoCerrar className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 px-1 leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-white">Cirugía Cardiovascular</span>
          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-white/70">
            Centro de Cuidados Cardioneurovasculares Pabón
          </span>
        </p>
      </div>

      <nav
        aria-label="Secciones"
        className="relative min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-3 py-3 [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]"
      >
        {gruposEnlaces.map((grupo) => ({ ...grupo, enlaces: grupo.enlaces.filter((enlace) =>
          !['/datos', '/administracion'].includes(enlace.to) || perfil?.rol === 'administrador') })).filter((g) => g.enlaces.length).map((grupo) => (
          <div key={grupo.titulo} className="mb-4 last:mb-0">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{grupo.titulo}</p>
            <div className="space-y-0.5">
              {grupo.enlaces.map(({ to, etiqueta, icono: Icono }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={cerrar}
                  className={({ isActive }) =>
                    `group flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-white/50 ${
                      isActive
                        ? 'bg-white text-[var(--pabon-azul-oscuro)] shadow-md shadow-black/15'
                        : 'text-white/85 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icono
                        className={`h-[18px] w-[18px] flex-none transition-opacity ${
                          isActive ? 'text-[var(--pabon-azul-oscuro)]' : 'opacity-70 group-hover:opacity-100'
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
                      {to === '/alertas' && <ContadorAlertas />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <p className="relative flex items-center gap-2 border-t border-white/10 px-5 py-3 text-[11px] text-white/70">
        <IconoReloj className="h-3.5 w-3.5 flex-none" />
        Cierre automático tras 15 min sin uso
      </p>
    </aside>
  )
}

function MenuUsuario() {
  const { perfil, cerrarSesion } = useAuth()
  const rol = perfil ? NOMBRES_ROL[perfil.rol] : ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex flex-none items-center gap-2.5 rounded-full border border-transparent p-1 outline-none transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 data-[state=open]:border-slate-200 data-[state=open]:bg-slate-50 sm:pr-3">
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] text-xs font-semibold text-white"
          title={perfil?.nombre_completo}
        >
          {iniciales(perfil?.nombre_completo)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[14rem] truncate text-sm font-semibold text-slate-900">{perfil?.nombre_completo}</span>
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
        <DropdownMenuItem asChild><NavLink to="/seguridad">Seguridad de mi cuenta</NavLink></DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => cerrarSesion()} className="px-2 py-2">
          <IconoSalir className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  useInactivityLogout(15)
  const refEncabezado = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const seccionActual = todosLosEnlaces.find((e) => pathname.startsWith(e.to))

  useEffect(() => setMenuAbierto(false), [pathname])
  useEffect(() => {
    if (!menuAbierto) return
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false)
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [menuAbierto])

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

  return (
    <GrupoActivoProvider>
      <div className="min-h-screen bg-[var(--lienzo)]">
        {/* Una sola franja de lado a lado, por encima del menú y del encabezado (si cada uno llevara
            la suya, se verían dos franjas cortadas una junto a la otra). */}
        <div className="fixed inset-x-0 top-0 z-[60]">
          <FranjaInstitucional />
        </div>
        <BarraLateral abierta={menuAbierto} cerrar={() => setMenuAbierto(false)} />

        {menuAbierto && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
            className="animate-in fade-in-0 fixed inset-0 z-40 bg-slate-900/40 duration-200 lg:hidden"
          />
        )}

        <div className="min-h-screen lg:pl-[17rem]">
          {/* Fondo blanco sólido (no translúcido): el logo de Clínica Pabón trae su propio fondo blanco
              y sobre un encabezado semitransparente se notaría como un recuadro al pasar contenido debajo. */}
          <header ref={refEncabezado} className="sticky top-0 z-20 border-b border-slate-200/80 bg-white">
            <div aria-hidden className="h-[3px]" />
            <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuAbierto(true)}
                  aria-expanded={menuAbierto}
                  aria-controls="menu-secciones"
                  aria-label="Abrir menú de secciones"
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-slate-200 text-[var(--pabon-azul-oscuro)] outline-none hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 lg:hidden"
                >
                  <IconoMenu className="h-5 w-5" />
                </button>
                {/* En el celular y la tableta los logos van aquí (en la barra lateral quedan ocultos). */}
                <div className="hidden sm:block lg:hidden">
                  <Marca />
                </div>
                <span aria-hidden className="hidden h-8 w-px flex-none bg-slate-200 sm:block lg:hidden" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Sistema de registro clínico
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 truncate text-[15px] font-semibold text-slate-900">
                    {seccionActual?.etiqueta ?? 'Cirugía Cardiovascular'}
                  </p>
                </div>
              </div>
              <MenuUsuario />
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </GrupoActivoProvider>
  )
}
