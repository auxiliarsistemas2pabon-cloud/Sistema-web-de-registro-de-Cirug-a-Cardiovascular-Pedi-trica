import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ETIQUETAS_ESTADO_MODULO, NOMBRES_MODULOS } from '../lib/modulos'
import type { EstadoModulo } from '../types/db'
import { IconoChevronIzquierda } from './iconos'
import { Tarjeta } from './Tarjeta'

export type NumeroModulo = 1 | 2 | 3 | 4 | 5

const MODULOS: readonly NumeroModulo[] = [1, 2, 3, 4, 5]

/** Una línea bajo el título de cada módulo: qué se registra ahí (vale para pediátricos y adultos). */
const DESCRIPCIONES: Record<NumeroModulo, string> = {
  1: 'Identificación, afiliación, procedencia y contacto del paciente.',
  2: 'Diagnóstico principal, escala de riesgo quirúrgico y factores de riesgo.',
  3: 'Procedimientos realizados, implante, circulación extracorpórea y eventos en quirófano.',
  4: 'Unidad postoperatoria, complicaciones y condiciones del egreso.',
  5: 'Control posterior, llamada de los 15 días y reingresos.',
}

interface DatoFicha {
  etiqueta: string
  valor: ReactNode
  /** Ocupa todo el ancho en móvil (el diagnóstico suele ser largo). */
  ancho?: boolean
}

interface Props {
  /** Regreso al listado del grupo (pediátricos o adultos). */
  rutaListado: string
  etiquetaListado: string
  esNuevo: boolean
  titulo: string
  /** Iniciales del paciente, o un ícono para una ficha nueva. */
  avatar: ReactNode
  subtitulo?: ReactNode
  datos?: DatoFicha[]
  estados: Record<NumeroModulo, EstadoModulo | undefined>
  pestanaActiva: NumeroModulo
  onCambiarPestana: (modulo: NumeroModulo) => void
  children: ReactNode
}

// Mismo lenguaje que ProgresoModulos (listado): completo = verde con check, pendiente = número sobre
// ámbar, no aplica = guion gris; el módulo abierto se marca en azul institucional (o con un anillo,
// si ya está completo, para no perder el verde). El guion lleva color arbitrario porque
// text-slate-400 está forzado a negro en index.css.
function claseCirculo(estado: EstadoModulo | undefined, activo: boolean): string {
  const anilloActivo = 'ring-2 ring-[var(--pabon-azul-claro)] ring-offset-2'
  if (estado === 'completo') return `bg-emerald-600 text-white ${activo ? anilloActivo : ''}`
  if (estado === 'no_aplica') return `bg-slate-100 text-[#94a3b8] ${activo ? anilloActivo : 'ring-1 ring-inset ring-slate-200'}`
  if (activo) return 'bg-[var(--pabon-azul-oscuro)] text-white shadow-sm shadow-[var(--pabon-azul-oscuro)]/30'
  if (estado === 'pendiente') return 'bg-amber-100 text-slate-900 ring-1 ring-inset ring-amber-400'
  return 'bg-white text-slate-900 ring-1 ring-inset ring-slate-300'
}

function CirculoPaso({ numero, estado, activo }: { numero: number; estado: EstadoModulo | undefined; activo: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold tabular-nums ${claseCirculo(estado, activo)}`}
      aria-hidden
    >
      {estado === 'completo' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-4 w-4">
          <path d="m6 12.5 4 4 8-8.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : estado === 'no_aplica' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-4 w-4">
          <path d="M6 12h12" strokeLinecap="round" />
        </svg>
      ) : (
        numero
      )}
    </span>
  )
}

const CHIP_ESTADO: Record<EstadoModulo, { fondo: string; punto: string }> = {
  completo: { fondo: 'bg-emerald-50 ring-emerald-200', punto: 'bg-emerald-500' },
  pendiente: { fondo: 'bg-amber-50 ring-amber-200', punto: 'bg-amber-400' },
  no_aplica: { fondo: 'bg-slate-100 ring-slate-200', punto: 'bg-slate-400' },
}

function ChipEstado({ estado }: { estado: EstadoModulo }) {
  const { fondo, punto } = CHIP_ESTADO[estado]
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-900 ring-1 ring-inset ${fondo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${punto}`} aria-hidden />
      {ETIQUETAS_ESTADO_MODULO[estado]}
    </span>
  )
}

/**
 * Estructura de la ficha de un paciente (pediátrico o adulto). En pantallas anchas (xl): columna
 * izquierda fija con los datos del paciente y los cinco módulos como pasos verticales, y el
 * formulario del módulo a la derecha ocupando el resto del ancho (antes el formulario usaba solo
 * dos tercios de una tarjeta a todo lo ancho y dejaba un hueco vacío a la derecha). Por debajo de
 * xl la columna lateral dejaría el formulario demasiado angosto, así que la tarjeta del paciente va
 * arriba con los módulos en fila: repartidos a lo ancho en lg y deslizables en móvil y tableta.
 */
