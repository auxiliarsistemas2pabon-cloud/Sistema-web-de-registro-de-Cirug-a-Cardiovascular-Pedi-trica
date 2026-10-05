import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, LabelList, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlternarTabla, SinDatosGrafico, TablaDatos, TooltipGrafico } from './GraficoComun'
import { claveDe, seleccionarPorIndice, type Dato, type PropsSeleccion } from '../lib/graficos'

/** Con más meses que esto, los puntos se vuelven ruido: queda la línea y el punto activo al pasar el mouse. */
const MAX_MESES_CON_PUNTOS = 24

/** Etiqueta solo los puntos indicados (el máximo y el último): un número en cada punto no se lee.
 * En el primer mes se alinea hacia adentro para no encimarse con las cifras del eje Y; en el último
 * va centrada (a la izquierda chocaría con la línea que llega, y el margen derecho le da espacio). */
function EtiquetaSelectiva({
  x,
  y,
  value,
  index,
  indices,
  ultimo,
}: {
  x?: unknown
  y?: unknown
  value?: unknown
  index?: number
  indices: number[]
  ultimo: number
}) {
  if (index === undefined || !indices.includes(index)) return null
  const alInicio = index === 0 && ultimo > 0
  return (
    <text
      x={Number(x) + (alInicio ? 4 : 0)}
      y={Number(y) - 10}
      textAnchor={alInicio ? 'start' : 'middle'}
      fontSize={11}
      fontWeight={600}
      fill="var(--chart-texto-secundario)"
    >
      {String(value)}
    </text>
  )
}

/** Serie de tiempo (cirugías por mes): línea con un lavado suave debajo. Los meses vienen continuos
 * (con ceros donde no hubo cirugías): una línea que saltara un mes vacío inventaría una tendencia.
 * Con un clic en un mes se filtra el tablero a ese mes; el elegido queda marcado con una línea vertical. */
export function GraficoLineaTiempo({ datos, seleccion, onSeleccionar }: { datos: Dato[] } & PropsSeleccion) {
  const [modoTabla, setModoTabla] = useState(false)

  if (datos.length === 0) return <SinDatosGrafico />

  const ultimo = datos.length - 1
  const indiceMaximo = datos.reduce((mejor, d, i) => (d.valor > datos[mejor].valor ? i : mejor), 0)
  const punto = { r: 4, fill: 'var(--chart-azul)', stroke: 'var(--card)', strokeWidth: 2 }
  const cirugias = (n: number) => `${n} ${n === 1 ? 'cirugía' : 'cirugías'}`
  const elegido = seleccion ? datos.find((d) => claveDe(d) === seleccion) : undefined

  return (
    <div>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} seleccion={seleccion} onSeleccionar={onSeleccionar} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={datos}
            margin={{ top: 20, right: 16, bottom: 0, left: 0 }}
            onClick={(estado) => seleccionarPorIndice(datos, estado, { seleccion, onSeleccionar })}
            style={onSeleccionar ? { cursor: 'pointer' } : undefined}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
              tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }}
            />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} />
            {/* La línea vertical sigue al puntero y se ajusta al mes más cercano: se apunta a una
                fecha, no a una línea de 2 px. */}
            <Tooltip
              content={<TooltipGrafico formatoValor={cirugias} interactivo={Boolean(onSeleccionar)} seleccion={seleccion} />}
              cursor={{ stroke: 'var(--chart-no-aplica)', strokeWidth: 1 }}
            />
            {elegido && <ReferenceLine x={elegido.etiqueta} stroke="var(--chart-azul)" strokeOpacity={0.45} strokeWidth={2} />}
            <Area
              type="linear"
              dataKey="valor"
              stroke="var(--chart-azul)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="var(--chart-azul)"
              fillOpacity={0.1}
              dot={datos.length <= MAX_MESES_CON_PUNTOS ? punto : false}
              activeDot={{ ...punto, r: 6 }}
            >
              <LabelList dataKey="valor" content={<EtiquetaSelectiva indices={[indiceMaximo, ultimo]} ultimo={ultimo} />} />
            </Area>
            {elegido && <ReferenceDot x={elegido.etiqueta} y={elegido.valor} r={7} fill="var(--chart-azul)" stroke="var(--card)" strokeWidth={3} />}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
