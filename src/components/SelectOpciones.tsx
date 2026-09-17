import type { UseFormRegisterReturn } from 'react-hook-form'
import { useOpciones } from '../hooks/useOpciones'
import { claseInput } from './Campo'

interface Props {
  categoria: string
  registro: UseFormRegisterReturn
  disabled?: boolean
  placeholder?: string
}

/** <select> de una categoría de opciones_lista (ej. "EPS", "DIAGNOSTICO"), atado a react-hook-form. */
export function SelectOpciones({ categoria, registro, disabled, placeholder = 'Seleccione…' }: Props) {
  const { data: opciones, isLoading } = useOpciones(categoria)

  return (
    <select {...registro} disabled={disabled || isLoading} className={claseInput}>
      <option value="">{placeholder}</option>
      {opciones?.map((opcion) => (
        <option key={opcion.id} value={opcion.id}>
          {opcion.valor}
        </option>
      ))}
    </select>
  )
}
