import { useState } from 'react'
import { Pie, PieChart, Sector, type PieSectorShapeProps } from 'recharts'
import { SinDatosGrafico } from './GraficoComun'
import { claveDe, OPACIDAD_ATENUADA, porcentajeEntero, type PropsSeleccion } from '../lib/graficos'

export interface Segmento {
  etiqueta: string
  valor: number
  /** Valor con el que se filtra el tablero, si no es la etiqueta (p. ej. "alteracion"). */
  clave?: string
  /** Color fijo de la categoría (nunca por su posición: si un filtro quita una categoría, las
   * demás conservan el suyo). */
  color: string
  /** Desglose opcional que se lista bajo la categoría en la leyenda (p. ej. qué alteraciones
   * de la herida hay dentro de "Con alteración"). */
  desglose?: { etiqueta: string; valor: number }[]
}

interface Props extends PropsSeleccion {
  segmentos: Segmento[]
  /** Qué se cuenta, para el centro de la dona ("cirugías", "pacientes"). */
  unidad?: string
}

const TAMANO = 176

/**
 * Dona: parte de un todo con pocas categorías (sexo, estado de la herida), para leer de un
 * vistazo qué proporción ocupa cada una. La leyenda trae cada cifra y su porcentaje escritos —
 * ningún valor depende del color ni de pasar el mouse — y está enlazada con la dona: al pasar
 * sobre una fila o un segmento se resaltan ambos. Si la dona filtra el tablero, un clic en un
 * segmento o en su fila (un botón, también con el teclado) elige esa categoría.
 */
export function GraficoDona({ segmentos, unidad = 'cirugías', seleccion, onSeleccionar }: Props) {
  const [activo, setActivo] = useState<number | null>(null)
  const visibles = segmentos.filter((s) => s.valor > 0)
  const total = visibles.reduce((suma, s) => suma + s.valor, 0)

  if (!total) return <SinDatosGrafico />

  const indiceElegido = seleccion ? visibles.findIndex((s) => claveDe(s) === seleccion) : -1
  // Al pasar el mouse manda el segmento bajo el puntero; si no, el elegido como filtro.
  const resaltado = activo ?? (indiceElegido >= 0 ? indiceElegido : null)
  const elegir = (s: Segmento) => onSeleccionar?.(claveDe(s), s.etiqueta)

  return (
    // Diseño según el ancho de la tarjeta (container query), no de la pantalla: en una tarjeta
    // angosta la leyenda va debajo de la dona; en una ancha, al lado.
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center @md:gap-8">
        <div className="relative flex-none" style={{ width: TAMANO, height: TAMANO }}>
          <PieChart width={TAMANO} height={TAMANO} style={onSeleccionar ? { cursor: 'pointer' } : undefined}>
            <Pie
              data={visibles}
              dataKey="valor"
              nameKey="etiqueta"
              innerRadius={60}
              outerRadius={84}
              startAngle={90}
              endAngle={-270}
              // Separación de 2 px del color de la tarjeta entre segmentos, en vez de un borde.
              stroke="var(--card)"
              strokeWidth={2}
              onMouseEnter={(_, indice) => setActivo(indice)}
              onMouseLeave={() => setActivo(null)}
              onClick={(_, indice) => visibles[indice] && elegir(visibles[indice])}
              shape={(props: PieSectorShapeProps) => (
                <Sector
                  {...props}
                  fill={(props.payload as Segmento).color}
                  fillOpacity={resaltado === null || resaltado === props.index ? 1 : OPACIDAD_ATENUADA}
                  outerRadius={resaltado === props.index ? 88 : 84}
                />
              )}
            />
          </PieChart>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">{unidad}</span>
          </div>
        </div>

        <ul className="w-full max-w-md min-w-0 flex-1 space-y-0.5">
          {visibles.map((s, i) => {
            const elegido = i === indiceElegido
            const fila = (
              <div className="flex items-center gap-3 text-sm">
                <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                <span className={`min-w-0 flex-1 truncate text-left text-slate-700 ${elegido ? 'font-semibold' : ''}`} title={s.etiqueta}>
                  {s.etiqueta}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{s.valor}</span>
                <span className="w-11 text-right tabular-nums text-slate-500">{porcentajeEntero(s.valor, total)}%</span>
              </div>
            )
            return (
              <li
                key={s.etiqueta}
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                className={`rounded-md transition-colors ${elegido ? 'bg-sky-50 ring-1 ring-sky-200' : activo === i ? 'bg-slate-100' : ''}`}
              >
                {onSeleccionar ? (
                  <button
                    type="button"
                    onClick={() => elegir(s)}
                    aria-pressed={elegido}
                    title={elegido ? 'Clic para quitar el filtro' : 'Clic para filtrar el tablero'}
                    className="block w-full rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]"
                  >
                    {fila}
                  </button>
                ) : (
                  <div className="px-2 py-1.5">{fila}</div>
                )}
                {s.desglose && s.desglose.length > 0 && (
                  <ul className="space-y-0.5 pr-2 pb-1.5 pl-[30px]">
                    {s.desglose.map((d) => (
                      <li key={d.etiqueta} className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="min-w-0 flex-1 truncate">{d.etiqueta}</span>
                        <span className="tabular-nums">{d.valor}</span>
                        <span className="w-11" aria-hidden />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
