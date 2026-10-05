import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts'
import { AlternarTabla, SinDatosGrafico, TablaDatos, TickTruncado, TooltipGrafico } from './GraficoComun'
import {
  COLOR_SIN_DATO,
  esSinDato,
  estaAtenuado,
  OPACIDAD_ATENUADA,
  porcentajeEntero,
  claseBarrasClicables,
  fondoClicable,
  seleccionarDato,
  type Dato,
  type PropsSeleccion,
} from '../lib/graficos'

interface Props extends PropsSeleccion {
  datos: Dato[]
  sufijoValor?: string
  alturaPorFila?: number
  /** Añade a la etiqueta de cada barra su porcentaje del total (p. ej. "15 (58%)"). */
  conPorcentaje?: boolean
}

/** A partir de esta cantidad de barras, ya no se etiqueta cada una (se volvería ruido): el eje y el tooltip siguen llevando el valor. */
const MAX_BARRAS_CON_ETIQUETA = 8

/** Barras horizontales de una sola serie: la forma para ordenar categorías nominales por cantidad
 * (diagnósticos, procedimientos, EPS, procedencia), sobre todo con nombres largos. Nunca un color
 * por categoría — la identidad no importa aquí, solo la cantidad —, salvo "Sin dato" en gris. */
export function GraficoBarras({ datos, sufijoValor = '', alturaPorFila = 32, conPorcentaje = false, seleccion, onSeleccionar }: Props) {
  const [modoTabla, setModoTabla] = useState(false)

  if (datos.length === 0) return <SinDatosGrafico />

  const altura = Math.max(datos.length * alturaPorFila, 80)
  const conEtiquetas = datos.length <= MAX_BARRAS_CON_ETIQUETA
  // El eje de categorías mide lo que pide la etiqueta más larga (~7 px por carácter a 12 px), hasta
  // 190 px: con un ancho fijo, las etiquetas cortas (rangos de peso, sexo) dejaban media tarjeta vacía.
  const anchoEje = Math.min(190, Math.max(56, Math.max(...datos.map((d) => d.etiqueta.length)) * 7 + 12))
  const total = datos.reduce((suma, d) => suma + d.valor, 0)
  const etiquetaBarra = (v: unknown) => {
    if (typeof v !== 'number') return ''
    return conPorcentaje ? `${v}${sufijoValor} (${porcentajeEntero(v, total)}%)` : `${v}${sufijoValor}`
  }

  return (
    <div className={claseBarrasClicables({ onSeleccionar })}>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} sufijoValor={sufijoValor} conPorcentaje={conPorcentaje} seleccion={seleccion} onSeleccionar={onSeleccionar} />
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart
            data={datos}
            layout="vertical"
            margin={{ top: 4, right: conEtiquetas ? (conPorcentaje ? 72 : 40) : 24, bottom: 4, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="etiqueta"
              width={anchoEje}
              interval={0}
              tick={<TickTruncado maxCaracteres={28} />}
            />
            <Tooltip
              content={
                <TooltipGrafico
                  sufijoValor={sufijoValor}
                  detalle={conPorcentaje ? (d) => `${porcentajeEntero(d.valor, total)}% del total` : undefined}
                  interactivo={Boolean(onSeleccionar)}
                  seleccion={seleccion}
                />
              }
              cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            />
            <Bar
              dataKey="valor"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              activeBar
              background={fondoClicable({ onSeleccionar })}
              onClick={(item) => seleccionarDato(item.payload as Dato, { seleccion, onSeleccionar })}
              shape={(props: BarShapeProps) => (
                <Rectangle
                  {...props}
                  fill={esSinDato(props.payload?.etiqueta ?? '') ? COLOR_SIN_DATO : 'var(--chart-azul)'}
                  fillOpacity={estaAtenuado(props.payload, seleccion) ? OPACIDAD_ATENUADA : props.isActive ? 0.75 : 1}
                />
              )}
            >
              {conEtiquetas && (
                <LabelList
                  dataKey="valor"
                  position="right"
                  formatter={etiquetaBarra}
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
