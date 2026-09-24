interface Dato {
  etiqueta: string
  valor: number
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
  const recortado = texto.length > maxCaracteres ? `${texto.slice(0, maxCaracteres - 1)}…` : texto
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

/** Tabla equivalente de un gráfico de barras de una sola serie (etiqueta + valor). */
export function TablaDatos({ datos, sufijoValor = '' }: { datos: Dato[]; sufijoValor?: string }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="py-1.5">Categoría</th>
          <th className="py-1.5">Valor</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {datos.map((d) => (
          <tr key={d.etiqueta}>
            <td className="py-2">{d.etiqueta}</td>
            <td className="py-2 font-medium tabular-nums">{d.valor}{sufijoValor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Tooltip: el valor va primero y resaltado (lo que el lector busca), la categoría queda como
 * encabezado secundario — el orden inverso al de una leyenda, donde la identidad manda.
 */
export function TooltipGrafico({
  active,
  payload,
  label,
  sufijoValor = '',
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  sufijoValor?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{payload[0].value}{sufijoValor}</p>
      <p className="text-slate-500">{label}</p>
    </div>
  )
}