export function FichaPaciente({
  rutaListado,
  etiquetaListado,
  esNuevo,
  titulo,
  avatar,
  subtitulo,
  datos,
  estados,
  pestanaActiva,
  onCambiarPestana,
  children,
}: Props) {
  const refPasos = useRef<HTMLOListElement>(null)

  // En móvil los pasos se deslizan en horizontal: al cambiar de módulo, el paso activo se centra
  // para que no quede escondido fuera del borde. En escritorio (lista vertical) no hay desborde.
  useEffect(() => {
    const lista = refPasos.current
    const activo = lista?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!lista || !activo || lista.scrollWidth <= lista.clientWidth) return
    const desplazamiento = activo.getBoundingClientRect().left - lista.getBoundingClientRect().left
    lista.scrollBy({ left: desplazamiento - (lista.clientWidth - activo.offsetWidth) / 2, behavior: 'smooth' })
  }, [pestanaActiva])

  const estadoActivo = estados[pestanaActiva]

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <Link
        to={rutaListado}
        className="group mb-4 inline-flex items-center gap-1 rounded-md py-0.5 pr-1 text-sm font-medium text-[var(--pabon-azul-oscuro)] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
      >
        <IconoChevronIzquierda className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        {etiquetaListado}
      </Link>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[17.5rem_minmax(0,1fr)] xl:gap-6">
        {/* min-w-0: sin esto, la fila de pasos (que en móvil se desliza en horizontal) impone su
            ancho completo a la columna de la cuadrícula y desborda la pantalla. */}
        <aside className="min-w-0 xl:sticky xl:top-[calc(var(--alto-encabezado)+1.5rem)]">
          <Tarjeta>
            <div className="flex items-center gap-4 bg-gradient-to-br from-[var(--pabon-azul-oscuro)]/[0.07] to-transparent p-5 xl:flex-col xl:items-start xl:gap-3">
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/10 text-lg font-semibold text-[var(--pabon-azul-oscuro)] ring-4 ring-white">
                {avatar}
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">{titulo}</h1>
                {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
              </div>
            </div>

            {datos && datos.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 px-5 py-4 text-sm sm:grid-cols-3 xl:grid-cols-1">
                {datos.map((dato) => (
                  <div key={dato.etiqueta} className={dato.ancho ? 'col-span-2 sm:col-span-1' : undefined}>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{dato.etiqueta}</dt>
                    <dd className="mt-0.5 tabular-nums text-slate-900">{dato.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            <nav aria-label="Módulos de la ficha" className="border-t border-slate-100 bg-slate-50/70">
              <ol
                ref={refPasos}
                className="flex gap-1 overflow-x-auto p-2 [scrollbar-width:none] lg:overflow-visible xl:flex-col [&::-webkit-scrollbar]:hidden"
              >
                {MODULOS.map((numero) => {
                  const estado = estados[numero]
                  const bloqueado = esNuevo && numero !== 1
                  const activo = pestanaActiva === numero
                  const textoEstado = bloqueado ? 'Requiere el Módulo 1' : estado ? ETIQUETAS_ESTADO_MODULO[estado] : esNuevo ? 'Sin guardar' : ''
                  return (
                    <li key={numero} className="relative flex-none lg:min-w-0 lg:flex-1 xl:flex-none">
                      {/* Conector vertical entre pasos (solo con la columna lateral): baja desde el círculo
                          de este paso hasta el del siguiente. */}
                      {numero < 5 && <span aria-hidden className="absolute left-[25.5px] top-[2.875rem] -bottom-[0.6875rem] hidden w-px bg-slate-200 xl:block" />}
                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={() => onCambiarPestana(numero)}
                        aria-current={activo ? 'step' : undefined}
                        title={bloqueado ? 'Guarda primero el Módulo 1' : undefined}
                        className={`flex h-full w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40 ${
                          activo ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/70'
                        } ${bloqueado ? 'cursor-not-allowed opacity-45' : ''}`}
                      >
                        <CirculoPaso numero={numero} estado={estado} activo={activo} />
                        <span className="min-w-0">
                          <span
                            className={`block whitespace-nowrap text-sm lg:whitespace-normal lg:leading-snug xl:whitespace-nowrap xl:leading-5 ${activo ? 'font-semibold' : 'font-medium'} text-slate-900`}
                          >
                            {NOMBRES_MODULOS[numero - 1]}
                          </span>
                          {/* Espacio duro si no hay estado: mantiene el alto de la fila (y el conector alineado). */}
                          <span className="hidden text-xs text-slate-500 xl:block">{textoEstado || '\u00a0'}</span>
                        </span>
                        <span className="sr-only">{textoEstado ? `(${textoEstado})` : ''}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>
          </Tarjeta>
        </aside>

        <section aria-labelledby="titulo-modulo" className="min-w-0">
          <Tarjeta>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Módulo {pestanaActiva} de 5</p>
                <h2 id="titulo-modulo" className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">
                  {NOMBRES_MODULOS[pestanaActiva - 1]}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">{DESCRIPCIONES[pestanaActiva]}</p>
              </div>
              {estadoActivo && <ChipEstado estado={estadoActivo} />}
            </div>
            <div key={pestanaActiva} className="animate-in fade-in-0 slide-in-from-bottom-1 p-5 duration-300 sm:p-6">
              {children}
            </div>
          </Tarjeta>
        </section>
      </div>
    </div>
  )
}
