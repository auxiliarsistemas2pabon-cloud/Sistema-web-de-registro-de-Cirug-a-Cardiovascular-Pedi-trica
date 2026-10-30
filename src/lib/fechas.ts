/** Formatea una fecha ISO (yyyy-mm-dd) a dd/mm/aaaa. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/** Meses cumplidos entre dos fechas ISO, por calendario (no a 30 días por mes): el 15/03 cumple un mes
 * más el 15 de cada mes. null si falta una fecha o la segunda es anterior. */
export function mesesCumplidos(nacimiento: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!nacimiento || !hasta || hasta < nacimiento) return null
  const [an, mn, dn] = nacimiento.split('-').map(Number)
  const [ah, mh, dh] = hasta.split('-').map(Number)
  return (ah - an) * 12 + (mh - mn) - (dh < dn ? 1 : 0)
}

/**
 * La edad cumplida en `hasta` (hoy, si no se indica) calculada con la fecha de nacimiento (pedido del
 * jefe del servicio): menores de 1 año en meses y desde 1 año en años. Antes del primer mes se agregan
 * los días, "0 meses (12 días)", para no perder el dato en los neonatos. La misma regla está en
 * textoEdad (server/validar.mjs), que la usa en el Excel.
 */
export function formatearEdad(nacimiento: string | null | undefined, hasta: string | null | undefined = hoyIso()): string {
  const meses = mesesCumplidos(nacimiento, hasta)
  if (meses === null) return ''
  if (meses >= 12) {
    const anios = Math.floor(meses / 12)
    return `${anios} ${anios === 1 ? 'año' : 'años'}`
  }
  const textoMeses = `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  if (meses > 0) return textoMeses
  const dias = diasEntre(nacimiento!, hasta!)
  return `${textoMeses} (${dias} ${dias === 1 ? 'día' : 'días'})`
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
