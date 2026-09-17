import type { EstadoModulo } from '../types/db'

const ESTILOS: Record<EstadoModulo, string> = {
  completo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  no_aplica: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

const ETIQUETAS: Record<EstadoModulo, string> = {
  completo: 'Completo',
  pendiente: 'Pendiente',
  no_aplica: 'No aplica',
}

export function EstadoModuloChip({ estado }: { estado: EstadoModulo }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[estado]}`}>
      {ETIQUETAS[estado]}
    </span>
  )
}
