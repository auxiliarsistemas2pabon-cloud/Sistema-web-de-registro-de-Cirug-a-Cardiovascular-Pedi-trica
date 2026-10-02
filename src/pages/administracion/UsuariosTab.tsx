import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Campo, claseBotonPrimario, claseBotonSecundario, claseBotonSecundarioCompacto, claseInput } from '../../components/Campo'
import { Cargando, MensajeError } from '../../components/Estados'
import { IconoUsuarioMas } from '../../components/iconos'
import { Badge } from '../../components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
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
  const [porDesactivar, setPorDesactivar] = useState<Perfil | null>(null)

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

  function pedirCambioActivo(perfil: Perfil) {
    if (perfil.activo) setPorDesactivar(perfil) // desactivar es lo único que se confirma: reactivar es de bajo riesgo.
    else void actualizar(perfil.id, { activo: true })
  }

  async function confirmarDesactivar() {
    if (!porDesactivar) return
    await actualizar(porDesactivar.id, { activo: false })
    setPorDesactivar(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          Usuarios
          {perfiles && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-600">
              {perfiles.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          aria-expanded={mostrarForm}
          className={mostrarForm ? claseBotonSecundario : claseBotonPrimario}
        >
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
        <form onSubmit={crearUsuario} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre completo *">
              <input required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" className={claseInput} />
            </Campo>
            <Campo etiqueta="Correo electrónico *">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={claseInput} />
            </Campo>
            <Campo etiqueta="Contraseña temporal *">
              <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={claseInput} />
              <span className="mt-1 block text-xs text-slate-500">Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</span>
            </Campo>
            <Campo etiqueta="Rol *">
              <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} className={claseInput}>
                <option value="administrador">Administrador</option>
                <option value="registrador">Registrador</option>
                <option value="consulta">Consulta</option>
              </select>
            </Campo>
          </div>
          {error && <MensajeError>{error}</MensajeError>}
          <button type="submit" disabled={enviando} className={claseBotonPrimario}>
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      )}

      {errorLista && <MensajeError>{errorLista}</MensajeError>}
      {isLoading && <Cargando />}

      {perfiles && (
        // overflow-x-auto (no overflow-hidden): en el celular la tabla se desliza en horizontal en vez
        // de cortar las columnas de rol, estado y acciones.
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[46rem] text-left text-sm">
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
                      <span className="whitespace-nowrap font-medium text-slate-900">{p.nombre_completo}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{p.email}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={p.rol}
                      onChange={(e) => cambiarRol(p.id, e.target.value as Rol)}
                      aria-label={`Rol de ${p.nombre_completo}`}
                      className="h-8 rounded-md border border-slate-300 bg-white pl-2.5 text-sm text-slate-700 outline-none hover:border-slate-400 focus:border-[var(--pabon-azul-oscuro)] focus:ring-3 focus:ring-[var(--pabon-azul-claro)]/25"
                    >
                      <option value="administrador">Administrador</option>
                      <option value="registrador">Registrador</option>
                      <option value="consulta">Consulta</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={p.activo ? 'bg-emerald-100 text-emerald-700 border-emerald-200/60' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => pedirCambioActivo(p)} className={claseBotonSecundarioCompacto}>
                      {p.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!porDesactivar} onOpenChange={(abierto) => { if (!abierto) setPorDesactivar(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar a {porDesactivar?.nombre_completo}?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrá iniciar sesión hasta que un administrador lo vuelva a activar. Sus registros anteriores no se ven afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmarDesactivar()}>Desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
