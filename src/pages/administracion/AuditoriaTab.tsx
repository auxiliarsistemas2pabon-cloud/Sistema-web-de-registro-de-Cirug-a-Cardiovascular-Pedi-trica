import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { claseInput } from '../../components/Campo'
import { supabase } from '../../lib/supabase'
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
    queryFn: async (): Promise<RegistroAuditoria[]> => {
      let query = supabase.from('v_auditoria').select('*').order('fecha', { ascending: false }).limit(200)
      if (tabla) query = query.eq('tabla', tabla)
      if (desde) query = query.gte('fecha', desde)
      if (hasta) query = query.lte('fecha', `${hasta}T23:59:59`)
      const { data, error } = await query
      if (error) throw error
      return data
    },
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
            <td className="py-0.5 pr-4 font-medium text-slate-600 dark:text-slate-300">{k}</td>
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
      <div className="flex flex-wrap items-end gap-3">
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

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && <p className="text-sm text-red-600">No se pudo cargar la auditoría.</p>}

      {registros && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2">Fecha</th>
              <th className="py-2">Tabla</th>
              <th className="py-2">Operación</th>
              <th className="py-2">Usuario</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <td className="py-2 whitespace-nowrap">{new Date(r.fecha).toLocaleString('es-CO')}</td>
                  <td className="py-2">{r.tabla}</td>
                  <td className="py-2">{r.operacion}</td>
                  <td className="py-2">{r.usuario_nombre ?? '—'}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                      className="text-sm text-sky-600 hover:underline"
                    >
                      {expandido === r.id ? 'Ocultar' : 'Ver detalle'}
                    </button>
                  </td>
                </tr>
                {expandido === r.id && (
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                    <td colSpan={5} className="px-2 py-2">
                      <Diferencia registro={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {registros.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">Sin registros.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
