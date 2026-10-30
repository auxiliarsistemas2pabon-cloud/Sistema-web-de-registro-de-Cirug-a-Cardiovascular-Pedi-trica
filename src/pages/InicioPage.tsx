import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { IconoCampana, IconoCorazon, IconoGrafico, IconoPacientes } from '../components/iconos'
import { TarjetaKpi } from '../components/TarjetaKpi'
import { useAlertas } from '../hooks/useAlertas'
import { api } from '../lib/api'
import { ACTUALIZACION_PERIODICA } from '../lib/clienteConsultas'
import { hoyIso } from '../lib/fechas'
import type { GrupoActivo } from '../lib/grupoActivo'
import { fichaCompleta } from '../lib/modulos'
import type { EstadoModulo, PacienteAdultoResumen, PacienteResumen } from '../types/db'

const estadosDe = (p: PacienteResumen | PacienteAdultoResumen): EstadoModulo[] => [p.estado_m1, p.estado_m2, p.estado_m3, p.estado_m4, p.estado_m5]

/** Las dos listas completas de pacientes (las mismas que muestran Pediátricos y Adultos), para contar. */
function usePacientes() {
  const pediatricos = useQuery({ ...ACTUALIZACION_PERIODICA, queryKey: ['pacientes', 'inicio'], queryFn: () => api.get<PacienteResumen[]>('/pacientes') })
  const adultos = useQuery({
    ...ACTUALIZACION_PERIODICA,
    queryKey: ['pacientes-adultos', 'inicio'],
    queryFn: () => api.get<PacienteAdultoResumen[]>('/pacientes-adultos'),
  })
  return { pediatricos: pediatricos.data, adultos: adultos.data, cargando: pediatricos.isLoading || adultos.isLoading }
}

function saludo(): string {
  const hora = new Date().getHours()
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** "Jueves, 30 de octubre de 2026" (solo la primera letra en mayúscula). */
function fechaDeHoy(): string {
  const texto = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Portada de la aplicación (pedido del 30-oct): el saludo y cuatro cifras de pediátricos y adultos
 * juntos. El usuario pidió dejar solo esto (sin listas de alertas, accesos ni cirugías recientes).
 */
export function InicioPage() {
  const { perfil } = useAuth()
  const { pediatricos, adultos, cargando } = usePacientes()
  const alertasPed = useAlertas('pediatricos')
  const alertasAdu = useAlertas('adultos')

  const alertas = [...(alertasPed.data ?? []), ...(alertasAdu.data ?? [])]
  const vencidas = alertas.filter((a) => a.dias_desde_referencia > 0).length
  const cargandoAlertas = alertasPed.isLoading || alertasAdu.isLoading

  const todos = [
    ...(pediatricos ?? []).map((p) => ({ ...p, grupo: 'pediatricos' as const })),
    ...(adultos ?? []).map((p) => ({ ...p, grupo: 'adultos' as const })),
  ]
  const mes = hoyIso().slice(0, 7)
  const delMes = todos.filter((p) => p.fecha_cirugia?.startsWith(mes))
  const pendientes = todos.filter((p) => !fichaCompleta(estadosDe(p)))
  const porGrupo = (lista: { grupo: GrupoActivo }[]) =>
    `${lista.filter((p) => p.grupo === 'pediatricos').length} pediátricos · ${lista.filter((p) => p.grupo === 'adultos').length} adultos`

  // El nombre completo (pedido del 30-oct: "Buenos días, Yelut Chamorro").
  const nombre = perfil?.nombre_completo.trim() ?? ''
  const fraseAlertas = cargandoAlertas
    ? ''
    : alertas.length === 0
      ? 'No hay alertas de seguimiento pendientes: todo está al día.'
      : `Hay ${plural(alertas.length, 'alerta de seguimiento pendiente', 'alertas de seguimiento pendientes')}${vencidas > 0 ? `, ${plural(vencidas, 'ya vencida', 'ya vencidas')}` : ''}.`

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-6 duration-500">
      {/* Bienvenida, con el mismo azul y el mismo Dr. Pabón de la pantalla de inicio de sesión. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] px-6 pt-7 shadow-lg shadow-[var(--pabon-azul-oscuro)]/15 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[var(--pabon-azul-claro)]/20 blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div className="min-w-0 pb-7 sm:pb-8">
            <p className="text-sm font-medium text-white/75">{fechaDeHoy()}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-[2rem] sm:leading-tight">
              {saludo()}{nombre && `, ${nombre}`}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
              {fraseAlertas}
              {!cargando && ` Este mes van ${plural(delMes.length, 'cirugía registrada', 'cirugías registradas')}.`}
            </p>
          </div>
          <img
            src="/branding/dr-wertino-pabon.png"
            alt=""
            className="hidden h-36 w-auto flex-none self-end drop-shadow-xl sm:block lg:h-44"
          />
        </div>
      </section>

      {/* etiquetaDosLineas: "Fichas con módulos pendientes" ocupa dos líneas y dejaba su cifra más
          abajo que las de las otras tarjetas. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <EnlaceKpi to="/alertas">
          <TarjetaKpi
            etiquetaDosLineas
            etiqueta="Alertas pendientes"
            valor={cargandoAlertas ? '—' : String(alertas.length)}
            icono={<IconoCampana className="h-4 w-4" />}
            tono={vencidas > 0 ? 'critico' : alertas.length > 0 ? 'advertencia' : 'exito'}
            detalle={vencidas > 0 ? plural(vencidas, 'vencida', 'vencidas') : 'Ninguna vencida'}
          />
        </EnlaceKpi>
        <EnlaceKpi to="/indicadores">
          <TarjetaKpi
            etiquetaDosLineas
            etiqueta="Cirugías este mes"
            valor={cargando ? '—' : String(delMes.length)}
            icono={<IconoCorazon className="h-4 w-4" />}
            detalle={cargando ? undefined : porGrupo(delMes)}
          />
        </EnlaceKpi>
        <TarjetaKpi
          etiquetaDosLineas
          etiqueta="Fichas con módulos pendientes"
          valor={cargando ? '—' : String(pendientes.length)}
          icono={<IconoGrafico className="h-4 w-4" />}
          tono="advertencia"
          detalle={cargando ? undefined : porGrupo(pendientes)}
        />
        <TarjetaKpi
          etiquetaDosLineas
          etiqueta="Pacientes registrados"
          valor={cargando ? '—' : String(todos.length)}
          icono={<IconoPacientes className="h-4 w-4" />}
          tono="exito"
          detalle={cargando ? undefined : porGrupo(todos)}
        />
      </div>
    </div>
  )
}

/** Una tarjeta de cifra que lleva a su sección al hacer clic. */
function EnlaceKpi({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block h-full rounded-xl outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
    >
      {children}
    </Link>
  )
}
