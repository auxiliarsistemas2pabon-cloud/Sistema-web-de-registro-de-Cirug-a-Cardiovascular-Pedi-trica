import { useOpciones } from '../hooks/useOpciones'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  categoria: string
  /** Código estable (ver catalogos.mjs) de la opción que excluye a todas las demás — "Ninguno" en
   * RIESGOS, "Ninguna" en COMPLICACION_INTRAQX, "No" en COMPLICACION_POP. Si la categoría no tiene
   * una opción así, se puede omitir y los chips se comportan como una selección múltiple simple. */
  codigoExcluyente?: string
}

/** Chips de selección múltiple sobre una categoría de opciones_lista: si se marca la opción
 * excluyente (p. ej. "Ninguno"/"Ninguna"/"No") se desmarcan las demás, y viceversa. Usado para
 * factores de riesgo y, desde que dejaron de ser una sola opción, también para complicaciones. */
export function SeleccionMultiple({ value, onChange, categoria, codigoExcluyente }: Props) {
  const { data: opciones } = useOpciones(categoria)
  const excluyente = codigoExcluyente ? opciones?.find((o) => o.codigo === codigoExcluyente) : undefined

  function alternar(id: string) {
    if (excluyente && id === excluyente.id) {
      onChange(value.includes(id) ? [] : [id])
      return
    }
    const sinExcluyente = excluyente ? value.filter((v) => v !== excluyente.id) : value
    onChange(sinExcluyente.includes(id) ? sinExcluyente.filter((v) => v !== id) : [...sinExcluyente, id])
  }

  const excluyenteMarcado = !!excluyente && value.includes(excluyente.id)

  return (
    <div className="flex flex-wrap gap-2">
      {opciones?.map((opcion) => {
        const seleccionado = value.includes(opcion.id)
        const deshabilitado = excluyenteMarcado && opcion.id !== excluyente?.id
        return (
          <button
            key={opcion.id}
            type="button"
            aria-pressed={seleccionado}
            disabled={deshabilitado}
            onClick={() => alternar(opcion.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              seleccionado
                ? 'border-[var(--pabon-azul-oscuro)] bg-[var(--pabon-azul-oscuro)] text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-600 hover:border-[var(--pabon-azul-claro)] hover:text-slate-900'
            } ${deshabilitado ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            {opcion.valor}
          </button>
        )
      })}
    </div>
  )
}
