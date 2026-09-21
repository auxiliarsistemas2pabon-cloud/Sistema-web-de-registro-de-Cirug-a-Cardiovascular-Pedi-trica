import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoModuloChip } from '../components/EstadoModuloChip'
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pacientes</h1>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => navigate('/pacientes/nuevo')}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Nuevo paciente
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-800">
        <input
          type="text"
          placeholder="Buscar por nombre o identificación…"
          value={filtros.busqueda}
          onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
          className="col-span-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />

        <select
          value={filtros.epsValor}
          onChange={(e) => actualizarFiltro('epsValor', e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">EPS: todas</option>
          {listaEps?.map((o) => (
            <option key={o.id} value={o.valor}>{o.valor}</option>
          ))}
        </select>

        <select
          value={filtros.diagnosticoValor}
          onChange={(e) => actualizarFiltro('diagnosticoValor', e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Diagnóstico: todos</option>
          {listaDiagnosticos?.map((o) => (
            <option key={o.id} value={o.valor}>{o.valor}</option>
          ))}
        </select>

        <select
          value={filtros.rachsValor}
          onChange={(e) => actualizarFiltro('rachsValor', e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">RACHS-1: todos</option>
          {listaRachs?.map((o) => (
            <option key={o.id} value={o.valor}>{o.valor}</option>
          ))}
        </select>

        <select
          value={filtros.condicionSalidaValor}
          onChange={(e) => actualizarFiltro('condicionSalidaValor', e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Condición de salida: todas</option>
          {listaCondicionSalida?.map((o) => (
            <option key={o.id} value={o.valor}>{o.valor}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">Cirugía desde</label>
          <input
            type="date"
            value={filtros.fechaCirugiaDesde}
            onChange={(e) => actualizarFiltro('fechaCirugiaDesde', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">hasta</label>
          <input
            type="date"
            value={filtros.fechaCirugiaHasta}
            onChange={(e) => actualizarFiltro('fechaCirugiaHasta', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_INICIALES)}
            className="text-left text-sm text-sky-600 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">No se pudo cargar el listado de pacientes.</p>}
      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

      {pacientes && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">N°</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Identificación</th>
                <th className="px-4 py-2">Edad</th>
                <th className="px-4 py-2">Diagnóstico</th>
                <th className="px-4 py-2">M1</th>
                <th className="px-4 py-2">M2</th>
                <th className="px-4 py-2">M3</th>
                <th className="px-4 py-2">M4</th>
                <th className="px-4 py-2">M5</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr
                  key={p.paciente_id}
                  onClick={() => navigate(`/pacientes/${p.paciente_id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                >
                  <td className="px-4 py-2 text-slate-500">{p.numero_paciente}</td>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{p.nombre_completo}</td>
                  <td className="px-4 py-2">{p.identificacion}</td>
                  <td className="px-4 py-2">{formatearEdad(p.edad_dias)}</td>
                  <td className="px-4 py-2">{p.diagnostico_valor ?? '—'}</td>
                  <td className="px-4 py-2"><EstadoModuloChip estado={p.estado_m1} /></td>
                  <td className="px-4 py-2"><EstadoModuloChip estado={p.estado_m2} /></td>
                  <td className="px-4 py-2"><EstadoModuloChip estado={p.estado_m3} /></td>
                  <td className="px-4 py-2"><EstadoModuloChip estado={p.estado_m4} /></td>
                  <td className="px-4 py-2"><EstadoModuloChip estado={p.estado_m5} /></td>
                </tr>
              ))}
              {pacientes.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    No hay pacientes que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
