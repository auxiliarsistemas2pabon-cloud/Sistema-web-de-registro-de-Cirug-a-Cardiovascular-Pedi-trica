/** Formatea una fecha ISO (yyyy-mm-dd) a dd/mm/aaaa. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/** Convierte días en un texto de edad legible: en días, meses o años según corresponda. */
export function formatearEdad(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return ''
  if (dias < 30) return `${dias} ${dias === 1 ? 'día' : 'días'}`
  if (dias < 365) {
    const meses = Math.floor(dias / 30)
    return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  }
  const anios = Math.floor(dias / 365)
  return `${anios} ${anios === 1 ? 'año' : 'años'}`
}

/** Fecha de hoy en formato yyyy-mm-dd (para atributos max de <input type="date">). */
export function hoyIso(): string {
  return new Date().toLocaleDateString('en-CA')
}
