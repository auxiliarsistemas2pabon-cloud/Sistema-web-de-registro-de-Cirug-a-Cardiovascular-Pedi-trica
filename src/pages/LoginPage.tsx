import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ErrorApi } from '../lib/api'
import { IconoCorazon, IconoOjo, IconoOjoCerrado } from '../components/iconos'
import { MensajeError } from '../components/Estados'

/** Un trazo tipo electrocardiograma que se repite `tramos` veces a lo ancho: motivo decorativo
    ligado al lema "Trabajamos con el corazón", no un gráfico de datos real. */
function trazoEcg(tramos: number): string {
  const partes = ['M0,50']
  for (let i = 0; i < tramos; i++) {
    const x = i * 100
    partes.push(`L${x + 28},50 L${x + 36},14 L${x + 44},86 L${x + 52},50 L${x + 60},44 L${x + 68},50 L${x + 100},50`)
  }
  return partes.join(' ')
}

export function LoginPage() {
  const { perfil, cargando, iniciarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [bloqMayusculas, setBloqMayusculas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function alTeclearPassword(e: KeyboardEvent<HTMLInputElement>) {
    setBloqMayusculas(e.getModifierState('CapsLock'))
  }

  if (!cargando && perfil) {
    return <Navigate to="/pacientes" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await iniciarSesion(email, password)
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No se pudo iniciar sesión. Intente de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    // Un solo fondo institucional (azul) para toda la pantalla: la tarjeta de acceso flota
    // sobre él, no vive en un panel aparte. Fijo en los colores de marca, sin variante oscura.
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-12 overflow-hidden bg-gradient-to-br from-[var(--pabon-azul-oscuro-2)] via-[var(--pabon-azul-oscuro)] to-[var(--pabon-azul-oscuro-2)] px-6 py-10 sm:px-10 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6 lg:px-16 lg:py-14">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-black/20 blur-3xl" />
      <svg
        aria-hidden
        viewBox="0 0 1400 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-16 h-20 w-full opacity-[0.12] sm:bottom-24"
      >
        <path
          d={trazoEcg(14)}
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ecg-trazo"
        />
      </svg>

      {/* Columna izquierda: marca y mensaje institucional */}
      <div className="animate-in fade-in-0 slide-in-from-left-6 relative z-10 flex w-full min-w-0 max-w-xl flex-col items-center gap-10 text-center text-white duration-700 lg:max-w-3xl lg:flex-1 lg:items-start lg:justify-between lg:gap-0 lg:py-2 lg:text-left">
        <div className="inline-flex w-fit items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg sm:gap-4 sm:px-5 sm:py-4">
          <img src="/branding/clinica-pabon.jpg" alt="Clínica Pabón" className="h-9 w-auto sm:h-11" />
          <span className="h-8 w-px bg-slate-200 sm:h-9" />
          <img
            src="/branding/centro-cardioneurovascular.png"
            alt="Centro de Cuidados Cardioneurovasculares Pabón S.A.S."
            className="h-9 w-auto sm:h-11"
          />
        </div>

        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-8">
          <img
            src="/branding/dr-wertino-pabon.png"
            alt="Ilustración del Dr. Wertino Pabón"
            className="h-40 w-auto flex-none animate-[flotar_4s_ease-in-out_infinite] drop-shadow-xl sm:h-48 lg:h-56 xl:h-64"
          />
          {/* min-w-0: sin esto, un flex item con texto largo se niega a encogerse y en vez de
              ajustar el salto de línea se desborda por encima de la tarjeta (visible en ~1024px,
              justo donde el layout pasa de columna a fila). */}
          <div className="min-w-0 lg:flex-1">
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-4xl xl:text-5xl">
              Trabajamos con el{' '}
              <span className="relative inline-block">
                corazón
                <span aria-hidden className="absolute inset-x-0 bottom-0.5 -z-10 h-3 rounded-full bg-[var(--pabon-azul-claro)]/50 sm:h-4" />
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm text-white/90 sm:text-base lg:mx-0">
              Sistema de Registro de Cirugía Cardiovascular Pediátrica.
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold tracking-widest text-white/70">PASTO, NARIÑO · COLOMBIA</p>
      </div>

      {/* Tarjeta de acceso: flota sobre el mismo fondo rojo, centrada verticalmente. */}
      <div className="animate-in fade-in-0 slide-in-from-bottom-6 relative z-10 flex w-full max-w-sm items-center delay-150 duration-700 lg:w-auto lg:self-center">
        <form onSubmit={handleSubmit} className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-25px_rgba(5,30,56,0.6)]">
          <div className="flex h-1.5" aria-hidden>
            <span className="flex-1 bg-[var(--pabon-gris)]" />
            <span className="flex-1 bg-[var(--pabon-azul-oscuro)]" />
            <span className="flex-1 bg-[var(--pabon-azul-claro)]" />
          </div>
          <div className="p-8">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/10 text-[var(--pabon-azul-oscuro)]">
            <IconoCorazon className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">Ingresa tus credenciales de acceso</p>

          <label className="mb-1 block text-sm font-medium text-slate-700">Correo electrónico</label>
          <div className="group relative mb-4">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 transition-colors group-focus-within:text-[var(--pabon-azul-oscuro)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 19.5c0-3.6 3.13-6 7-6s7 2.4 7 6" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-sky-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--pabon-azul-oscuro)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pabon-azul-claro)]/30"
            />
          </div>

          <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
          <div className="group relative mb-2">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 transition-colors group-focus-within:text-[var(--pabon-azul-oscuro)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type={mostrarPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={alTeclearPassword}
              onKeyDown={alTeclearPassword}
              className="w-full rounded-lg border border-transparent bg-sky-50 py-2.5 pl-10 pr-10 text-sm text-slate-900 focus:border-[var(--pabon-azul-oscuro)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pabon-azul-claro)]/30"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setMostrarPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {mostrarPassword ? <IconoOjoCerrado className="h-4.5 w-4.5" /> : <IconoOjo className="h-4.5 w-4.5" />}
            </button>
          </div>
          {bloqMayusculas && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber-500" aria-hidden />
              Bloq Mayús está activado.
            </p>
          )}

          {error && <div className="mb-4"><MensajeError>{error}</MensajeError></div>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--pabon-azul-oscuro)] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[var(--pabon-azul-oscuro-2)] hover:shadow-lg active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
          >
            {enviando && (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} strokeOpacity={0.3} />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
              </svg>
            )}
            {enviando ? 'Ingresando…' : 'Entrar'}
          </button>

          <p className="mt-5 text-center text-xs text-slate-400">
            Si no tienes una cuenta, solicita a el Administrador que te cree un usuario.
          </p>
          </div>
        </form>
      </div>
    </div>
  )
}
