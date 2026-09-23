import { useOpciones } from '../hooks/useOpciones'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
}

/** Chips de RIESGOS: si se marca "Ninguno" se desmarcan los demás, y viceversa. */
export function SeleccionRiesgos({ value, onChange }: Props) {
  const { data: opciones } = useOpciones('RIESGOS')
  const ninguno = opciones?.find((o) => o.codigo === 'NINGUNO')

  function alternar(id: string) {
    if (ninguno && id === ninguno.id) {
      onChange(value.includes(id) ? [] : [id])
      return
    }
    const sinNinguno = ninguno ? value.filter((v) => v !== ninguno.id) : value
    onChange(sinNinguno.includes(id) ? sinNinguno.filter((v) => v !== id) : [...sinNinguno, id])
  }

  const ningunoMarcado = !!ninguno && value.includes(ninguno.id)

  return (
    <div className="flex flex-wrap gap-2">
      {opciones?.map((opcion) => {
        const seleccionado = value.includes(opcion.id)
        const deshabilitado = ningunoMarcado && opcion.id !== ninguno?.id
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
