import { Badge } from './ui/badge'
import type { EstadoModulo } from '../types/db'

const ESTILOS: Record<EstadoModulo, string> = {
  completo: 'bg-emerald-100 text-emerald-700 border-emerald-200/60',
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200/60',
  no_aplica: 'bg-slate-100 text-slate-500 border-slate-200',
}

const ETIQUETAS: Record<EstadoModulo, string> = {
  completo: 'Completo',
  pendiente: 'Pendiente',
  no_aplica: 'No aplica',
}

export function EstadoModuloChip({ estado }: { estado: EstadoModulo }) {
  return <Badge variant="outline" className={ESTILOS[estado]}>{ETIQUETAS[estado]}</Badge>
}
