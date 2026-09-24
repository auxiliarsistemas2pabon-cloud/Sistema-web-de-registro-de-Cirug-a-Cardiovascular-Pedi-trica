import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlternarTabla, TablaDatos, TickTruncado, TooltipGrafico } from './GraficoComun'

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

/** A partir de esta cantidad de barras, ya no se etiqueta cada una (se volvería ruido): el eje y el tooltip siguen llevando el valor. */
const MAX_BARRAS_CON_ETIQUETA = 8

/** Barras horizontales de una sola serie (magnitud por categoría) — nunca un color por
 * categoría: la identidad no importa aquí, solo la cantidad. */
export function GraficoBarras({ datos, color = 'azul', sufijoValor = '', alturaPorFila = 32 }: Props) {
  const [modoTabla, setModoTabla] = useState(false)

  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
  }

  const relleno = color === 'rojo' ? 'var(--chart-rojo)' : 'var(--chart-azul)'
  const altura = Math.max(datos.length * alturaPorFila, 80)
  const conEtiquetas = datos.length <= MAX_BARRAS_CON_ETIQUETA

  return (
    <div>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} sufijoValor={sufijoValor} />
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={datos} layout="vertical" margin={{ top: 4, right: conEtiquetas ? 40 : 24, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="etiqueta"
              width={190}
              interval={0}
              tick={<TickTruncado maxCaracteres={28} />}
            />
            <Tooltip content={<TooltipGrafico sufijoValor={sufijoValor} />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
            <Bar dataKey="valor" fill={relleno} radius={[0, 4, 4, 0]} maxBarSize={18} activeBar={{ fillOpacity: 0.75 }}>
              {conEtiquetas && (
                <LabelList
                  dataKey="valor"
                  position="right"
                  formatter={(v: number) => `${v}${sufijoValor}`}
                  style={{ fill: 'var(--chart-texto-secundario)', fontSize: 11 }}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
