import { useQuery } from '@tanstack/react-query'
import { useState, type ComponentType, type FormEvent, type ReactNode, type SVGProps } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SoloEscritura, usePermisos } from '../auth/permisos'
import {
  IconoAdultos,
  IconoBajar,
  IconoCalendario,
  IconoCampana,
  IconoCerrar,
  IconoCorazon,
  IconoGrafico,
  IconoMas,
  IconoPacientes,
} from '../components/iconos'
import { TarjetaKpi } from '../components/TarjetaKpi'
import { useAlertas, type Alerta } from '../hooks/useAlertas'
import { api } from '../lib/api'
import { ACTUALIZACION_PERIODICA } from '../lib/clienteConsultas'
import { hoyIso } from '../lib/fechas'
import type { GrupoActivo } from '../lib/grupoActivo'
import { fichaCompleta } from '../lib/modulos'
import type { EstadoModulo, PacienteAdultoResumen, PacienteResumen } from '../types/db'

const estadosDe = (p: PacienteResumen | PacienteAdultoResumen): EstadoModulo[] => [p.estado_m1, p.estado_m2, p.estado_m3, p.estado_m4, p.estado_m5]

type PacienteConGrupo = (PacienteResumen | PacienteAdultoResumen) & { grupo: GrupoActivo }

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

/** "2026-10-05" → "5 oct 2026", para resumir el periodo filtrado. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const claseCampoFecha =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--pabon-azul-claro)] focus:ring-3 focus:ring-[var(--pabon-azul-claro)]/20'

/** Portada: bienvenida, cifras de pediátricos y adultos juntos (con filtro opcional por fecha de
 * cirugía) y una tarjeta por grupo con su avance. */
