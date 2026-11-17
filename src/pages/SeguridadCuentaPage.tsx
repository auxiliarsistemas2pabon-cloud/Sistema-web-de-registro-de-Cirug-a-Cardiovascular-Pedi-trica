import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { CodigosRecuperacion } from '../auth/CompletarAcceso'
import { NOMBRES_ROL } from '../auth/permisos'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '../components/Campo'
import { api, mensajeDe } from '../lib/api'

export function SeguridadCuentaPage() {
  const { perfil, refrescarSesion } = useAuth()
  const [accion, setAccion] = useState('reauth')
  const [password, setPassword] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [codigo, setCodigo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [codigos, setCodigos] = useState<string[] | null>(null)
  async function enviar(e: FormEvent) {
    e.preventDefault(); setError(''); setMensaje(''); setOcupado(true)
    try {
      if (accion === 'clave') {
        if (nueva !== confirmacion) { setError('Las contraseñas no coinciden.'); return }
        await api.post('/auth/clave', { password_actual: password, password_nueva: nueva, codigo })
        setMensaje('Contraseña cambiada. Las otras sesiones se han cerrado.')
      } else if (accion === 'recuperacion') {
        const r = await api.post<{ codigos_recuperacion: string[] }>('/auth/mfa/recuperacion', { password, codigo })
        setCodigos(r.codigos_recuperacion)
      } else if (accion === 'reiniciar') {
        await api.post('/auth/mfa/reiniciar', { password, codigo })
        await refrescarSesion()
      } else {
        await api.post('/auth/reauth', { password, codigo })
        setMensaje('Identidad confirmada durante diez minutos. Puede volver a la operación que estaba realizando.')
      }
      setPassword(''); setNueva(''); setConfirmacion(''); setCodigo('')
    } catch (e) { setError(mensajeDe(e)) } finally { setOcupado(false) }
  }
  return <section className="max-w-2xl space-y-5 rounded-xl border bg-white p-6">
    <h1 className="text-xl font-bold">Seguridad de mi cuenta</h1>
    <p>{perfil?.nombre_completo} · {perfil && NOMBRES_ROL[perfil.rol]} · Doble factor activo</p>
    <p className="text-sm text-slate-600">Para cambiar permisos, importar o exportar datos debe haber confirmado su identidad en los últimos diez minutos.</p>
    {codigos ? <CodigosRecuperacion codigos={codigos} continuar={() => setCodigos(null)} /> : <form onSubmit={enviar} className="space-y-4">
      <label className="block">Operación<select className={claseInput} value={accion} onChange={(e) => { setAccion(e.target.value); setPassword(''); setCodigo(''); setMensaje(''); setError('') }}>
        <option value="reauth">Confirmar identidad</option><option value="clave">Cambiar contraseña</option><option value="recuperacion">Generar nuevos códigos de recuperación</option><option value="reiniciar">Cambiar aplicación autenticadora</option>
      </select></label>
      <label className="block">Contraseña actual<input required type="password" autoComplete="current-password" className={claseInput} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {accion === 'clave' && <>
        <label className="block">Nueva contraseña<input required type="password" autoComplete="new-password" minLength={12} className={claseInput} value={nueva} onChange={(e) => setNueva(e.target.value)} /></label>
        <label className="block">Repita la nueva contraseña<input required type="password" autoComplete="new-password" className={claseInput} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} /></label>
      </>}
      <label className="block">{accion === 'reiniciar' ? 'Código actual o código de recuperación sin utilizar' : 'Código actual de su aplicación autenticadora'}<input required pattern={accion === 'reiniciar' ? '([0-9]{6}|[a-fA-F0-9]{32})' : '[0-9]{6}'} maxLength={accion === 'reiniciar' ? 32 : 6} autoComplete="one-time-code" className={claseInput} value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
      <p className="text-xs text-slate-500">Cada código de seis dígitos se acepta una sola vez. Los códigos de recuperación solo se usan al iniciar sesión.</p>
      <button disabled={ocupado} className={claseBotonPrimario}>{ocupado ? 'Verificando…' : 'Confirmar operación'}</button>
    </form>}
    {mensaje && <p role="status" className="text-emerald-700">{mensaje}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Link className={claseBotonSecundario} to="/inicio">Volver al inicio</Link>
  </section>
}
