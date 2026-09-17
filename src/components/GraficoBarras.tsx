import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Dato {
  etiqueta: string
  valor: number
}

interface Props {
  datos: Dato[]
  color?: 'azul' | 'rojo'
  sufijoValor?: string
  alturaPorFila?: number
}

/** Barras horizontales de una sola serie (magnitud por categoría) — nunca un color por
 * categoría: la identidad no importa aquí, solo la cantidad. */
export function GraficoBarras({ datos, color = 'azul', sufijoValor = '', alturaPorFila = 32 }: Props) {
  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
  }

  const relleno = color === 'rojo' ? 'var(--chart-rojo)' : 'var(--chart-azul)'
  const altura = Math.max(datos.length * alturaPorFila, 80)

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={180}
          tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }}
        />
        <Tooltip
          formatter={(valor) => [`${valor}${sufijoValor}`, '']}
          labelStyle={{ color: '#0b0b0b' }}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Bar dataKey="valor" fill={relleno} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
