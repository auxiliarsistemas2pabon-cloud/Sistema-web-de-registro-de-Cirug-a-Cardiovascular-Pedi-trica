import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { claseInput } from '../../components/Campo'
import { Cargando, MensajeError } from '../../components/Estados'
import { api, consulta } from '../../lib/api'
import type { RegistroAuditoria } from '../../types/db'

const TABLAS = [
  'pacientes',
  'diagnosticos',
  'diagnosticos_riesgos',
  'cirugias',
  'cirugias_procedimientos',
  'postoperatorio',
  'seguimientos',
]

function useAuditoria(tabla: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['auditoria', tabla, desde, hasta],
    queryFn: () => api.get<RegistroAuditoria[]>('/admin/auditoria' + consulta({ tabla, desde, hasta })),
  })
}

function Diferencia({ registro }: { registro: RegistroAuditoria }) {
  const anteriores = registro.valores_anteriores ?? {}
  const nuevos = registro.valores_nuevos ?? {}
  const claves = Array.from(new Set([...Object.keys(anteriores), ...Object.keys(nuevos)])).sort()
  const cambiadas = claves.filter((k) => JSON.stringify(anteriores[k]) !== JSON.stringify(nuevos[k]))

  if (cambiadas.length === 0) return <p className="text-xs text-slate-400">Sin cambios de campos.</p>

  return (
    <table className="w-full text-left text-xs">
      <thead className="text-slate-400">
        <tr>
          <th className="py-1 pr-4">Campo</th>
          <th className="py-1 pr-4">Antes</th>
          <th className="py-1">Después</th>
        </tr>
      </thead>
      <tbody>
        {cambiadas.map((k) => (
          <tr key={k} className="align-top">
            <td className="py-0.5 pr-4 font-medium text-slate-600">{k}</td>
            <td className="py-0.5 pr-4 text-red-500">{JSON.stringify(anteriores[k]) ?? '—'}</td>
            <td className="py-0.5 text-emerald-600">{JSON.stringify(nuevos[k]) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AuditoriaTab() {
  const [tabla, setTabla] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [expandido, setExpandido] = useState<number | null>(null)
  const { data: registros, isLoading, error } = useAuditoria(tabla, desde, hasta)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Tabla</label>
          <select value={tabla} onChange={(e) => setTabla(e.target.value)} className={claseInput}>
            <option value="">Todas</option>
            {TABLAS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseInput} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={claseInput} />
        </div>
      </div>

      {isLoading && <Cargando />}
      {error && <MensajeError>No se pudo cargar la auditoría.</MensajeError>}

      {registros && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Fecha</th>
                <th className="px-3 py-2.5 font-semibold">Tabla</th>
                <th className="px-3 py-2.5 font-semibold">Operación</th>
                <th className="px-3 py-2.5 font-semibold">Usuario</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registros.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{new Date(r.fecha).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{r.tabla}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.operacion === 'INSERT'
                            ? 'bg-emerald-100 text-emerald-700'
                            : r.operacion === 'DELETE'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {r.operacion}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{r.usuario_nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                        className="text-sm font-medium text-sky-700 hover:underline"
                      >
                        {expandido === r.id ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    </td>
                  </tr>
                  {expandido === r.id && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={5} className="px-4 py-3">
                        <Diferencia registro={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">Sin registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
