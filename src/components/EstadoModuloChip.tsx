import type { EstadoModulo } from '../types/db'

const ESTILOS: Record<EstadoModulo, string> = {
  completo: 'bg-emerald-100 text-emerald-700',
  pendiente: 'bg-amber-100 text-amber-700',
  no_aplica: 'bg-slate-100 text-slate-500',
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