export function InicioPage() {
  const { perfil } = useAuth()
  const { pediatricos, adultos, cargando } = usePacientes()
  const alertasPed = useAlertas('pediatricos')
  const alertasAdu = useAlertas('adultos')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' })

  const alertas = [...(alertasPed.data ?? []), ...(alertasAdu.data ?? [])]
  const vencidas = alertas.filter((a) => a.dias_desde_referencia > 0).length
  const cargandoAlertas = alertasPed.isLoading || alertasAdu.isLoading

  const todos: PacienteConGrupo[] = [
    ...(pediatricos ?? []).map((p) => ({ ...p, grupo: 'pediatricos' as const })),
    ...(adultos ?? []).map((p) => ({ ...p, grupo: 'adultos' as const })),
  ]
  const hayPeriodo = Boolean(periodo.desde || periodo.hasta)
  // Con un periodo, solo cuentan los pacientes cuya cirugía cae dentro de él.
  const enPeriodo = hayPeriodo
    ? todos.filter(
        (p) => p.fecha_cirugia && (!periodo.desde || p.fecha_cirugia >= periodo.desde) && (!periodo.hasta || p.fecha_cirugia <= periodo.hasta),
      )
    : todos
  const mes = hoyIso().slice(0, 7)
  const delMes = todos.filter((p) => p.fecha_cirugia?.startsWith(mes))
  const cirugias = hayPeriodo ? enPeriodo : delMes
  const pendientes = enPeriodo.filter((p) => !fichaCompleta(estadosDe(p)))
  const porGrupo = (lista: { grupo: GrupoActivo }[]) =>
    `${lista.filter((p) => p.grupo === 'pediatricos').length} pediátricos · ${lista.filter((p) => p.grupo === 'adultos').length} adultos`

  const textoPeriodo =
    periodo.desde && periodo.hasta
      ? `${fechaCorta(periodo.desde)} – ${fechaCorta(periodo.hasta)}`
      : periodo.desde
        ? `Desde el ${fechaCorta(periodo.desde)}`
        : periodo.hasta
          ? `Hasta el ${fechaCorta(periodo.hasta)}`
          : ''

  // El nombre completo (pedido del 30-oct: "Buenos días, Yelut Chamorro").
  const nombre = perfil?.nombre_completo.trim() ?? ''
  const fraseAlertas = cargandoAlertas
    ? ''
    : alertas.length === 0
      ? 'No hay alertas de seguimiento pendientes: todo está al día.'
      : `Hay ${plural(alertas.length, 'alerta de seguimiento pendiente', 'alertas de seguimiento pendientes')}${vencidas > 0 ? `, ${plural(vencidas, 'ya vencida', 'ya vencidas')}` : ''}.`
  const fraseMes = cargando
    ? ''
    : delMes.length === 0
      ? ' Aún no hay cirugías registradas este mes.'
      : ` Este mes van ${plural(delMes.length, 'cirugía registrada', 'cirugías registradas')}.`

  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setPeriodo({ desde: fechaDesde, hasta: fechaHasta })
  }

  function limpiar() {
    setFechaDesde('')
    setFechaHasta('')
    setPeriodo({ desde: '', hasta: '' })
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-6 duration-500">
      {/* Bienvenida, con el mismo azul y el mismo Dr. Pabón de la pantalla de inicio de sesión. Compacta
          a propósito: con zoom, una bienvenida alta escondía las cifras debajo del borde de la pantalla. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] px-6 pt-6 shadow-lg shadow-[var(--pabon-azul-oscuro)]/15 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[var(--pabon-azul-claro)]/20 blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div className="min-w-0 pb-6">
            <p className="flex items-center gap-2 text-sm font-medium text-white/75">
              <IconoCalendario className="h-4 w-4" />
              {fechaDeHoy()}
            </p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-[1.85rem] sm:leading-tight">
              {saludo()}{nombre && `, ${nombre}`}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-white/85 sm:text-[15px]">
              {fraseAlertas}
              {fraseMes}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <BotonHero to="/pacientes/nuevo" principal>
                <IconoMas className="h-4 w-4" strokeWidth={2.4} />
                Nuevo pediátrico
              </BotonHero>
              <BotonHero to="/adultos/nuevo" principal>
                <IconoMas className="h-4 w-4" strokeWidth={2.4} />
                Nuevo adulto
              </BotonHero>
              <BotonHero to="/alertas">
                <IconoCampana className="h-4 w-4" />
                Revisar alertas
              </BotonHero>
            </div>
          </div>
          <img
            src="/branding/dr-wertino-pabon.png"
            alt=""
            className="hidden h-36 w-auto flex-none self-end drop-shadow-xl md:block lg:h-40"
          />
        </div>
      </section>

      {/* Resumen: título a la izquierda y el filtro por fecha de cirugía, en una barra delgada, a la derecha. */}
      <section aria-labelledby="titulo-resumen" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 id="titulo-resumen" className="text-lg font-semibold tracking-tight text-slate-900">Resumen general</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {hayPeriodo ? (
                <>
                  Cirugías del periodo
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pabon-azul-oscuro)]/[0.08] py-0.5 pl-2.5 pr-1 text-xs font-semibold text-[var(--pabon-azul-oscuro)]">
                    {textoPeriodo}
                    <button
                      type="button"
                      onClick={limpiar}
                      aria-label="Quitar el filtro de fechas"
                      className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--pabon-azul-oscuro)]/15"
                    >
                      <IconoCerrar className="h-3 w-3" />
                    </button>
                  </span>
                </>
              ) : (
                'Pediátricos y adultos juntos.'
              )}
            </p>
          </div>
          <form
            onSubmit={aplicar}
            aria-label="Filtrar por fecha de cirugía"
            className="grid grid-cols-2 items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-2 shadow-[var(--sombra-tarjeta)] sm:flex sm:flex-wrap"
          >
            <label className="block sm:w-40">
              <span className="mb-0.5 block px-0.5 text-[11px] font-medium text-slate-600">Cirugía desde</span>
              <input type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={(e) => setFechaDesde(e.target.value)} className={claseCampoFecha} />
            </label>
            <label className="block sm:w-40">
              <span className="mb-0.5 block px-0.5 text-[11px] font-medium text-slate-600">Hasta</span>
              <input type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(e) => setFechaHasta(e.target.value)} className={claseCampoFecha} />
            </label>
            <button
              type="submit"
              disabled={!fechaDesde && !fechaHasta}
              className="col-span-2 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--pabon-azul-oscuro)] px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Filtrar
            </button>
          </form>
        </div>

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
              etiqueta={hayPeriodo ? 'Cirugías en el periodo' : 'Cirugías este mes'}
              valor={cargando ? '—' : String(cirugias.length)}
              icono={<IconoCorazon className="h-4 w-4" />}
              detalle={cargando ? undefined : porGrupo(cirugias)}
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
            etiqueta={hayPeriodo ? 'Pacientes operados en el periodo' : 'Pacientes registrados'}
            valor={cargando ? '—' : String(enPeriodo.length)}
            icono={<IconoPacientes className="h-4 w-4" />}
            tono="exito"
            detalle={cargando ? undefined : porGrupo(enPeriodo)}
          />
        </div>
      </section>

      {/* Una tarjeta por grupo: lo mismo de arriba, separado, más el avance de las fichas. */}
      <section aria-labelledby="titulo-grupos" className="space-y-3">
        <h2 id="titulo-grupos" className="text-lg font-semibold tracking-tight text-slate-900">Por grupo</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TarjetaGrupo
            titulo="Pacientes pediátricos"
            icono={IconoPacientes}
            acento="var(--pabon-azul-oscuro)"
            lista="/pacientes"
            nuevo="/pacientes/nuevo"
            pacientes={enPeriodo.filter((p) => p.grupo === 'pediatricos')}
            cirugias={cirugias.filter((p) => p.grupo === 'pediatricos').length}
            alertas={alertasPed.data}
            hayPeriodo={hayPeriodo}
            cargando={cargando}
          />
          <TarjetaGrupo
            titulo="Pacientes adultos"
            icono={IconoAdultos}
            acento="var(--pabon-azul-claro)"
            lista="/adultos"
            nuevo="/adultos/nuevo"
            pacientes={enPeriodo.filter((p) => p.grupo === 'adultos')}
            cirugias={cirugias.filter((p) => p.grupo === 'adultos').length}
            alertas={alertasAdu.data}
            hayPeriodo={hayPeriodo}
            cargando={cargando}
          />
        </div>
      </section>

      <Link
        to="/datos"
        className="group flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm outline-none transition-colors hover:border-[var(--pabon-azul-oscuro)]/40 hover:bg-white focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
      >
        <IconoBajar className="h-[18px] w-[18px] flex-none text-[var(--pabon-azul-oscuro)]" />
        <span className="min-w-0 flex-1 text-slate-700">
          <span className="font-semibold text-slate-900">¿Necesitas los datos en Excel?</span> Descarga los registros completos desde Importar y exportar.
        </span>
        <Flecha />
      </Link>
    </div>
  )
}

