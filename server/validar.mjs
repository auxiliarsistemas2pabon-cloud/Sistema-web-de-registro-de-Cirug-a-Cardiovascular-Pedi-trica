import { validacion } from './errores.mjs'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function esFechaIso(valor) {
  if (typeof valor !== 'string') return false
  const m = valor.match(ISO)
  if (!m) return false
  const [, a, mes, d] = m.map(Number)
  const fecha = new Date(Date.UTC(a, mes - 1, d))
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d
}

export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/**
 * Validador acumulativo: recoge todos los errores de campo y los lanza juntos como 400 VALIDACION.
 * Los valores vacíos ("" o undefined) se tratan como null.
 */
export class Validador {
  constructor(cuerpo) {
    if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      throw validacion('El cuerpo de la petición debe ser un objeto JSON.')
    }
    this.cuerpo = cuerpo
    this.campos = {}
  }

  #valor(campo) {
    const v = this.cuerpo[campo]
    return v === undefined || v === '' ? null : v
  }

  error(campo, mensaje) {
    this.campos[campo] ??= mensaje
  }

  texto(campo, { obligatorio = false, max = 255 } = {}) {
    const v = this.#valor(campo)
    if (v === null) {
      if (obligatorio) this.error(campo, 'Es obligatorio.')
      return null
    }
    if (typeof v !== 'string') return this.error(campo, 'Debe ser texto.') ?? null
    const limpio = v.trim()
    if (!limpio) {
      if (obligatorio) this.error(campo, 'Es obligatorio.')
      return null
    }
    if (limpio.length > max) this.error(campo, `No puede superar ${max} caracteres.`)
    return limpio
  }

  fecha(campo, { obligatoria = false } = {}) {
    const v = this.#valor(campo)
    if (v === null) {
      if (obligatoria) this.error(campo, 'Es obligatoria.')
      return null
    }
    if (!esFechaIso(v)) {
      this.error(campo, 'Debe ser una fecha válida (aaaa-mm-dd).')
      return null
    }
    return v
  }

  entero(campo, { min = -Infinity, max = Infinity, obligatorio = false } = {}) {
    const v = this.#valor(campo)
    if (v === null) {
      if (obligatorio) this.error(campo, 'Es obligatorio.')
      return null
    }
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      this.error(campo, 'Debe ser un número entero.')
      return null
    }
    if (n < min || n > max) this.error(campo, `Debe estar entre ${min} y ${max}.`)
    return n
  }

  decimal(campo, { min = -Infinity, max = Infinity } = {}) {
    const v = this.#valor(campo)
    if (v === null) return null
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      this.error(campo, 'Debe ser un número.')
      return null
    }
    if (n < min || n > max) this.error(campo, `Debe estar entre ${min} y ${max}.`)
    return n
  }

  opcion(campo, permitidos, { obligatorio = false } = {}) {
    const v = this.#valor(campo)
    if (v === null) {
      if (obligatorio) this.error(campo, 'Es obligatorio.')
      return null
    }
    if (!permitidos.includes(v)) {
      this.error(campo, `Valor no permitido. Use: ${permitidos.join(', ')}.`)
      return null
    }
    return v
  }

  booleano(campo, porDefecto = false) {
    const v = this.cuerpo[campo]
    if (v === undefined || v === null) return porDefecto
    if (typeof v !== 'boolean') this.error(campo, 'Debe ser verdadero o falso.')
    return v === true
  }

  /** Id de una opción de lista (UUID) o null. */
  id(campo, { obligatorio = false } = {}) {
    const v = this.#valor(campo)
    if (v === null) {
      if (obligatorio) this.error(campo, 'Es obligatorio.')
      return null
    }
    if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) {
      this.error(campo, 'Identificador no válido.')
      return null
    }
    return v
  }

  ids(campo) {
    const v = this.cuerpo[campo]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !/^[0-9a-f-]{36}$/i.test(x))) {
      this.error(campo, 'Debe ser una lista de identificadores.')
      return []
    }
    return v
  }

  textos(campo) {
    const v = this.cuerpo[campo]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
      this.error(campo, 'Debe ser una lista de textos.')
      return []
    }
    return v.map((x) => x.trim()).filter(Boolean)
  }

  finalizar() {
    if (Object.keys(this.campos).length > 0) {
      throw validacion('Revise los campos marcados.', this.campos)
    }
  }
}
