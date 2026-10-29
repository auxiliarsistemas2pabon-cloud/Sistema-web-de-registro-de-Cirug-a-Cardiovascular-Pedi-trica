import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useFieldArray, useWatch, type Control, type UseFormSetValue } from 'react-hook-form'
import { useOpciones } from '../hooks/useOpciones'
import type { OpcionLista } from '../types/db'
import { Campo, claseAccionCampo, claseBotonAgregar } from './Campo'
import { CampoOpciones } from './CampoOpciones'
import { SelectOpciones } from './SelectOpciones'

export interface FilaDiagnosticoAdicional {
  diagnostico_id: string
  especificacion: string
  valvulopatia_id: string
}

/** Lo mínimo que este componente necesita del formulario del Módulo 2 (pediátrico o de adultos). */
interface ValoresConAdicionales {
  diagnostico_id: string
  adicionales: FilaDiagnosticoAdicional[]
}

interface Props<T extends ValoresConAdicionales> {
  control: Control<T>
  setValue: UseFormSetValue<T>
  categoria: string
  /** Si una opción del diagnóstico es una valvulopatía (por código en pediátricos, por texto en adultos). */
  esValvulopatia: (opcion: OpcionLista | undefined) => boolean
}

/**
 * Otros diagnósticos además del principal, de la misma lista y sin límite. Se pueden repetir (p. ej. dos
 * valvulopatías): cada uno tiene su buscador, su "Especifique cuál" si es un "Otro…", su propio tipo de
 * valvulopatía (habilitado solo si ese diagnóstico es una valvulopatía) y su botón Quitar. Va dentro de
 * la grilla de 3 columnas del Módulo 2, alineado con el diagnóstico principal y su tipo.
 */
export function DiagnosticosAdicionales<T extends ValoresConAdicionales>({ control: controlFormulario, setValue: setValueFormulario, categoria, esValvulopatia }: Props<T>) {
  // El formulario de cada módulo tiene más campos; aquí solo se usan los de ValoresConAdicionales.
  const control = controlFormulario as unknown as Control<ValoresConAdicionales>
  const setValue = setValueFormulario as unknown as UseFormSetValue<ValoresConAdicionales>
  const { fields, append, remove } = useFieldArray({ control, name: 'adicionales' })
  const { data: opciones } = useOpciones(categoria)
  const principalId = useWatch({ control, name: 'diagnostico_id' })
  const adicionales = useWatch({ control, name: 'adicionales' }) ?? []
  const valvulopatiaEn = adicionales.map((a) => !!a?.diagnostico_id && esValvulopatia(opciones?.find((o) => o.id === a.diagnostico_id)))

  useEffect(() => {
    // Un diagnóstico que deja de ser valvulopatía pierde su tipo. Solo con las opciones ya cargadas:
    // antes, todo parecería "no valvulopatía" y se borrarían los tipos guardados.
    if (!opciones) return
    adicionales.forEach((a, i) => {
      const esValvulopatiaFila = esValvulopatia(opciones.find((o) => o.id === a?.diagnostico_id))
      if (a?.diagnostico_id && !esValvulopatiaFila && a.valvulopatia_id) setValue(`adicionales.${i}.valvulopatia_id`, '')
    })
  }, [adicionales, opciones, esValvulopatia, setValue])

  return (
    <>
      {fields.map((campo, i) => (
        <div key={campo.id} className="contents">
          <CampoOpciones
            etiqueta={`Otro diagnóstico ${i + 1}`}
            categoria={categoria}
            control={control}
            name={`adicionales.${i}.diagnostico_id`}
            nameOtro={`adicionales.${i}.especificacion`}
            buscable
            permiteCrear
            disabled={!principalId}
            placeholder={principalId ? 'Busque otro diagnóstico…' : 'Elija primero el diagnóstico principal'}
            accion={
              <button type="button" onClick={() => remove(i)} aria-label={`Quitar otro diagnóstico ${i + 1}`} className={claseAccionCampo}>
                Quitar
              </button>
            }
            className="sm:col-span-2 sm:col-start-1"
          />
          <Campo etiqueta={`Tipo de valvulopatía (otro diagnóstico ${i + 1})`}>
            <SelectOpciones
              categoria="VALVULOPATIA"
              control={control}
              name={`adicionales.${i}.valvulopatia_id`}
              disabled={!valvulopatiaEn[i]}
              placeholder={valvulopatiaEn[i] ? 'Seleccione…' : 'N/A'}
            />
          </Campo>
        </div>
      ))}
      <div className="sm:col-span-2 sm:col-start-1">
        <button
          type="button"
          onClick={() => append({ diagnostico_id: '', especificacion: '', valvulopatia_id: '' })}
          disabled={!principalId}
          title={principalId ? undefined : 'Elija primero el diagnóstico principal'}
          className={claseBotonAgregar}
        >
          <Plus size={16} aria-hidden />
          Agregar otro diagnóstico
        </button>
      </div>
    </>
  )
}
