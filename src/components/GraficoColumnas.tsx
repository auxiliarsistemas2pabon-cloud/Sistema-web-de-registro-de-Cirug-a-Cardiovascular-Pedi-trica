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
import { AlternarTabla, SinDatosGrafico, TablaDatos, TickEnvuelto, TooltipGrafico } from './GraficoComun'
import {
  caracteresPorCategoria,
  COLOR_SIN_DATO,
  esSinDato,
  estaAtenuado,
  OPACIDAD_ATENUADA,
  partirEtiqueta,
  porcentajeEntero,
  claseBarrasClicables,
  fondoClicable,
  seleccionarDato,
  useAnchoContenedor,
  type Dato,
  type PropsSeleccion,
} from '../lib/graficos'

interface Props extends PropsSeleccion {
  datos: Dato[]
  /**
   * true: histograma de una variable continua agrupada en rangos (peso, talla, días…): las columnas
   * casi se tocan porque cada rango empieza donde termina el anterior. false: categorías ordenadas
   * pero discretas (RACHS-1, EuroSCORE), con aire entre columnas.
   */
  histograma?: boolean
  /** Unidad común de los rangos ("kg", "días"): se quita de cada etiqueta del eje y se escribe una
   * sola vez como título del eje, para que las etiquetas quepan sin repetirla. */
  unidad?: string
}

const ANCHO_EJE_Y = 32
const MARGEN = { top: 22, right: 8, bottom: 0, left: 0 }
const MAX_COLUMNAS_CON_ETIQUETA = 12

/** Columnas verticales de una sola serie, en el orden de las categorías (nunca reordenadas por
 * cantidad: el orden de los rangos es lo que deja leer la forma de la distribución). */
export function GraficoColumnas({ datos, histograma = false, unidad, seleccion, onSeleccionar }: Props) {
  const [modoTabla, setModoTabla] = useState(false)
  const [ref, ancho] = useAnchoContenedor()

  if (datos.length === 0) return <SinDatosGrafico />

  const sufijoUnidad = unidad ? ` ${unidad}` : ''
  const etiquetaEje = (texto: string) => (sufijoUnidad && texto.endsWith(sufijoUnidad) ? texto.slice(0, -sufijoUnidad.length) : texto)
  const maxCaracteres = caracteresPorCategoria(ancho, datos.length, ANCHO_EJE_Y + MARGEN.left + MARGEN.right)
  const dosLineas = datos.some((d) => partirEtiqueta(etiquetaEje(d.etiqueta), maxCaracteres).length > 1)
  const altoEjeX = dosLineas ? 38 : 24
  const total = datos.reduce((suma, d) => suma + d.valor, 0)

  return (
    <div ref={ref} className={claseBarrasClicables({ onSeleccionar })}>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} conPorcentaje seleccion={seleccion} onSeleccionar={onSeleccionar} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200 + altoEjeX}>
            <BarChart
              data={datos}
              margin={MARGEN}
              barCategoryGap={histograma ? 3 : '28%'}
            >
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="etiqueta"
                interval={0}
                height={altoEjeX}
                tickLine={false}
                tick={<TickEnvuelto maxCaracteres={maxCaracteres} formato={etiquetaEje} />}
              />
              <YAxis allowDecimals={false} width={ANCHO_EJE_Y} tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }} />
              <Tooltip
                content={
                  <TooltipGrafico
                    detalle={(d) => `${porcentajeEntero(d.valor, total)}% del total`}
                    interactivo={Boolean(onSeleccionar)}
                    seleccion={seleccion}
                  />
                }
                cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
              />
              <Bar
                dataKey="valor"
                radius={[4, 4, 0, 0]}
                maxBarSize={histograma ? undefined : 32}
                activeBar
                background={fondoClicable({ onSeleccionar })}
                onClick={(item) => seleccionarDato(item.payload as Dato, { seleccion, onSeleccionar })}
                shape={(props: BarShapeProps) => (
                  <Rectangle
                    {...props}
                    fill={
                      esSinDato(props.payload?.etiqueta ?? '')
                        ? COLOR_SIN_DATO
                        : histograma
                          ? 'var(--chart-histograma)'
                          : 'var(--chart-azul)'
                    }
                    fillOpacity={estaAtenuado(props.payload, seleccion) ? OPACIDAD_ATENUADA : props.isActive ? 0.75 : 1}
                  />
                )}
              >
                {datos.length <= MAX_COLUMNAS_CON_ETIQUETA && (
                  <LabelList dataKey="valor" position="top" style={{ fill: 'var(--chart-texto-secundario)', fontSize: 11 }} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {unidad && <p className="mt-1 text-center text-xs text-slate-500">Rangos en {unidad}</p>}
        </>
      )}
    </div>
  )
}
