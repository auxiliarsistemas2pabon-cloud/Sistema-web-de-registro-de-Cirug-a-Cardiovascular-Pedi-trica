import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlternarTabla, TablaDatos, TooltipGrafico } from './GraficoComun'

interface Dato {
  etiqueta: string
  valor: number
}

/** Más allá de esta cantidad de columnas (rango largo) ya no se etiqueta cada una: se volvería ruido. */
const MAX_COLUMNAS_CON_ETIQUETA = 12

/** Barras verticales para series de tiempo (cirugías por mes): una sola serie, azul. */
export function GraficoBarrasTiempo({ datos }: { datos: Dato[] }) {
  const [modoTabla, setModoTabla] = useState(false)

  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
  }

  const conEtiquetas = datos.length <= MAX_COLUMNAS_CON_ETIQUETA

  return (
    <div>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} />
      ) : (
        <ResponsiveContainer width="100%" height={conEtiquetas ? 240 : 220}>
          <BarChart data={datos} margin={{ top: conEtiquetas ? 20 : 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} width={32} />
            <Tooltip content={<TooltipGrafico />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
            <Bar dataKey="valor" fill="var(--chart-azul)" radius={[4, 4, 0, 0]} maxBarSize={24} activeBar={{ fillOpacity: 0.75 }}>
              {conEtiquetas && (
                <LabelList dataKey="valor" position="top" style={{ fill: 'var(--chart-texto-secundario)', fontSize: 11 }} />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