function Flecha() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 flex-none text-[var(--pabon-azul-oscuro)] opacity-60 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Botón sobre el azul de la bienvenida: blanco (acciones de crear) o translúcido (secundario). */
function BotonHero({ to, principal = false, children }: { to: string; principal?: boolean; children: ReactNode }) {
  const { escribir } = usePermisos()
  if (principal && !escribir) return null
  return (
    <Link
      to={to}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold outline-none transition focus-visible:ring-3 focus-visible:ring-white/50 ${
        principal
          ? 'bg-white text-[var(--pabon-azul-oscuro)] shadow-sm hover:bg-sky-50'
          : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'
      }`}
    >
      {children}
    </Link>
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

interface TarjetaGrupoProps {
  titulo: string
  icono: ComponentType<SVGProps<SVGSVGElement>>
  /** Color de la franja superior y del ícono (los dos azules de la marca). */
  acento: string
  lista: string
  nuevo: string
  pacientes: PacienteConGrupo[]
  cirugias: number
  alertas: Alerta[] | undefined
  hayPeriodo: boolean
  cargando: boolean
}

/** Resumen de un grupo: pacientes, cirugías, alertas y cuántas fichas están completas. */
function TarjetaGrupo({ titulo, icono: Icono, acento, lista, nuevo, pacientes, cirugias, alertas, hayPeriodo, cargando }: TarjetaGrupoProps) {
  const total = pacientes.length
  const completas = pacientes.filter((p) => fichaCompleta(estadosDe(p))).length
  const porcentaje = total > 0 ? Math.round((completas / total) * 100) : 0
  const vencidas = alertas?.filter((a) => a.dias_desde_referencia > 0).length ?? 0
  const valor = (n: number | undefined) => (cargando || n === undefined ? '—' : String(n))

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[var(--sombra-tarjeta)]">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: acento }} />
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-white shadow-sm"
            style={{ background: acento }}
          >
            <Icono className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{titulo}</h3>
            <p className="text-xs text-slate-500">{hayPeriodo ? 'Operados en el periodo' : 'Registrados en el sistema'}</p>
          </div>
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{valor(total)}</p>
      </div>

      <dl className="mx-5 mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-lg bg-slate-50">
        <div className="px-3 py-2.5">
          <dt className="text-[11px] font-medium text-slate-600">{hayPeriodo ? 'Cirugías' : 'Cirugías del mes'}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{valor(cirugias)}</dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="text-[11px] font-medium text-slate-600">Alertas</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-lg font-semibold tabular-nums text-slate-900">
            {alertas === undefined ? '—' : alertas.length}
            {vencidas > 0 && (
              <span className="whitespace-nowrap rounded-full bg-[var(--pabon-rojo)] px-1.5 py-px text-[10px] font-semibold leading-4 text-white">{plural(vencidas, 'vencida', 'vencidas')}</span>
            )}
          </dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="text-[11px] font-medium text-slate-600">Fichas pendientes</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{valor(total - completas)}</dd>
        </div>
      </dl>

      <div className="mx-5 mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-slate-700">Fichas completas</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {cargando ? '—' : `${completas} de ${total} · ${porcentaje} %`}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${cargando ? 0 : porcentaje}%`, background: acento }} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-slate-100 px-5 py-3">
        <Link
          to={lista}
          className="group inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--pabon-azul-oscuro)] outline-none transition hover:bg-[var(--pabon-azul-oscuro)]/[0.06] focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
        >
          Ver pacientes
          <Flecha />
        </Link>
        <SoloEscritura><span aria-hidden className="h-6 w-px bg-slate-200" />
        <Link
          to={nuevo}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--pabon-azul-oscuro)] outline-none transition hover:bg-[var(--pabon-azul-oscuro)]/[0.06] focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
        >
          <IconoMas className="h-4 w-4" strokeWidth={2.4} />
          Nuevo paciente
        </Link>
        </SoloEscritura>
      </div>
    </article>
  )
}
