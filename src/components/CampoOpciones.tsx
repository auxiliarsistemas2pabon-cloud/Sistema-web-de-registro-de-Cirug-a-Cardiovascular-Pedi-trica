import { useEffect, useRef, type ReactNode } from 'react'
import { useController, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form'
import { useOpciones } from '../hooks/useOpciones'
import { esTextoOtro } from '../lib/opciones'
import { Campo, claseInput } from './Campo'
import { SelectOpciones } from './SelectOpciones'

interface Props<T extends FieldValues> {
  etiqueta: string
  categoria: string
  control: Control<T>
  name: Path<T>
  /** Campo del formulario donde se escribe cuál, si se elige una opción "Otro…" (ver esTextoOtro). */
  nameOtro?: Path<T>
  className?: string
  accion?: ReactNode
  error?: string
  disabled?: boolean
  placeholder?: string
  buscable?: boolean
  permiteCrear?: boolean
}

/**
 * Un campo de lista (etiqueta + SelectOpciones) que, al elegir una opción "Otro…", despliega en ese
 * mismo instante la casilla para escribir cuál. La casilla va fuera del <label> del campo: dentro, la
 * etiqueta quedaría asociada a dos controles.
 */
export function CampoOpciones<T extends FieldValues>({ etiqueta, nameOtro, className, accion, error, ...select }: Props<T>) {
  const { data: opciones } = useOpciones(select.categoria)
  const valor = useWatch({ control: select.control, name: select.name })
  const esOtro = !!nameOtro && esTextoOtro(opciones?.find((o) => o.id === valor)?.valor)

  return (
    <div className={className} data-campo-otro>
      <Campo etiqueta={etiqueta} accion={accion} error={error}>
        <SelectOpciones {...select} />
      </Campo>
      {esOtro && nameOtro && <CampoEspecificacion control={select.control} name={nameOtro} disabled={select.disabled} />}
    </div>
  )
}

/** La casilla "Especifique cuál" de un campo de react-hook-form. */
function CampoEspecificacion<T extends FieldValues>({ control, name, disabled }: { control: Control<T>; name: Path<T>; disabled?: boolean }) {
  const { field } = useController({ control, name })
  return (
    <EntradaEspecificacion
      etiqueta="Especifique cuál"
      value={(field.value as string | null) ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      disabled={disabled}
    />
  )
}

interface PropsEntrada {
  etiqueta: string
  value: string
  onChange: (texto: string) => void
  onBlur?: () => void
  disabled?: boolean
}

/**
 * Casilla para escribir cuál es el "Otro…" elegido. Si aparece porque el usuario acaba de elegirlo (el
 * foco está en el campo de al lado, dentro del mismo `data-campo-otro`), recibe el foco para escribir
 * de una vez; al abrir una ficha que ya lo tenía elegido, no.
 */
export function EntradaEspecificacion({ etiqueta, value, onChange, onBlur, disabled }: PropsEntrada) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const activo = document.activeElement
    if (activo && activo !== document.body && ref.current?.closest('[data-campo-otro]')?.contains(activo)) ref.current.focus()
  }, [])

  return (
    <label className="mt-2 block animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <span className="mb-1 block text-xs font-medium text-slate-600">{etiqueta}</span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        maxLength={255}
        placeholder="Escriba aquí…"
        className={claseInput}
      />
    </label>
  )
}
