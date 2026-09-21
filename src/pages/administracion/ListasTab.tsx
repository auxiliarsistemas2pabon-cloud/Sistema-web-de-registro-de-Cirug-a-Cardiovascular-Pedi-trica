import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claseInput } from '../../components/Campo'
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
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Lista</label>
        <select
          value={categoriaActiva}
          onChange={(e) => setCategoriaId(e.target.value)}
          className={`${claseInput} max-w-xs`}
        >
          {categorias?.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <form onSubmit={agregarOpcion} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Nueva opción</label>
          <input value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} className={claseInput} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Orden</label>
          <input type="number" value={nuevoOrden} onChange={(e) => setNuevoOrden(e.target.value)} className="w-20 rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
        </div>
        <button type="submit" className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">
          Agregar
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

      {opciones && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2">Valor</th>
              <th className="py-2 w-20">Orden</th>
              <th className="py-2">Código</th>
              <th className="py-2">Estado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {opciones.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-1.5">
                  <input
                    defaultValue={o.valor}
                    onBlur={(e) => e.target.value !== o.valor && guardarValor(o.id, e.target.value)}
                    className="w-full rounded border border-transparent px-1 py-0.5 hover:border-slate-300 focus:border-sky-500 focus:outline-none dark:hover:border-slate-600"
                  />
                </td>
                <td className="py-1.5">
                  <input
                    type="number"
                    defaultValue={o.orden}
                    onBlur={(e) => Number(e.target.value) !== o.orden && guardarOrden(o.id, Number(e.target.value))}
                    className="w-16 rounded border border-transparent px-1 py-0.5 hover:border-slate-300 focus:border-sky-500 focus:outline-none dark:hover:border-slate-600"
                  />
                </td>
                <td className="py-1.5 text-slate-400">{o.codigo ?? ''}</td>
                <td className="py-1.5">
                  <span className={o.activo ? 'text-emerald-600' : 'text-slate-400'}>
                    {o.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <button type="button" onClick={() => alternarActivo(o.id, o.activo)} className="text-sm text-sky-600 hover:underline">
                    {o.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
