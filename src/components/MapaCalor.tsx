import { SinDatosGrafico } from './GraficoComun'

export interface FilaMapaCalor {
  etiqueta: string
  total: number
  /** Valor de cada columna; las que faltan valen 0. */
  valores: Record<string, number>
}

interface Props {
  filas: FilaMapaCalor[]
  columnas: string[]
  /** Encabezado de la columna de nombres de fila ("Procedimiento"). */
  tituloFilas: string
  /** Lo que cuenta cada celda, para el tooltip: "cirugía" / "cirugías". */
  unidad: [singular: string, plural: string]
  /** Fila y columna filtradas ahora (cada una puede venir de otro gráfico): el resto se atenúa. */
  filaSeleccionada: string | null
  columnaSeleccionada: string | null
  onSeleccionar?: (fila: string, columna: string) => void
}

/**
 * Mapa de calor de dos categorías cruzadas (p. ej. procedimiento × grupo de edad). Es una tabla: cada
 * celda lleva su número escrito (no depende del color ni del mouse) y su fondo, un solo tono de azul de
 * claro a oscuro según la cantidad (skill de dataviz: magnitud = rampa secuencial de un tono). El tono
 * más oscuro es el paso 400 de la rampa, para que el número en negro se lea en cualquier celda (5.6:1).
 */
export function MapaCalor({ filas, columnas, tituloFilas, unidad, filaSeleccionada, columnaSeleccionada, onSeleccionar }: Props) {
  if (filas.length === 0) return <SinDatosGrafico />
  const maximo = Math.max(...filas.flatMap((f) => columnas.map((c) => f.valores[c] ?? 0)))
  const atenuada = (fila: string, columna: string) =>
    (filaSeleccionada !== null && fila !== filaSeleccionada) || (columnaSeleccionada !== null && columna !== columnaSeleccionada)
  const texto = (n: number) => `${n} ${n === 1 ? unidad[0] : unidad[1]}`

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-600">
                {tituloFilas}
              </th>
              {columnas.map((columna) => (
                <th key={columna} scope="col" className="min-w-16 px-1 py-1.5 text-center text-xs font-medium text-slate-600">
                  {columna}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-right text-xs font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.etiqueta}>
                <th scope="row" className="sticky left-0 z-10 max-w-64 bg-white px-2 py-1 text-left text-xs font-normal text-slate-700">
                  {fila.etiqueta}
                </th>
                {columnas.map((columna) => {
                  const valor = fila.valores[columna] ?? 0
                  const descripcion = `${fila.etiqueta} · ${columna}: ${texto(valor)}`
                  const estilo = valor > 0
                    ? { background: `color-mix(in oklab, var(--chart-calor-alto) ${Math.round((valor / maximo) * 100)}%, var(--chart-calor-bajo))` }
                    : undefined
                  const clase = `h-9 w-full rounded text-center tabular-nums text-slate-900 transition-opacity ${
                    valor > 0 ? '' : 'bg-slate-50'
                  } ${atenuada(fila.etiqueta, columna) ? 'opacity-35' : ''}`
                  return (
                    <td key={columna} className="p-0">
                      {onSeleccionar && valor > 0 ? (
                        <button
                          type="button"
                          title={`${descripcion}. Clic para filtrar el tablero.`}
                          aria-label={descripcion}
                          onClick={() => onSeleccionar(fila.etiqueta, columna)}
                          style={estilo}
                          className={`${clase} cursor-pointer outline-none hover:ring-2 hover:ring-[var(--pabon-azul-oscuro)] focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-oscuro)] ${
                            fila.etiqueta === filaSeleccionada && columna === columnaSeleccionada ? 'ring-2 ring-[var(--pabon-azul-oscuro)]' : ''
                          }`}
                        >
                          {valor}
                        </button>
                      ) : (
                        <div title={descripcion} style={estilo} className={`${clase} flex items-center justify-center`}>
                          {valor > 0 ? valor : ''}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-2 text-right tabular-nums text-xs font-medium text-slate-900">{fila.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-600" aria-hidden>
        <span>Menos</span>
        <span className="h-2.5 w-28 rounded-sm" style={{ background: 'linear-gradient(to right, var(--chart-calor-bajo), var(--chart-calor-alto))' }} />
        <span>Más ({texto(maximo)})</span>
        <span className="ml-3 h-2.5 w-4 rounded-sm bg-slate-50 ring-1 ring-slate-200" />
        <span>Ninguna</span>
      </div>
    </div>
  )
}
