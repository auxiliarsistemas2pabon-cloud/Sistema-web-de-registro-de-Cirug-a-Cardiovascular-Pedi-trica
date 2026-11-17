import { useState, type FormEvent } from 'react'
import { api, mensajeDe } from '../lib/api'
import { claseBotonPrimario, claseBotonSecundario, claseInput } from '../components/Campo'
import { useAuth } from './AuthProvider'

export function CodigosRecuperacion({ codigos, continuar }: { codigos: string[]; continuar: () => void }) {
  return <div className="space-y-4">
    <h2 className="text-lg font-bold">Guarde sus códigos de recuperación</h2>
    <p>Se muestran una sola vez. Guárdelos en su gestor de contraseñas, separados de la aplicación autenticadora. Cada código sirve una sola vez.</p>
    <ul className="space-y-2 rounded bg-slate-100 p-3 font-mono text-sm select-all">{codigos.map((c) => <li key={c}>{c}</li>)}</ul>
    <button type="button" onClick={continuar} className={claseBotonPrimario}>He guardado los códigos</button>
  </div>
}

export function CompletarAcceso() {
  const { perfil, paso, cerrarSesion, refrescarSesion } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enrolamiento, setEnrolamiento] = useState<{ secreto: string; qr: string } | null>(null)
  const [recuperacion, setRecuperacion] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function ejecutar(accion: () => Promise<void>) {
    setError(null); setOcupado(true)
    try { await accion() } catch (e) { setError(mensajeDe(e)) } finally { setOcupado(false) }
  }
  async function enviar(e: FormEvent) {
    e.preventDefault()
    await ejecutar(async () => {
      if (paso === 'clave') {
        if (nueva !== confirmacion) throw new Error('Las contraseñas no coinciden.')
        await api.post('/auth/clave', { password_actual: actual, password_nueva: nueva, codigo })
        setActual(''); setNueva(''); setConfirmacion(''); setCodigo('')
        await refrescarSesion()
      } else if (paso === 'inscripcion_mfa') {
        const r = await api.post<{ codigos_recuperacion: string[] }>('/auth/mfa/activar', { codigo })
        setRecuperacion(r.codigos_recuperacion); setEnrolamiento(null); setCodigo('')
      } else {
        await api.post('/auth/mfa/verificar', { codigo: codigo.trim() })
        setCodigo(''); await refrescarSesion()
      }
    })
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
    <section className="w-full max-w-lg space-y-5 rounded-xl bg-white p-6 shadow">
      <h1 className="text-xl font-bold">Proteja el acceso a su cuenta</h1>
      <p className="text-sm text-slate-600">{perfil?.nombre_completo}. La ficha clínica estará disponible al completar estos pasos. Dispone de cinco minutos; si expira, vuelva a iniciar sesión.</p>
      {recuperacion ? <CodigosRecuperacion codigos={recuperacion} continuar={() => void ejecutar(refrescarSesion)} /> : <>
        {paso === 'inscripcion_mfa' && !enrolamiento && <div className="space-y-3">
          <p>Configure una aplicación autenticadora para generar códigos de seis dígitos en su dispositivo.</p>
          <button className={claseBotonPrimario} disabled={ocupado} onClick={() => void ejecutar(async () => {
            setEnrolamiento(await api.post('/auth/mfa/enrolar'))
          })}>Configurar doble factor</button>
        </div>}
        {enrolamiento && <div className="space-y-3">
          <p>Escanee el QR con su aplicación autenticadora o ingrese esta clave manualmente.</p>
          <img src={enrolamiento.qr} width={240} height={240} alt="Código QR para configurar el doble factor" />
          <code className="block break-all rounded bg-slate-100 p-2 select-all">{enrolamiento.secreto}</code>
        </div>}
        {(paso !== 'inscripcion_mfa' || enrolamiento) && <form onSubmit={enviar} className="space-y-4">
          {paso === 'clave' && <>
            <p>Cambie su contraseña temporal. Use al menos doce caracteres con mayúsculas, minúsculas y números.</p>
            <label className="block">Contraseña actual<input aria-label="Contraseña actual" required type="password" autoComplete="current-password" className={claseInput} value={actual} onChange={(e) => setActual(e.target.value)} /></label>
            <label className="block">Nueva contraseña<input aria-label="Nueva contraseña" required minLength={12} type="password" autoComplete="new-password" className={claseInput} value={nueva} onChange={(e) => setNueva(e.target.value)} /></label>
            <label className="block">Repita la nueva contraseña<input aria-label="Repita la nueva contraseña" required type="password" autoComplete="new-password" className={claseInput} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} /></label>
            {nueva && confirmacion && nueva !== confirmacion && <p role="alert">Las contraseñas no coinciden.</p>}
          </>}
          {(paso !== 'clave' || perfil?.mfa_activo) && <label className="block">
            {paso === 'mfa' ? 'Código de doble factor o código de recuperación' : 'Código de seis dígitos'}
            <input aria-label="Código de verificación" required autoComplete="one-time-code" className={claseInput} value={codigo} maxLength={32} onChange={(e) => setCodigo(e.target.value)} />
            <span className="text-xs text-slate-500">Un código ya utilizado no puede repetirse. Espere al siguiente código si es necesario.</span>
          </label>}
          <button type="submit" disabled={ocupado || (paso === 'clave' && nueva !== confirmacion)} className={claseBotonPrimario}>{ocupado ? 'Verificando…' : paso === 'clave' ? 'Cambiar contraseña' : 'Verificar código'}</button>
        </form>}
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button type="button" className={claseBotonSecundario} onClick={() => void cerrarSesion()}>Cerrar sesión</button>
    </section>
  </main>
}
