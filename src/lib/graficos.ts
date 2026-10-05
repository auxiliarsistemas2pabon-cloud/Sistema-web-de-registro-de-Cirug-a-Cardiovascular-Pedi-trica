// Utilidades compartidas de los gráficos del tablero de indicadores (los componentes están en
// components/GraficoComun.tsx; aquí solo funciones y constantes, para no romper el fast refresh).
import { useCallback, useState } from 'react'

export interface Dato {
  etiqueta: string
  valor: number
  /** Valor con el que se filtra el tablero al hacer clic, si no es la etiqueta misma (p. ej. "IV"
   * para "RACHS IV", o "2026-05" para "May 2026"). */
  clave?: string
  /** Pacientes detrás de la categoría, cuando el valor no es un conteo (p. ej. una tasa de 0 % que
   * sí tiene pacientes). Sin él, se usa el valor. */
  n?: number
}

export const claveDe = (d: Dato) => d.clave ?? d.etiqueta

/** Una categoría sin pacientes no se puede elegir como filtro: dejaría todo el tablero vacío. */
export const tienePacientes = (d: Dato) => (d.n ?? d.valor) > 0

/** Gráficos que filtran todo el tablero con un clic. */
export interface PropsSeleccion {
  /** Clave de la categoría elegida en este gráfico: se resalta y las demás se atenúan. */
  seleccion?: string | null
  /** Clic en una categoría: filtra el tablero por ella (otro clic en la misma quita el filtro). */
  onSeleccionar?: (clave: string, etiqueta: string) => void
}

/** Opacidad de las categorías no elegidas mientras hay una elegida en el gráfico. */
export const OPACIDAD_ATENUADA = 0.3

export const estaAtenuado = (d: Dato | undefined, seleccion: string | null | undefined) =>
  seleccion !== null && seleccion !== undefined && d !== undefined && claveDe(d) !== seleccion

/** Clic en una categoría: la elige como filtro (o quita el filtro si ya era la elegida). Una
 * categoría vacía no se puede elegir (dejaría todo el tablero sin pacientes), pero sí quitarle el filtro. */
export function seleccionarDato(dato: Dato | undefined, props: PropsSeleccion) {
  if (!dato || !props.onSeleccionar) return
  if (!tienePacientes(dato) && claveDe(dato) !== props.seleccion) return
  props.onSeleccionar(claveDe(dato), dato.etiqueta)
}

/** Para las barras: el clic va en la barra misma (Recharts da su dato exacto) y un fondo
 * transparente a lo alto de toda su banda la vuelve clicable aunque sea pequeña o valga 0. */
export const fondoClicable = (props: PropsSeleccion) => (props.onSeleccionar ? { fill: 'transparent' } : undefined)

/** Cursor de mano sobre las barras y su banda cuando el gráfico filtra el tablero. */
export const claseBarrasClicables = (props: PropsSeleccion) =>
  props.onSeleccionar ? '[&_.recharts-bar-background-rectangle]:cursor-pointer [&_.recharts-bar-rectangle]:cursor-pointer' : ''

/**
 * Clic en la línea de tiempo: Recharts da el índice del mes bajo el puntero (el de la línea
 * vertical que sigue al mouse), así no hace falta atinarle al punto.
 */
export function seleccionarPorIndice(datos: Dato[], estado: { activeIndex?: unknown }, props: PropsSeleccion) {
  const indice = Number(estado.activeIndex)
  seleccionarDato(Number.isInteger(indice) ? datos[indice] : undefined, props)
}

/** Gris de los datos faltantes: el servidor nombra así las categorías vacías ("Sin dato",
 * "Sin registrar", "Sin EPS", "Sin RACHS"…). En todos los gráficos van en gris para que no
 * compitan con las categorías reales, pero siguen visibles con su cantidad. */
export const COLOR_SIN_DATO = 'var(--chart-sin-dato)'
export const esSinDato = (etiqueta: string) => /^sin /i.test(etiqueta)

/** Porcentaje entero de una parte sobre el total (0 si no hay total). */
export const porcentajeEntero = (valor: number, total: number) => (total ? Math.round((valor / total) * 100) : 0)

/** Ancho del contenedor en píxeles, actualizado al redimensionar: los gráficos verticales lo usan
 * para saber cuánto espacio tiene cada etiqueta del eje X antes de partirla en dos líneas. */
export function useAnchoContenedor() {
  const [ancho, setAncho] = useState(0)
  const ref = useCallback((elemento: HTMLDivElement | null) => {
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])
  return [ref, ancho] as const
}

/** Ancho medio de un carácter a 11 px en la fuente de la app (Geist), con un poco de holgura. */
const ANCHO_CARACTER = 6.5

/** Cuántos caracteres caben en una línea de una categoría del eje X. */
export function caracteresPorCategoria(anchoGrafico: number, categorias: number, anchoReservado: number): number {
  if (!anchoGrafico) return 12
  return Math.max(4, Math.floor(((anchoGrafico - anchoReservado) / categorias - 6) / ANCHO_CARACTER))
}

export const recortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto)

/** Parte una etiqueta en dos líneas como máximo: en un espacio o justo después de un guion (así
 * "50–59.9" queda "50–" / "59.9" e "Intermedio (2-5%)" queda "Intermedio" / "(2-5%)"). */
export function partirEtiqueta(texto: string, maxCaracteres: number): string[] {
  if (texto.length <= maxCaracteres) return [texto]
  for (let i = Math.min(maxCaracteres, texto.length - 1); i > 0; i--) {
    const cortaAqui = texto[i] === ' ' || texto[i - 1] === '–' || texto[i - 1] === '-'
    if (cortaAqui) return [texto.slice(0, i).trimEnd(), recortar(texto.slice(i).trimStart(), maxCaracteres)]
  }
  return [recortar(texto, maxCaracteres)]
}
