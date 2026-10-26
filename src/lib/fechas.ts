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

/** Días entre dos fechas ISO (yyyy-mm-dd), sin que el horario de verano o la hora del día los mueva. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/** Días en UCI (de la cirugía al traslado a cuidados intermedios o, sin traslado, a la salida) y días
 * totales de hospitalización (de la cirugía al egreso). La misma cuenta que sqlDiasUci y
 * sqlDiasHospitalizacion en server/servicios.mjs, para verla en la ficha mientras se escriben las fechas. */
export function diasEstancia({ fechaCirugia, fechaTraslado, fechaSalida }: { fechaCirugia: string | null; fechaTraslado: string; fechaSalida: string }) {
  if (!fechaCirugia) return { uci: null, hospitalizacion: null }
  const finUci = fechaTraslado || fechaSalida
  return {
    uci: finUci ? diasEntre(fechaCirugia, finUci) : null,
    hospitalizacion: fechaSalida ? diasEntre(fechaCirugia, fechaSalida) : null,
  }
}

/** Fecha de hoy en formato yyyy-mm-dd (para atributos max de <input type="date">). */
export function hoyIso(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Fecha (yyyy-mm-dd) de hace exactamente `anios` años: la fecha de nacimiento más reciente que
 * ya cumple esa edad hoy. Para el módulo de adultos, como atributo max de "fecha de nacimiento"
 * (solo deja elegir fechas que ya son mayores de edad) y para validarlo con Zod. */
export function edadMinimaIso(anios: number): string {
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - anios)
  return limite.toLocaleDateString('en-CA')
}
