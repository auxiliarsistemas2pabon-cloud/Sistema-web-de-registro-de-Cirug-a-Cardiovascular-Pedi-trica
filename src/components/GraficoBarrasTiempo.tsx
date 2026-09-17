import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Dato {
  etiqueta: string
  valor: number
}

/** Barras verticales para series de tiempo (cirugías por mes): una sola serie, azul. */
export function GraficoBarrasTiempo({ datos }: { datos: Dato[] }) {
  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} width={32} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Bar dataKey="valor" fill="var(--chart-azul)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}
