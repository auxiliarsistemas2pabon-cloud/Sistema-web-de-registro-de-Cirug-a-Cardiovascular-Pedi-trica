import { claveDe, partirEtiqueta, porcentajeEntero, recortar, tienePacientes, type Dato, type PropsSeleccion } from '../lib/graficos'

export function SinDatosGrafico() {
  return <p className="py-8 text-center text-sm text-slate-400">Sin datos para este rango.</p>
}

/**
 * Tick del eje X de los gráficos verticales: centrado bajo su columna y partido en dos líneas si
 * no cabe en el ancho de la categoría (en vez de encimarse con el vecino, como hace Recharts por
 * defecto). Si aun así se recorta, el texto completo queda en el `<title>` (tooltip nativo).
 */
export function TickEnvuelto({
  x,
  y,
  payload,
  maxCaracteres = 12,
  formato = (texto: string) => texto,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  maxCaracteres?: number
  formato?: (texto: string) => string
}) {
  const texto = formato(payload?.value ?? '')
  const lineas = partirEtiqueta(texto, maxCaracteres)
  const recortado = lineas.join(' ') !== texto
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill="var(--chart-texto-secundario)">
      {recortado && <title>{texto}</title>}
      {lineas.map((linea, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 12 : 13}>
          {linea}
        </tspan>
      ))}
    </text>
  )
}

/**
 * Tick del eje Y para barras horizontales con nombres largos (diagnósticos, procedimientos):
 * Recharts no trunca ni mide el texto, así que un nombre largo se envuelve en varias líneas y
 * se encima con la fila de arriba/abajo (cada categoría solo tiene el alto de una barra). En vez
 * de agrandar esa fila para el peor caso, se recorta a una sola línea; el nombre completo queda
 * en el `<title>` (tooltip nativo del navegador) y en el tooltip del gráfico al pasar el mouse.
 */
export function TickTruncado({
  x,
  y,
  payload,
  maxCaracteres = 30,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  maxCaracteres?: number
}) {
  const texto = payload?.value ?? ''
  const recortado = recortar(texto, maxCaracteres)
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="var(--chart-texto-secundario)">
      {texto !== recortado && <title>{texto}</title>}
      {recortado}
    </text>
  )
}

/** Alterna entre el gráfico y su tabla de datos equivalente (siempre disponible: ninguna cifra debe depender de pasar el mouse). */
export function AlternarTabla({ modoTabla, onCambiar }: { modoTabla: boolean; onCambiar: (valor: boolean) => void }) {
  return (
    <div className="mb-1 flex justify-end">
      <button
        type="button"
        onClick={() => onCambiar(!modoTabla)}
        className="text-xs font-medium text-sky-700 hover:underline"
      >
        {modoTabla ? 'Ver gráfico' : 'Ver como tabla'}
      </button>
    </div>
  )
}

/** Tabla equivalente de un gráfico de una sola serie (etiqueta + valor, y opcionalmente el % del total).
 * Si el gráfico filtra el tablero, cada categoría es un botón: la misma acción que el clic en el
 * gráfico, también con el teclado. */
export function TablaDatos({
  datos,
  sufijoValor = '',
  conPorcentaje = false,
  seleccion,
  onSeleccionar,
}: {
  datos: Dato[]
  sufijoValor?: string
  conPorcentaje?: boolean
} & PropsSeleccion) {
  const total = datos.reduce((suma, d) => suma + d.valor, 0)
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="py-1.5">Categoría</th>
          <th className="py-1.5 text-right">Valor</th>
          {conPorcentaje && <th className="py-1.5 text-right">%</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {datos.map((d) => {
          const elegida = seleccion !== null && seleccion !== undefined && claveDe(d) === seleccion
          return (
            <tr key={d.etiqueta} className={elegida ? 'bg-sky-50 font-semibold' : ''}>
              <td className="py-2">
                {onSeleccionar ? (
                  <button
                    type="button"
                    onClick={() => onSeleccionar(claveDe(d), d.etiqueta)}
                    disabled={!tienePacientes(d) && !elegida}
                    aria-pressed={elegida}
                    className="text-left text-sky-700 hover:underline disabled:pointer-events-none disabled:no-underline"
                  >
                    {d.etiqueta}
                  </button>
                ) : (
                  d.etiqueta
                )}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">{d.valor}{sufijoValor}</td>
              {conPorcentaje && <td className="py-2 text-right tabular-nums">{porcentajeEntero(d.valor, total)}%</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Tooltip: el valor va primero y resaltado (lo que el lector busca), la categoría queda como
 * encabezado secundario — el orden inverso al de una leyenda, donde la identidad manda. Una
 * tercera línea opcional da contexto ("58% del total", "1 fallecido de 21 cirugías"), y en los
 * gráficos que filtran el tablero, una última recuerda que se puede hacer clic.
 */
export function TooltipGrafico({
  active,
  payload,
  label,
  sufijoValor = '',
  formatoValor,
  detalle,
  interactivo = false,
  seleccion,
}: {
  active?: boolean
  payload?: { value?: unknown; name?: unknown; payload?: unknown }[]
  label?: unknown
  sufijoValor?: string
  formatoValor?: (valor: number) => string
  detalle?: (dato: Dato & Record<string, unknown>) => string | null
  interactivo?: boolean
  seleccion?: string | null
}) {
  if (!active || !payload?.length) return null
  const valor = Number(payload[0].value)
  const dato = payload[0].payload as (Dato & Record<string, unknown>) | undefined
  const titulo = String(label ?? dato?.etiqueta ?? payload[0].name ?? '')
  const extra = dato && detalle ? detalle(dato) : null
  const elegida = dato !== undefined && seleccion !== null && seleccion !== undefined && claveDe(dato) === seleccion
  const pista = !interactivo || !dato ? null : elegida ? 'Clic para quitar el filtro' : tienePacientes(dato) ? 'Clic para filtrar el tablero' : null
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{formatoValor ? formatoValor(valor) : `${valor}${sufijoValor}`}</p>
      <p className="text-slate-500">{titulo}</p>
      {extra && <p className="mt-0.5 text-slate-500">{extra}</p>}
      {pista && <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] font-medium text-sky-700">{pista}</p>}
    </div>
  )
}
