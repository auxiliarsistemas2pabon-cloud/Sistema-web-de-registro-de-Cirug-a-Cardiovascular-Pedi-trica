import { useOpciones } from '../hooks/useOpciones'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
}

/** Checkboxes de RIESGOS: si se marca "Ninguno" se desmarcan los demás, y viceversa. */
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
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {opciones?.map((opcion) => (
        <label
          key={opcion.id}
          className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
        >
          <input
            type="checkbox"
            checked={value.includes(opcion.id)}
            disabled={ningunoMarcado && opcion.id !== ninguno?.id}
            onChange={() => alternar(opcion.id)}
          />
          {opcion.valor}
        </label>
      ))}
    </div>
  )
}
