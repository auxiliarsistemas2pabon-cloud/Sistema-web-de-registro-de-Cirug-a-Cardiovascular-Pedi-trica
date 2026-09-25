import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '../../components/Campo'
import { Cargando, MensajeError } from '../../components/Estados'
import { Badge } from '../../components/ui/badge'
import { api, mensajeDe } from '../../lib/api'
import type { CategoriaLista, OpcionLista } from '../../types/db'

function useCategorias() {
  return useQuery({
    queryKey: ['categorias_lista'],
    queryFn: () => api.get<CategoriaLista[]>('/admin/listas/categorias'),
  })
}

function useOpcionesAdmin(categoriaId: string | undefined) {
  return useQuery({
    queryKey: ['opciones_admin', categoriaId],
    enabled: !!categoriaId,
    queryFn: () => api.get<OpcionLista[]>(`/admin/listas/categorias/${categoriaId}/opciones`),
  })
}

export function ListasTab() {
  const queryClient = useQueryClient()
  const { data: categorias } = useCategorias()
  const [categoriaId, setCategoriaId] = useState<string>('')
  const { data: opciones, isLoading } = useOpcionesAdmin(categoriaId || categorias?.[0]?.id)
  const categoriaActiva = categoriaId || categorias?.[0]?.id || ''
  const [nuevoValor, setNuevoValor] = useState('')
  const [nuevoOrden, setNuevoOrden] = useState('0')
  const [error, setError] = useState<string | null>(null)

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['opciones_admin', categoriaActiva] })
    queryClient.invalidateQueries({ queryKey: ['opciones'] })
  }

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null)
    try {
      await accion()
    } catch (causa) {
      setError(mensajeDe(causa))
    }
    invalidar()
  }

  const guardarValor = (id: string, valor: string) => ejecutar(() => api.patch(`/admin/listas/opciones/${id}`, { valor }))
  const guardarOrden = (id: string, orden: number) => ejecutar(() => api.patch(`/admin/listas/opciones/${id}`, { orden }))
  const alternarActivo = (id: string, activo: boolean) => ejecutar(() => api.patch(`/admin/listas/opciones/${id}`, { activo: !activo }))

  async function agregarOpcion(e: FormEvent) {
    e.preventDefault()
    if (!nuevoValor.trim() || !categoriaActiva) return
    await ejecutar(() => api.post('/admin/listas/opciones', { categoria_id: categoriaActiva, valor: nuevoValor.trim(), orden: Number(nuevoOrden) || 0 }))
    setNuevoValor('')
    setNuevoOrden('0')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Lista</label>
        <select value={categoriaActiva} onChange={(e) => setCategoriaId(e.target.value)} className={`${claseInput} max-w-xs`}>
          {categorias?.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <form onSubmit={agregarOpcion} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Nueva opción</label>
          <input value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} className={claseInput} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Orden</label>
          <input type="number" value={nuevoOrden} onChange={(e) => setNuevoOrden(e.target.value)} className={`${claseInput} w-20`} />
        </div>
        <button type="submit" className={claseBotonPrimario}>
          Agregar
        </button>
      </form>

      {error && <MensajeError>{error}</MensajeError>}
      {isLoading && <Cargando />}

      {opciones && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="w-20 px-3 py-2.5 font-semibold">Orden</th>
                <th className="px-3 py-2.5 font-semibold">Código</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {opciones.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-1.5">
                    <input
                      defaultValue={o.valor}
                      onBlur={(e) => e.target.value !== o.valor && guardarValor(o.id, e.target.value)}
                      className="w-full rounded border border-transparent px-1.5 py-1 hover:border-slate-300 focus:border-[var(--pabon-azul-oscuro)] focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      defaultValue={o.orden}
                      onBlur={(e) => Number(e.target.value) !== o.orden && guardarOrden(o.id, Number(e.target.value))}
                      className="w-16 rounded border border-transparent px-1.5 py-1 hover:border-slate-300 focus:border-[var(--pabon-azul-oscuro)] focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{o.codigo ?? ''}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className={o.activo ? 'bg-emerald-100 text-emerald-700 border-emerald-200/60' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                      {o.activo ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => alternarActivo(o.id, o.activo)} className={claseBotonSecundario}>
                      {o.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
