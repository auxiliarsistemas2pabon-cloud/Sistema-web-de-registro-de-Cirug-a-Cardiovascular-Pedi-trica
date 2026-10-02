import type { ReactNode } from 'react'
import { claseBotonPrimario } from './Campo'

/** Bloque titulado de un formulario de módulo. Los bloques se separan solos con una línea (el
 * primero no la lleva), así los diez formularios comparten el mismo ritmo visual. */
export function SeccionFormulario({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      {children}
    </section>
  )
}

interface PieProps {
  etiqueta: string
  guardando: boolean
  /** Momento del último guardado exitoso (null si aún no se ha guardado en esta visita). */
  guardadoEn: Date | null
}

/**
 * Barra de guardado de un módulo: queda pegada al borde inferior de la pantalla mientras se recorre
 * un formulario largo, así "Guardar" siempre está a la vista, y confirma cuándo se guardó (antes no
 * había ninguna señal de que el guardado hubiera funcionado). Los márgenes negativos la extienden
 * hasta los bordes de la tarjeta: asume el relleno p-5 / sm:p-6 que le da FichaPaciente.
 */
export function PieFormulario({ etiqueta, guardando, guardadoEn }: PieProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/80 bg-white px-5 py-3 shadow-[0_-6px_16px_-10px_rgb(16_24_40/0.12)] sm:-mx-6 sm:-mb-6 sm:px-6">
      <button type="submit" disabled={guardando} className={claseBotonPrimario}>
        {guardando && <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden />}
        {guardando ? 'Guardando…' : etiqueta}
      </button>
      {guardadoEn && !guardando && (
        <p
          key={guardadoEn.getTime()}
          role="status"
          className="flex items-center gap-2 text-sm text-slate-700 animate-in fade-in-0 slide-in-from-left-1 duration-300"
        >
          {/* Color con valor arbitrario: text-emerald-* está forzado a negro en index.css. */}
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-[#047857]" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
              <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Cambios guardados a las {guardadoEn.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
