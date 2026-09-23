import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { useOpciones } from '../hooks/useOpciones'
import { claseInput } from './Campo'

interface Props<T extends FieldValues> {
  categoria: string
  control: Control<T>
  name: Path<T>
  disabled?: boolean
  placeholder?: string
}

/**
 * <select> de una categoría de opciones_lista, atado a react-hook-form vía useController
 * (no vía register): las opciones llegan de una consulta async, y con register() el valor
 * inicial se asigna sobre el <select> nativo antes de que esas <option> existan, así que el
 * navegador lo descarta en silencio y el campo se queda vacío aunque el dato sí esté guardado.
 * useController mantiene `value` como prop controlada, que React vuelve a aplicar en cada
 * render (incluida la llegada tardía de las opciones), así que siempre queda sincronizado.
 */
export function SelectOpciones<T extends FieldValues>({ categoria, control, name, disabled, placeholder = 'Seleccione…' }: Props<T>) {
  const { data: opciones, isLoading } = useOpciones(categoria)
  const { field } = useController({ control, name })

  return (
    <select
      name={field.name}
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      disabled={disabled || isLoading}
      className={claseInput}
    >
      <option value="">{placeholder}</option>
      {opciones?.map((opcion) => (
        <option key={opcion.id} value={opcion.id}>
          {opcion.valor}
        </option>
      ))}
    </select>
  )
}
