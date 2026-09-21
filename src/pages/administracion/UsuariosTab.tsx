import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claseInput } from '../../components/Campo'
import { api, mensajeDe } from '../../lib/api'
import type { Perfil, Rol } from '../../types/db'

function usePerfiles() {
  return useQuery({
    queryKey: ['perfiles'],
    queryFn: () => api.get<Perfil[]>('/admin/usuarios'),
  })
}

export function UsuariosTab() {
  const queryClient = useQueryClient()
  const { data: perfiles, isLoading } = usePerfiles()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('registrador')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)

  async function crearUsuario(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await api.post('/admin/usuarios', { email, password, nombre_completo: nombre, rol })
      setNombre('')
      setEmail('')
      setPassword('')
      setRol('registrador')
      setMostrarForm(false)
      queryClient.invalidateQueries({ queryKey: ['perfiles'] })
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo crear el usuario.'))
    } finally {
      setEnviando(false)
    }
  }

  async function actualizar(id: string, cambios: { rol?: Rol; activo?: boolean }) {
    setErrorLista(null)
    try {
      await api.patch(`/admin/usuarios/${id}`, cambios)
    } catch (causa) {
      setErrorLista(mensajeDe(causa))
    }
    queryClient.invalidateQueries({ queryKey: ['perfiles'] })
  }

  const cambiarRol = (id: string, nuevoRol: Rol) => actualizar(id, { rol: nuevoRol })
  const alternarActivo = (id: string, activo: boolean) => actualizar(id, { activo: !activo })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Usuarios</h2>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          {mostrarForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearUsuario} className="max-w-md space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <input placeholder="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseInput} />
          <input type="email" placeholder="Correo electrónico" required value={email} onChange={(e) => setEmail(e.target.value)} className={claseInput} />
          <input type="password" placeholder="Contraseña temporal (mín. 10, con mayúsculas, minúsculas y números)" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={claseInput} />
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className={claseInput}>
            <option value="administrador">Administrador</option>
            <option value="registrador">Registrador</option>
            <option value="consulta">Consulta</option>
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={enviando} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      )}

      {errorLista && <p className="text-sm text-red-600">{errorLista}</p>}
      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

      {perfiles && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2">Nombre</th>
              <th className="py-2">Correo</th>
              <th className="py-2">Rol</th>
              <th className="py-2">Estado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-2">{p.nombre_completo}</td>
                <td className="py-2 text-slate-500">{p.email}</td>
                <td className="py-2">
                  <select
                    value={p.rol}
                    onChange={(e) => cambiarRol(p.id, e.target.value as Rol)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="administrador">Administrador</option>
                    <option value="registrador">Registrador</option>
                    <option value="consulta">Consulta</option>
                  </select>
                </td>
                <td className="py-2">
                  <span className={p.activo ? 'text-emerald-600' : 'text-slate-400'}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => alternarActivo(p.id, p.activo)}
                    className="text-sm text-sky-600 hover:underline"
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
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
