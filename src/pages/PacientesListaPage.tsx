import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { claseBotonPrimario, claseBotonTexto, claseInput } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { EstadoModuloChip } from '../components/EstadoModuloChip'
import { Cargando, EstadoVacio, MensajeError } from '../components/Estados'
import { Tarjeta } from '../components/Tarjeta'
import { IconoBuscar, IconoFiltro, IconoPacientes } from '../components/iconos'
import { useOpciones } from '../hooks/useOpciones'
import { api, consulta } from '../lib/api'
import { formatearEdad } from '../lib/fechas'
import type { PacienteResumen } from '../types/db'

interface Filtros {
  busqueda: string
  epsValor: string
  diagnosticoValor: string
  rachsValor: string
  condicionSalidaValor: string
  fechaCirugiaDesde: string
  fechaCirugiaHasta: string
}

const FILTROS_INICIALES: Filtros = {
  busqueda: '',
  epsValor: '',
  diagnosticoValor: '',
  rachsValor: '',
  condicionSalidaValor: '',
  fechaCirugiaDesde: '',
  fechaCirugiaHasta: '',
}

function usePacientes(filtros: Filtros) {
  return useQuery({
    queryKey: ['pacientes', filtros],
    queryFn: () =>
      api.get<PacienteResumen[]>(
        '/pacientes' +
          consulta({
            busqueda: filtros.busqueda.trim(),
            eps: filtros.epsValor,
            diagnostico: filtros.diagnosticoValor,
            rachs: filtros.rachsValor,
            condicionSalida: filtros.condicionSalidaValor,
            fechaCirugiaDesde: filtros.fechaCirugiaDesde,
            fechaCirugiaHasta: filtros.fechaCirugiaHasta,
          }),
      ),
  })
}

/** Iniciales para el avatar circular (mismo criterio que AppShell/AlertasPage). */
function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

const claseSelect = `${claseInput} bg-white`

export function PacientesListaPage() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const { data: pacientes, isLoading, error } = usePacientes(filtros)

  const { data: listaEps } = useOpciones('EPS')
  const { data: listaDiagnosticos } = useOpciones('DIAGNOSTICO')
  const { data: listaRachs } = useOpciones('RACHS')
  const { data: listaCondicionSalida } = useOpciones('CONDICION_SALIDA')

  const puedeCrear = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'

  const hayFiltrosActivos = useMemo(
    () => Object.entries(filtros).some(([clave, valor]) => clave !== 'busqueda' && valor),
    [filtros],
  )

  function actualizarFiltro<K extends keyof Filtros>(clave: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
  }

  return (
    <div>
      <EncabezadoPagina
        icono={<IconoPacientes className="h-5 w-5" />}
        titulo="Pacientes"
        subtitulo={pacientes ? `${pacientes.length} ${pacientes.length === 1 ? 'paciente registrado' : 'pacientes registrados'}` : undefined}
        acciones={
          puedeCrear && (
            <button type="button" onClick={() => navigate('/pacientes/nuevo')} className={claseBotonPrimario}>
              <span className="text-base leading-none">+</span> Nuevo paciente
            </button>
          )
        }
      />

      <Tarjeta className="mb-4" titulo="Buscar y filtrar" icono={<IconoFiltro />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative col-span-full">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <IconoBuscar />
            </span>
            <input
              type="text"
              placeholder="Buscar por nombre o identificación…"
              value={filtros.busqueda}
              onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
              className={`${claseInput} pl-9`}
            />
          </div>

          <select value={filtros.epsValor} onChange={(e) => actualizarFiltro('epsValor', e.target.value)} className={claseSelect}>
            <option value="">EPS: todas</option>
            {listaEps?.map((o) => (
              <option key={o.id} value={o.valor}>{o.valor}</option>
            ))}
          </select>

          <select value={filtros.diagnosticoValor} onChange={(e) => actualizarFiltro('diagnosticoValor', e.target.value)} className={claseSelect}>
            <option value="">Diagnóstico: todos</option>
            {listaDiagnosticos?.map((o) => (
              <option key={o.id} value={o.valor}>{o.valor}</option>
            ))}
          </select>

          <select value={filtros.rachsValor} onChange={(e) => actualizarFiltro('rachsValor', e.target.value)} className={claseSelect}>
            <option value="">RACHS-1: todos</option>
            {listaRachs?.map((o) => (
              <option key={o.id} value={o.valor}>{o.valor}</option>
            ))}
          </select>

          <select value={filtros.condicionSalidaValor} onChange={(e) => actualizarFiltro('condicionSalidaValor', e.target.value)} className={claseSelect}>
            <option value="">Condición de salida: todas</option>
            {listaCondicionSalida?.map((o) => (
              <option key={o.id} value={o.valor}>{o.valor}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <label className="flex-none text-xs text-slate-500">Cirugía desde</label>
            <input type="date" value={filtros.fechaCirugiaDesde} onChange={(e) => actualizarFiltro('fechaCirugiaDesde', e.target.value)} className={claseInput} />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex-none text-xs text-slate-500">hasta</label>
            <input type="date" value={filtros.fechaCirugiaHasta} onChange={(e) => actualizarFiltro('fechaCirugiaHasta', e.target.value)} className={claseInput} />
          </div>

          {hayFiltrosActivos && (
            <button type="button" onClick={() => setFiltros(FILTROS_INICIALES)} className={`${claseBotonTexto} justify-self-start`}>
              Limpiar filtros
            </button>
          )}
        </div>
      </Tarjeta>

      {error && <MensajeError>No se pudo cargar el listado de pacientes.</MensajeError>}
      {isLoading && <Cargando />}

      {pacientes && (
        <Tarjeta>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">Paciente</th>
                  <th className="px-4 py-3 font-semibold">Identificación</th>
                  <th className="px-4 py-3 font-semibold">Edad</th>
                  <th className="px-4 py-3 font-semibold">Diagnóstico</th>
                  <th className="px-4 py-3 text-center font-semibold">M1</th>
                  <th className="px-4 py-3 text-center font-semibold">M2</th>
                  <th className="px-4 py-3 text-center font-semibold">M3</th>
                  <th className="px-4 py-3 text-center font-semibold">M4</th>
                  <th className="px-4 py-3 text-center font-semibold">M5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pacientes.map((p) => (
                  <tr key={p.paciente_id} onClick={() => navigate(`/pacientes/${p.paciente_id}`)} className="group cursor-pointer hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                          {iniciales(p.nombre_completo)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{p.nombre_completo}</span>
                          <span className="block text-xs text-slate-400">N° {p.numero_paciente}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.identificacion}</td>
                    <td className="px-4 py-3 text-slate-600">{formatearEdad(p.edad_dias)}</td>
                    <td className="px-4 py-3 text-slate-600">{p.diagnostico_valor ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><EstadoModuloChip estado={p.estado_m1} /></td>
                    <td className="px-4 py-3 text-center"><EstadoModuloChip estado={p.estado_m2} /></td>
                    <td className="px-4 py-3 text-center"><EstadoModuloChip estado={p.estado_m3} /></td>
                    <td className="px-4 py-3 text-center"><EstadoModuloChip estado={p.estado_m4} /></td>
                    <td className="px-4 py-3 text-center"><EstadoModuloChip estado={p.estado_m5} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pacientes.length === 0 && (
              <EstadoVacio icono={<IconoPacientes className="h-8 w-8" />} mensaje="No hay pacientes que coincidan con los filtros." />
            )}
          </div>
        </Tarjeta>
      )}
    </div>
  )
}
