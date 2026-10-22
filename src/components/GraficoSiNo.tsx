import { SinDatosGrafico } from './GraficoComun'
import type { Segmento } from './GraficoDona'
import { claveDe, OPACIDAD_ATENUADA, porcentajeEntero, type PropsSeleccion } from '../lib/graficos'

interface Props extends PropsSeleccion {
  segmentos: Segmento[]
  /** Qué se cuenta ("cirugías", "pacientes"), para la frase bajo la cifra. */
  unidad?: string
  /** Lo que significa el "Sí" en palabras, para la frase: "7 de 70 cirugías con cierre esternal diferido". */
  significado: string
}

/**
 * Pregunta Sí/No de la ficha (uso de CEC, extubación en quirófano, reingreso…). Lo que se quiere
 * saber es una sola cifra — qué proporción respondió "Sí" —, así que va como número grande con su
 * frase ("7 de 70 cirugías…"), y debajo una barra de proporción con el resto de respuestas. Una dona
 * decía lo mismo con más tinta y se leía mal cuando un lado era el 99 %.
 */
export function GraficoSiNo({ segmentos, unidad = 'cirugías', significado, seleccion, onSeleccionar }: Props) {
  const visibles = segmentos.filter((s) => s.valor > 0)
  const total = visibles.reduce((suma, s) => suma + s.valor, 0)
  if (!total) return <SinDatosGrafico />

  const si = segmentos.find((s) => s.etiqueta === 'Sí')?.valor ?? 0
  const elegido = (s: Segmento) => seleccion !== null && seleccion !== undefined && claveDe(s) === seleccion
  const atenuado = (s: Segmento) => seleccion !== null && seleccion !== undefined && !elegido(s)

  return (
    <div>
      <p className="text-4xl font-semibold tracking-tight text-slate-900">{porcentajeEntero(si, total)}%</p>
      <p className="mt-1 text-sm text-slate-600">
        {si} de {total} {unidad} {significado}
      </p>

      {/* 2 px de separación del color de la tarjeta entre tramos, en vez de un borde. */}
      <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {visibles.map((s) => (
          <div
            key={s.etiqueta}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(100 * s.valor) / total}%`, background: s.color, opacity: atenuado(s) ? OPACIDAD_ATENUADA : 1 }}
          />
        ))}
      </div>

      {/* La leyenda lleva cada cifra escrita (nada depende del color) y, si el gráfico filtra el
          tablero, cada respuesta es un botón. */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {visibles.map((s) => {
          const contenido = (
            <>
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
              <span className="text-slate-700">{s.etiqueta}</span>
              <span className="font-semibold tabular-nums text-slate-900">{s.valor}</span>
              <span className="tabular-nums text-slate-500">({porcentajeEntero(s.valor, total)}%)</span>
            </>
          )
          return (
            <li key={s.etiqueta} style={{ opacity: atenuado(s) ? 0.55 : 1 }}>
              {onSeleccionar ? (
                <button
                  type="button"
                  onClick={() => onSeleccionar(claveDe(s), s.etiqueta)}
                  aria-pressed={elegido(s)}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-slate-100 ${elegido(s) ? 'bg-sky-50 ring-1 ring-sky-200' : ''}`}
                >
                  {contenido}
                </button>
              ) : (
                <span className="flex items-center gap-1.5">{contenido}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
