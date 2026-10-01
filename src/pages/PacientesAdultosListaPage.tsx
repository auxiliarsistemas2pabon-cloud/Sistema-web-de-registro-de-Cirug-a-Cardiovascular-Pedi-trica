import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { claseBotonPrimario, claseBotonSecundario, claseBotonTexto, claseInput } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { EstadoVacio, MensajeError } from '../components/Estados'
import { LeyendaModulos, ProgresoModulos } from '../components/ProgresoModulos'
import { TarjetaKpi } from '../components/TarjetaKpi'
import {
  IconoAdultos,
  IconoBuscar,
  IconoCerrar,
  IconoCheck,
  IconoChevronDerecha,
  IconoChevronIzquierda,
  IconoFiltro,
  IconoMas,
  IconoReloj,
} from '../components/iconos'
import { useOpciones } from '../hooks/useOpciones'
import { api, consulta } from '../lib/api'
import { formatearEdad, formatearFecha } from '../lib/fechas'
import { fichaCompleta } from '../lib/modulos'
import { cn } from '../lib/utils'
import type { EstadoModulo, OpcionLista, PacienteAdultoResumen } from '../types/db'

interface Filtros {
  busqueda: string
  epsValor: string
  diagnosticoValor: string
  condicionSalidaValor: string
  fechaCirugiaDesde: string
  fechaCirugiaHasta: string
}

const FILTROS_INICIALES: Filtros = {
  busqueda: '',
  epsValor: '',
  diagnosticoValor: '',
  condicionSalidaValor: '',
  fechaCirugiaDesde: '',
  fechaCirugiaHasta: '',
}

type EstadoFicha = 'todos' | 'completos' | 'pendientes'

const TAMANO_PAGINA = 25

function usePacientesAdultos(filtros: Filtros) {
  return useQuery({
    queryKey: ['pacientes-adultos', filtros],
    queryFn: () =>
      api.get<PacienteAdultoResumen[]>(
        '/pacientes-adultos' +
          consulta({
            busqueda: filtros.busqueda.trim(),
            eps: filtros.epsValor,
            diagnostico: filtros.diagnosticoValor,
            condicionSalida: filtros.condicionSalidaValor,
            fechaCirugiaDesde: filtros.fechaCirugiaDesde,
            fechaCirugiaHasta: filtros.fechaCirugiaHasta,
          }),
      ),
    placeholderData: keepPreviousData,
  })
}

function useValorPausado<T>(valor: T, ms: number): T {
  const [pausado, setPausado] = useState(valor)
  useEffect(() => {
    const temporizador = setTimeout(() => setPausado(valor), ms)
    return () => clearTimeout(temporizador)
  }, [valor, ms])
  return pausado
}

function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

const estadosDe = (p: PacienteAdultoResumen): EstadoModulo[] => [p.estado_m1, p.estado_m2, p.estado_m3, p.estado_m4, p.estado_m5]

const claseControlActivo = 'border-sky-600 bg-sky-50 hover:border-sky-700'

function Avatar({ nombre }: { nombre: string }) {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/[0.08] text-xs font-semibold text-[var(--pabon-azul-oscuro)] ring-1 ring-inset ring-[var(--pabon-azul-oscuro)]/10">
      {iniciales(nombre)}
    </span>
  )
}

function FiltroLista({
  id,
  etiqueta,
  textoTodos,
  valor,
  opciones,
  onChange,
}: {
  id: string
  etiqueta: string
  textoTodos: string
  valor: string
  opciones: OpcionLista[] | undefined
  onChange: (valor: string) => void
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-700">
        {etiqueta}
      </label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={cn(claseInput, 'truncate', valor && claseControlActivo)}>
        <option value="">{textoTodos}</option>
        {opciones?.map((o) => (
          <option key={o.id} value={o.valor}>
            {o.valor}
          </option>
        ))}
      </select>
    </div>
  )
}

