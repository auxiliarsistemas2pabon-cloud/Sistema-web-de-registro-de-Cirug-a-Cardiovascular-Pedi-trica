import { useQueryClient } from '@tanstack/react-query'
import type { OpcionLista } from '../types/db'

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Las opciones que piden especificar cuál: las que dicen otro/otra/otros/otras ("Otro país", "Otras
 * cardiopatías congénitas", "Síndrome genético (… u otro)", "Reintervención por otra causa…"). Misma
 * regla que `esTextoOtro` en server/servicios.mjs, para que la casilla aparezca justo cuando el
 * servidor la guarda. */
export const esTextoOtro = (valor: string | null | undefined) => /(^|[^a-z])otr[oa]s?([^a-z]|$)/.test(sinTildes(valor ?? ''))

/** ¿La opción elegida de una categoría es un "Otro…"? Lee las opciones que ya cargaron los campos del
 * formulario (al guardar, cada campo ya mostró las suyas). */
export function useEsOpcionOtro() {
  const queryClient = useQueryClient()
  return (categoria: string, id: string | null | undefined) =>
    !!id && esTextoOtro(queryClient.getQueryData<OpcionLista[]>(['opciones', categoria])?.find((o) => o.id === id)?.valor)
}

/** Para el aviso de campos faltantes: cada "Otro…" elegido sin escribir cuál, con la etiqueta de su campo. */
export function sinEspecificar(campos: { etiqueta: string; esOtro: boolean; texto: string | null | undefined }[]): string[] {
  return campos.filter((c) => c.esOtro && !(c.texto ?? '').trim()).map((c) => `${c.etiqueta} (especifique)`)
}

/** Las especificaciones de una selección múltiple que se envían al guardar: solo las de opciones
 * elegidas y con texto (el servidor además descarta las que no son de un "Otro…"). */
export function especificacionesElegidas(ids: string[], especificaciones: Record<string, string>): Record<string, string> {
  return Object.fromEntries(ids.filter((id) => especificaciones[id]?.trim()).map((id) => [id, especificaciones[id].trim()]))
}
