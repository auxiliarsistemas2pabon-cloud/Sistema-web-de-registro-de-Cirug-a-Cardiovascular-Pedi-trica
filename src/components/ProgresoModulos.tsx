import { ETIQUETAS_ESTADO_MODULO, NOMBRES_MODULOS } from '../lib/modulos'
import type { EstadoModulo } from '../types/db'

// Mismo lenguaje visual que los pasos de la ficha (CirculoPaso en PacienteFichaPage): completo =
// círculo verde con check, pendiente = número sobre ámbar, no aplica = guion gris. Así el estado
// se reconoce por la forma y no solo por el color. El guion lleva color arbitrario porque
// text-slate-400 está forzado a negro en index.css.
const ESTILOS: Record<EstadoModulo, string> = {
  completo: 'bg-emerald-600 text-white',
  pendiente: 'bg-amber-100 text-slate-900 ring-1 ring-inset ring-amber-400',
  no_aplica: 'bg-slate-100 text-[#94a3b8] ring-1 ring-inset ring-slate-200',
}

function Marca({ estado, numero }: { estado: EstadoModulo; numero: number }) {
  if (estado === 'completo') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (estado === 'no_aplica') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3" aria-hidden>
        <path d="M6 12h12" strokeLinecap="round" />
      </svg>
    )
  }
  return <span aria-hidden>{numero}</span>
}

/** Los cinco módulos de una ficha como una fila compacta de pasos (reemplaza cinco chips de texto). */
export function ProgresoModulos({ estados }: { estados: readonly EstadoModulo[] }) {
  const pendientes = estados.filter((e) => e === 'pendiente').length
  const resumen =
    pendientes === 0 ? 'ficha completa' : `${pendientes} ${pendientes === 1 ? 'módulo pendiente' : 'módulos pendientes'}`

  return (
    <ol className="flex items-center" aria-label={`Módulos de la ficha: ${resumen}`}>
      {estados.map((estado, indice) => (
        <li key={indice} className="flex items-center">
          {indice > 0 && <span aria-hidden className="h-px w-1.5 bg-slate-300" />}
          <span
            title={`M${indice + 1} · ${NOMBRES_MODULOS[indice]}: ${ETIQUETAS_ESTADO_MODULO[estado]}`}
            className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${ESTILOS[estado]}`}
          >
            <Marca estado={estado} numero={indice + 1} />
            <span className="sr-only">
              Módulo {indice + 1}, {NOMBRES_MODULOS[indice]}: {ETIQUETAS_ESTADO_MODULO[estado]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Explica los tres estados de ProgresoModulos (va al pie de la tabla de pacientes). */
export function LeyendaModulos() {
  const muestras: { estado: EstadoModulo; etiqueta: string }[] = [
    { estado: 'completo', etiqueta: 'Completo' },
    { estado: 'pendiente', etiqueta: 'Pendiente' },
    { estado: 'no_aplica', etiqueta: 'No aplica' },
  ]
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600" aria-label="Leyenda de módulos">
      {muestras.map(({ estado, etiqueta }) => (
        <li key={estado} className="flex items-center gap-1.5">
          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${ESTILOS[estado]}`}>
            <Marca estado={estado} numero={1} />
          </span>
          {etiqueta}
        </li>
      ))}
    </ul>
  )
}