function EsqueletoListado() {
  return (
    <div className="divide-y divide-slate-100" role="status">
      <span className="sr-only">Cargando pacientes…</span>
      {Array.from({ length: 6 }).map((_, fila) => (
        <div key={fila} className="flex items-center gap-4 px-5 py-4" aria-hidden>
          <span className="h-9 w-9 flex-none animate-pulse rounded-full bg-slate-200" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-40 max-w-full animate-pulse rounded bg-slate-200" />
            <span className="block h-2.5 w-16 animate-pulse rounded bg-slate-100" />
          </span>
          <span className="hidden h-3 w-24 animate-pulse rounded bg-slate-200 md:block" />
          <span className="hidden h-3 w-40 animate-pulse rounded bg-slate-200 lg:block" />
          <span className="flex gap-1.5">
            {Array.from({ length: 5 }).map((__, columna) => (
              <span key={columna} className="h-6 w-6 animate-pulse rounded-full bg-slate-200" />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

const claseTh =
  'sticky top-[var(--alto-encabezado)] z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600 first:pl-5 last:pr-5'

const claseBotonPagina =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-[var(--pabon-azul-oscuro)] shadow-xs outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/30 disabled:pointer-events-none disabled:opacity-40'

export function PacientesAdultosListaPage() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const [estadoFicha, setEstadoFicha] = useState<EstadoFicha>('todos')
  const [pagina, setPagina] = useState(1)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const refListado = useRef<HTMLElement>(null)

  const busquedaPausada = useValorPausado(filtros.busqueda, 300)
  const busquedaEfectiva = filtros.busqueda.trim() === '' ? '' : busquedaPausada
  const { data: pacientes, isLoading, isFetching, isPlaceholderData, error } = usePacientesAdultos({ ...filtros, busqueda: busquedaEfectiva })
  const actualizando = isFetching && isPlaceholderData

  const { data: listaEps } = useOpciones('EPS')
  const { data: listaDiagnosticos } = useOpciones('DIAGNOSTICO_ADULTO')
  const { data: listaCondicionSalida } = useOpciones('CONDICION_SALIDA')

  const puedeCrear = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'

  const filtrosDelPanel =
    [filtros.epsValor, filtros.diagnosticoValor, filtros.condicionSalidaValor].filter(Boolean).length +
    (filtros.fechaCirugiaDesde || filtros.fechaCirugiaHasta ? 1 : 0)
  const hayFiltrosServidor = filtrosDelPanel > 0 || filtros.busqueda.trim() !== ''
  const hayFiltros = hayFiltrosServidor || estadoFicha !== 'todos'

  const conteos = useMemo(() => {
    const total = pacientes?.length ?? 0
    const completos = pacientes?.filter((p) => fichaCompleta(estadosDe(p))).length ?? 0
    return { total, completos, pendientes: total - completos }
  }, [pacientes])

  const visibles = useMemo(() => {
    if (!pacientes || estadoFicha === 'todos') return pacientes ?? []
    return pacientes.filter((p) => fichaCompleta(estadosDe(p)) === (estadoFicha === 'completos'))
  }, [pacientes, estadoFicha])

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / TAMANO_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicio = (paginaActual - 1) * TAMANO_PAGINA
  const deLaPagina = visibles.slice(inicio, inicio + TAMANO_PAGINA)

  const porcentaje = (n: number) => (conteos.total ? Math.round((n / conteos.total) * 100) : 0)

  function actualizarFiltro<K extends keyof Filtros>(clave: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
    setPagina(1)
  }

  function cambiarEstadoFicha(estado: EstadoFicha) {
    setEstadoFicha(estado)
    setPagina(1)
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_INICIALES)
    setEstadoFicha('todos')
    setPagina(1)
  }

  function irAPagina(numero: number) {
    setPagina(numero)
    refListado.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const abrir = (p: PacienteAdultoResumen) => navigate(`/adultos/${p.paciente_id}`)

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <EncabezadoPagina
        icono={<IconoAdultos className="h-6 w-6" />}
        titulo="Pacientes adultos"
        subtitulo="Registro y seguimiento de las fichas de cirugía cardiovascular de adultos."
        acciones={
          puedeCrear && (
            <Link to="/adultos/nuevo" className={claseBotonPrimario}>
              <IconoMas className="h-4 w-4" strokeWidth={2.2} />
              Nuevo paciente
            </Link>
          )
        }
      />

      {(pacientes || isLoading) && (
        <div className="mb-6 grid grid-cols-3 gap-2.5 sm:gap-4">
          {pacientes ? (
            <>
              <TarjetaKpi
                etiqueta="Total de pacientes"
                valor={String(conteos.total)}
                icono={<IconoAdultos className="h-4 w-4" />}
                detalle={hayFiltrosServidor ? 'Con los filtros aplicados' : 'Registrados en el sistema'}
                segmentos={[
                  { porcentaje: conteos.total ? (conteos.completos / conteos.total) * 100 : 0, clase: 'bg-emerald-500' },
                  { porcentaje: conteos.total ? (conteos.pendientes / conteos.total) * 100 : 0, clase: 'bg-amber-400' },
                ]}
                onClick={() => cambiarEstadoFicha('todos')}
                activo={estadoFicha === 'todos'}
                titulo="Mostrar todas las fichas"
              />
              <TarjetaKpi
                etiqueta="Fichas completas"
                valor={String(conteos.completos)}
                tono="exito"
                icono={<IconoCheck className="h-4 w-4" />}
                detalle={`${porcentaje(conteos.completos)}% del total`}
                progreso={porcentaje(conteos.completos)}
                onClick={() => cambiarEstadoFicha(estadoFicha === 'completos' ? 'todos' : 'completos')}
                activo={estadoFicha === 'completos'}
                titulo="Mostrar solo las fichas completas"
              />
              <TarjetaKpi
                etiqueta="Con módulos pendientes"
                valor={String(conteos.pendientes)}
                tono="advertencia"
                icono={<IconoReloj className="h-4 w-4" />}
                detalle={`${porcentaje(conteos.pendientes)}% del total`}
                progreso={porcentaje(conteos.pendientes)}
                onClick={() => cambiarEstadoFicha(estadoFicha === 'pendientes' ? 'todos' : 'pendientes')}
                activo={estadoFicha === 'pendientes'}
                titulo="Mostrar solo las fichas con módulos pendientes"
              />
            </>
          ) : (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[7.5rem] flex-col rounded-xl border border-slate-200/80 bg-white p-3.5 sm:h-[9.5rem] sm:p-5"
                aria-hidden
              >
                <span className="h-3 w-24 max-w-full animate-pulse rounded bg-slate-200" />
                <span className="mt-auto h-7 w-12 animate-pulse rounded-md bg-slate-200" />
                <span className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
              </div>
            ))
          )}
        </div>
      )}

      <section
        ref={refListado}
        aria-label="Listado de pacientes adultos"
        className="scroll-mt-[calc(var(--alto-encabezado)+1rem)] overflow-clip rounded-xl border border-slate-200/80 bg-white shadow-[var(--sombra-tarjeta)]"
      >
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex gap-2 sm:gap-3">
            <div className="group relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--pabon-azul-oscuro)] opacity-60 transition-opacity group-focus-within:opacity-100">
                <IconoBuscar className="h-[18px] w-[18px]" />
              </span>
              <input
                type="text"
                role="searchbox"
                aria-label="Buscar paciente por nombre o identificación"
                placeholder="Nombre o identificación…"
                value={filtros.busqueda}
                onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') actualizarFiltro('busqueda', '')
                }}
                className={cn(claseInput, 'h-11 pl-10 text-base sm:text-[15px]', filtros.busqueda ? `pr-10 ${claseControlActivo}` : 'pr-3')}
              />
              {filtros.busqueda && (
                <button
                  type="button"
                  onClick={() => actualizarFiltro('busqueda', '')}
                  aria-label="Borrar búsqueda"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-[var(--pabon-azul-oscuro)] opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100"
                >
                  <IconoCerrar className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbiertos((abierto) => !abierto)}
              aria-expanded={filtrosAbiertos}
              aria-controls="panel-filtros-adultos"
              aria-label={filtrosDelPanel > 0 ? `Filtros (${filtrosDelPanel} ${filtrosDelPanel === 1 ? 'activo' : 'activos'})` : 'Filtros'}
              className={cn(claseBotonSecundario, 'h-11 px-3 sm:px-4 lg:hidden', (filtrosAbiertos || filtrosDelPanel > 0) && claseControlActivo)}
            >
              <IconoFiltro className="h-4 w-4 text-[var(--pabon-azul-oscuro)]" />
              <span className="hidden sm:inline">Filtros</span>
              {filtrosDelPanel > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)] px-1.5 text-[11px] font-semibold text-white">
                  {filtrosDelPanel}
                </span>
              )}
            </button>
          </div>

          <div
            id="panel-filtros-adultos"
            className={`${filtrosAbiertos ? 'grid' : 'hidden'} grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(20rem,1.6fr)]`}
          >
            <FiltroLista
              id="filtro-eps-adultos"
              etiqueta="EPS"
              textoTodos="Todas"
              valor={filtros.epsValor}
              opciones={listaEps}
              onChange={(v) => actualizarFiltro('epsValor', v)}
            />
            <FiltroLista
              id="filtro-diagnostico-adultos"
              etiqueta="Diagnóstico"
              textoTodos="Todos"
              valor={filtros.diagnosticoValor}
              opciones={listaDiagnosticos}
              onChange={(v) => actualizarFiltro('diagnosticoValor', v)}
            />
            <FiltroLista
              id="filtro-condicion-salida-adultos"
              etiqueta="Condición de salida"
              textoTodos="Todas"
              valor={filtros.condicionSalidaValor}
              opciones={listaCondicionSalida}
              onChange={(v) => actualizarFiltro('condicionSalidaValor', v)}
            />
            <fieldset className="min-w-0 sm:col-span-2 lg:col-span-1">
              <legend className="mb-1.5 text-xs font-medium text-slate-700">Fecha de cirugía</legend>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Fecha de cirugía desde"
                  value={filtros.fechaCirugiaDesde}
                  max={filtros.fechaCirugiaHasta || undefined}
                  onChange={(e) => actualizarFiltro('fechaCirugiaDesde', e.target.value)}
                  className={cn(claseInput, 'min-w-0', filtros.fechaCirugiaDesde && claseControlActivo)}
                />
                <span className="flex-none text-sm text-slate-500" aria-hidden>
                  –
                </span>
                <input
                  type="date"
                  aria-label="Fecha de cirugía hasta"
                  value={filtros.fechaCirugiaHasta}
                  min={filtros.fechaCirugiaDesde || undefined}
                  onChange={(e) => actualizarFiltro('fechaCirugiaHasta', e.target.value)}
                  className={cn(claseInput, 'min-w-0', filtros.fechaCirugiaHasta && claseControlActivo)}
                />
              </div>
            </fieldset>
          </div>
        </div>

        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 px-4 py-2 text-sm sm:px-5">
          <p className="tabular-nums text-slate-700" aria-live="polite">
            {pacientes ? (
              <>
                <span className="font-semibold text-slate-900">{visibles.length}</span>{' '}
                {visibles.length === 1 ? 'paciente' : 'pacientes'}
                {hayFiltros && ' con los filtros aplicados'}
              </>
            ) : (
              'Cargando pacientes…'
            )}
          </p>
          {estadoFicha !== 'todos' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 py-0.5 pl-2.5 pr-0.5 text-xs font-medium text-slate-900">
              {estadoFicha === 'completos' ? 'Solo fichas completas' : 'Solo con módulos pendientes'}
              <button
                type="button"
                onClick={() => cambiarEstadoFicha('todos')}
                aria-label="Quitar filtro de estado de la ficha"
                className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--pabon-azul-oscuro)] outline-none hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]/50"
              >
                <IconoCerrar className="h-3 w-3" />
              </button>
            </span>
          )}
          {actualizando && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--pabon-azul-oscuro)]" aria-hidden />
              Actualizando…
            </span>
          )}
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className={`${claseBotonTexto} ml-auto`}>
              <IconoCerrar className="h-3.5 w-3.5" />
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 sm:p-5">
            <MensajeError>No se pudo cargar el listado de pacientes.</MensajeError>
          </div>
        )}

        {isLoading && <EsqueletoListado />}

        {pacientes && visibles.length === 0 && (
          <EstadoVacio
            icono={hayFiltros ? <IconoBuscar className="h-6 w-6" /> : <IconoAdultos className="h-6 w-6" />}
            titulo={hayFiltros ? 'Sin resultados' : 'Aún no hay pacientes'}
            mensaje={
              hayFiltros
                ? 'Ningún paciente coincide con la búsqueda o los filtros aplicados.'
                : 'Cuando se registre el primer paciente adulto aparecerá en esta lista.'
            }
            accion={
              hayFiltros ? (
                <button type="button" onClick={limpiarFiltros} className={claseBotonSecundario}>
                  <IconoCerrar className="h-4 w-4" />
                  Limpiar filtros
                </button>
              ) : (
                puedeCrear && (
                  <Link to="/adultos/nuevo" className={claseBotonPrimario}>
                    <IconoMas className="h-4 w-4" strokeWidth={2.2} />
                    Nuevo paciente
                  </Link>
                )
              )
            }
          />
        )}

        {visibles.length > 0 && (
          <>
            <table className={`hidden w-full text-left text-sm transition-opacity lg:table ${actualizando ? 'opacity-60' : ''}`}>
              <thead>
                <tr>
                  <th scope="col" className={claseTh}>Paciente</th>
                  <th scope="col" className={claseTh}>Identificación</th>
                  <th scope="col" className={claseTh}>Edad</th>
                  <th scope="col" className={claseTh}>Diagnóstico</th>
                  <th scope="col" className={`${claseTh} hidden xl:table-cell`}>Cirugía</th>
                  <th scope="col" className={claseTh}>Módulos</th>
                  <th scope="col" className={claseTh}>
                    <span className="sr-only">Abrir ficha</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deLaPagina.map((p) => (
                  <tr
                    key={p.paciente_id}
                    onClick={() => abrir(p)}
                    className="group cursor-pointer transition-colors focus-within:bg-sky-50/60 hover:bg-sky-50/60"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <Avatar nombre={p.nombre_completo} />
                        <div className="min-w-0">
                          <Link
                            to={`/adultos/${p.paciente_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-[17rem] truncate font-medium text-slate-900 outline-none decoration-[var(--pabon-azul-oscuro)]/40 underline-offset-2 hover:underline focus-visible:underline"
                            title={p.nombre_completo}
                          >
                            {p.nombre_completo}
                          </Link>
                          <span className="block text-xs tabular-nums text-slate-500">N° {p.numero_paciente}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{p.identificacion}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatearEdad(p.edad_dias)}</td>
                    <td className="px-3 py-3">
                      <p className="line-clamp-1 max-w-[24rem] text-slate-700" title={p.diagnostico_valor ?? undefined}>
                        {p.diagnostico_valor ?? '—'}
                      </p>
                      {p.euroscore !== null && <p className="text-xs text-slate-500">EuroSCORE · {p.euroscore}%</p>}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-slate-700 xl:table-cell">
                      {formatearFecha(p.fecha_cirugia) || '—'}
                    </td>
                    <td className="px-3 py-3">
                      <ProgresoModulos estados={estadosDe(p)} />
                    </td>
                    <td className="py-3 pl-1 pr-5">
                      <IconoChevronDerecha className="h-4 w-4 text-[var(--pabon-azul-oscuro)] opacity-30 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className={`grid grid-cols-1 gap-3 p-3 transition-opacity sm:grid-cols-2 sm:p-4 lg:hidden ${actualizando ? 'opacity-60' : ''}`}>
              {deLaPagina.map((p) => (
                <li key={p.paciente_id}>
                  <Link
                    to={`/adultos/${p.paciente_id}`}
                    className="group flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 outline-none transition hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 focus-visible:ring-3 focus-visible:ring-[var(--pabon-azul-claro)]/40"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar nombre={p.nombre_completo} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{p.nombre_completo}</p>
                        <p className="truncate text-xs tabular-nums text-slate-500">
                          N° {p.numero_paciente} · {p.identificacion}
                        </p>
                      </div>
                      <IconoChevronDerecha className="mt-1 h-4 w-4 flex-none text-[var(--pabon-azul-oscuro)] opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Edad</dt>
                        <dd className="text-slate-900">{formatearEdad(p.edad_dias) || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cirugía</dt>
                        <dd className="tabular-nums text-slate-900">{formatearFecha(p.fecha_cirugia) || '—'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Diagnóstico</dt>
                        <dd className="line-clamp-2 text-slate-900">
                          {p.diagnostico_valor ?? '—'}
                          {p.euroscore !== null && <span className="text-slate-500"> · EuroSCORE {p.euroscore}%</span>}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <span className="text-xs font-medium text-slate-600">Módulos</span>
                      <ProgresoModulos estados={estadosDe(p)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <LeyendaModulos />
              {totalPaginas > 1 && (
                <nav aria-label="Paginación" className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="text-sm tabular-nums text-slate-700">
                    <span className="font-medium text-slate-900">
                      {inicio + 1}–{Math.min(inicio + TAMANO_PAGINA, visibles.length)}
                    </span>{' '}
                    de {visibles.length}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => irAPagina(paginaActual - 1)}
                      disabled={paginaActual === 1}
                      aria-label="Página anterior"
                      className={claseBotonPagina}
                    >
                      <IconoChevronIzquierda className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => irAPagina(paginaActual + 1)}
                      disabled={paginaActual === totalPaginas}
                      aria-label="Página siguiente"
                      className={claseBotonPagina}
                    >
                      <IconoChevronDerecha className="h-4 w-4" />
                    </button>
                  </div>
                </nav>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
