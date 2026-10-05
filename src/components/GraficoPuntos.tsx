import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts'
import { AlternarTabla, SinDatosGrafico, TablaDatos, TickEnvuelto, TooltipGrafico } from './GraficoComun'
import {
  caracteresPorCategoria,
  estaAtenuado,
  OPACIDAD_ATENUADA,
  partirEtiqueta,
  claseBarrasClicables,
  fondoClicable,
  seleccionarDato,
  useAnchoContenedor,
  type Dato,
  type PropsSeleccion,
} from '../lib/graficos'

export interface DatoTasa extends Dato {
  /** Casos y total detrás de la tasa (p. ej. 1 fallecido de 21 cirugías): con pocos casos, un
   * porcentaje alto engaña si no se ve de cuántos sale. */
  casos: number
  total: number
}

interface Props extends PropsSeleccion {
  datos: DatoTasa[]
  /** Cómo se nombran los casos en el tooltip, en singular y plural (p. ej. fallecido / fallecidos). */
  nombreCasos: [string, string]
}

const ANCHO_EJE_Y = 40
const MARGEN = { top: 24, right: 8, bottom: 0, left: 0 }

/** Tasa (%) por categoría ordenada, p. ej. mortalidad por RACHS-1. Rojo de estado crítico: el
 * valor significa un desenlace malo, no es solo "otra serie". */
export function GraficoPuntos({ datos: tasas, nombreCasos, seleccion, onSeleccionar }: Props) {
  const [modoTabla, setModoTabla] = useState(false)
  const [ref, ancho] = useAnchoContenedor()

  if (tasas.length === 0) return <SinDatosGrafico />

  // Una tasa de 0 % también tiene pacientes (los de su total): esos son los que cuentan para poder
  // elegirla como filtro.
  const datos = tasas.map((d) => ({ ...d, n: d.total }))
  const maxCaracteres = caracteresPorCategoria(ancho, datos.length, ANCHO_EJE_Y + MARGEN.left + MARGEN.right)
  const dosLineas = datos.some((d) => partirEtiqueta(d.etiqueta, maxCaracteres).length > 1)
  const altoEjeX = dosLineas ? 38 : 24
  // Techo del eje con aire por encima del máximo (mínimo 10 %, máximo 100 %), para que un 4 % no
  // ocupe todo el alto como si fuera una tasa enorme ni el punto más alto quede pegado al borde.
  // Las marcas van en pasos redondos: Recharts, con un techo como 25, inventaba 7 %, 14 %, 21 %.
  const objetivo = Math.max(10, Math.max(...datos.map((d) => d.valor)) * 1.15)
  const paso = objetivo <= 10 ? 2 : objetivo <= 30 ? 5 : objetivo <= 60 ? 10 : 20
  const techo = Math.min(100, Math.ceil(objetivo / paso) * paso)
  const marcas = Array.from({ length: techo / paso + 1 }, (_, i) => i * paso)
  const describir = (d: Dato & Record<string, unknown>) => {
    const casos = Number(d.casos)
    return `${casos} ${casos === 1 ? nombreCasos[0] : nombreCasos[1]} de ${Number(d.total)} cirugías`
  }

  /** Paleta (lollipop): un tallo fino desde cero y un punto en el valor. Para tasas, el punto es lo
   * que importa; una columna llena le daría al ojo un "volumen" que una tasa no tiene. */
  const paleta = (props: BarShapeProps) => {
    const { x, y, width, height, isActive } = props
    const cx = x + width / 2
    return (
      <g opacity={estaAtenuado(props.payload, seleccion) ? OPACIDAD_ATENUADA : 1}>
        <line x1={cx} x2={cx} y1={y + height} y2={y} stroke="var(--status-critical)" strokeWidth={2} strokeLinecap="round" />
        {/* Anillo de 2 px del color de la tarjeta: separa el punto del tallo y de la línea base. */}
        <circle cx={cx} cy={y} r={isActive ? 7 : 5.5} fill="var(--status-critical)" stroke="var(--card)" strokeWidth={2} />
      </g>
    )
  }

  return (
    <div ref={ref} className={claseBarrasClicables({ onSeleccionar })}>
      <AlternarTabla modoTabla={modoTabla} onCambiar={setModoTabla} />
      {modoTabla ? (
        <TablaDatos datos={datos} sufijoValor="%" seleccion={seleccion} onSeleccionar={onSeleccionar} />
      ) : (
        <ResponsiveContainer width="100%" height={200 + altoEjeX}>
          <BarChart
            data={datos}
            margin={MARGEN}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="etiqueta"
              interval={0}
              height={altoEjeX}
              tickLine={false}
              tick={<TickEnvuelto maxCaracteres={maxCaracteres} />}
            />
            <YAxis
              domain={[0, techo]}
              ticks={marcas}
              width={ANCHO_EJE_Y}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 12, fill: 'var(--chart-texto-secundario)' }}
            />
            <Tooltip
              content={<TooltipGrafico sufijoValor="%" detalle={describir} interactivo={Boolean(onSeleccionar)} seleccion={seleccion} />}
              cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            />
            <Bar
              dataKey="valor"
              shape={paleta}
              activeBar
              background={fondoClicable({ onSeleccionar })}
              onClick={(item) => seleccionarDato(item.payload as Dato, { seleccion, onSeleccionar })}
            >
              <LabelList
                dataKey="valor"
                position="top"
                offset={12}
                formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')}
                style={{ fill: 'var(--chart-texto-secundario)', fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
