import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ErrorApi } from '../lib/api'

export function LoginPage() {
  const { perfil, cargando, iniciarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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

      {/* Columna izquierda: marca y mensaje institucional */}
      <div className="relative z-10 flex w-full min-w-0 max-w-xl flex-col items-center gap-10 text-center text-white lg:max-w-3xl lg:flex-1 lg:items-start lg:justify-between lg:gap-0 lg:py-2 lg:text-left">
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
            className="h-40 w-auto flex-none drop-shadow-xl sm:h-48 lg:h-56 xl:h-64"
          />
          {/* min-w-0: sin esto, un flex item con texto largo se niega a encogerse y en vez de
              ajustar el salto de línea se desborda por encima de la tarjeta (visible en ~1024px,
              justo donde el layout pasa de columna a fila). */}
          <div className="min-w-0 lg:flex-1">
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-4xl xl:text-5xl">
              Trabajamos con el corazón
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm text-white/90 sm:text-base lg:mx-0">
              Sistema de Registro de Cirugía Cardiovascular Pediátrica.
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold tracking-widest text-white/70">PASTO, NARIÑO · COLOMBIA</p>
      </div>

      {/* Tarjeta de acceso: flota sobre el mismo fondo rojo, centrada verticalmente. */}
      <div className="relative z-10 flex w-full max-w-sm items-center lg:w-auto lg:self-center">
        <form onSubmit={handleSubmit} className="w-full rounded-2xl bg-white p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">Ingresa tus credenciales de acceso</p>

          <label className="mb-1 block text-sm font-medium text-slate-700">Correo electrónico</label>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 19.5c0-3.6 3.13-6 7-6s7 2.4 7 6" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-sky-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-[var(--pabon-azul-oscuro)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pabon-azul-claro)]/30"
            />
          </div>

          <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
          <div className="relative mb-2">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-sky-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-[var(--pabon-azul-oscuro)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pabon-azul-claro)]/30"
            />
          </div>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Entrar'}
          </button>

          <p className="mt-5 text-center text-xs text-slate-400">
            Si no tienes una cuenta, solicita a un Administrador que te cree un usuario.
          </p>
        </form>
      </div>
    </div>
  )
}
