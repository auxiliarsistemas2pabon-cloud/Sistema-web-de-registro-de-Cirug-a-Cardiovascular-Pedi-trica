import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '../../components/Campo'
import { Cargando, MensajeError } from '../../components/Estados'
import { IconoUsuarioMas } from '../../components/iconos'
import { api, mensajeDe } from '../../lib/api'
import type { Perfil, Rol } from '../../types/db'

function usePerfiles() {
  return useQuery({
    queryKey: ['perfiles'],
    queryFn: () => api.get<Perfil[]>('/admin/usuarios'),
  })
}

function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
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
        <h2 className="text-sm font-semibold text-slate-900">Usuarios</h2>
        <button type="button" onClick={() => setMostrarForm((v) => !v)} className={claseBotonPrimario}>
          {mostrarForm ? (
            'Cancelar'
          ) : (
            <>
              <IconoUsuarioMas className="h-4 w-4" /> Nuevo usuario
            </>
          )}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearUsuario} className="max-w-md space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
          <input placeholder="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseInput} />
          <input type="email" placeholder="Correo electrónico" required value={email} onChange={(e) => setEmail(e.target.value)} className={claseInput} />
          <input type="password" placeholder="Contraseña temporal (mín. 10, con mayúsculas, minúsculas y números)" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={claseInput} />
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className={claseInput}>
            <option value="administrador">Administrador</option>
            <option value="registrador">Registrador</option>
            <option value="consulta">Consulta</option>
          </select>
          {error && <MensajeError>{error}</MensajeError>}
          <button type="submit" disabled={enviando} className={claseBotonPrimario}>
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      )}

      {errorLista && <MensajeError>{errorLista}</MensajeError>}
      {isLoading && <Cargando />}

      {perfiles && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Nombre</th>
                <th className="px-3 py-2.5 font-semibold">Correo</th>
                <th className="px-3 py-2.5 font-semibold">Rol</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perfiles.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {iniciales(p.nombre_completo)}
                      </span>
                      <span className="font-medium text-slate-900">{p.nombre_completo}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{p.email}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={p.rol}
                      onChange={(e) => cambiarRol(p.id, e.target.value as Rol)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                    >
                      <option value="administrador">Administrador</option>
                      <option value="registrador">Registrador</option>
                      <option value="consulta">Consulta</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => alternarActivo(p.id, p.activo)} className={claseBotonSecundario}>
                      {p.activo ? 'Desactivar' : 'Activar'}
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
