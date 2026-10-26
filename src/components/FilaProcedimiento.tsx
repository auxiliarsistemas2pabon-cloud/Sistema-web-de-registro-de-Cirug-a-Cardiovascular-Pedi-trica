import type { ReactNode } from 'react'
import { useController, type Control, type Path } from 'react-hook-form'
import type { ProcedimientoFormulario } from '../lib/procedimientos'
import { Campo, claseInput } from './Campo'
import { CampoOpciones } from './CampoOpciones'
import { SelectOpciones } from './SelectOpciones'

type ConProcedimientos = { procedimientos: ProcedimientoFormulario[] }

interface Props<T extends ConProcedimientos> {
  control: Control<T>
  indice: 0 | 1 | 2
  /** PROCEDIMIENTOS (pediátricos) o PROCEDIMIENTOS_ADULTO. */
  categoria: string
  etiqueta: string
  /** Acción junto a la etiqueta (p. ej. "Quitar" en los procedimientos 2 y 3). */
  accion?: ReactNode
  /** La fecha que va al lado del procedimiento: la de cirugía, o la propia del 2 y el 3 en pediátricos. */
  fecha?: ReactNode
  /** Avisos de esta fila, al final (p. ej. una fecha que no puede ser). */
  children?: ReactNode
}

/**
 * Un procedimiento del Módulo 3 con todo lo suyo (pedido del 23-oct): cuál fue (y cuál, si es un
 * "Otro…"), si llevó implante — Sí, No o No aplica para los procedimientos que no lo requieren — y,
 * solo si lo llevó, de qué tipo.
 */
export function FilaProcedimiento<T extends ConProcedimientos>({ control, indice, categoria, etiqueta, accion, fecha, children }: Props<T>) {
  // react-hook-form no puede comprobar la ruta de un índice genérico: se arma aquí, en un solo lugar.
  const ruta = (campo: keyof ProcedimientoFormulario) => `procedimientos.${indice}.${campo}` as Path<T>
  const implante = useController({ control, name: ruta('implante') })
  const tipo = useController({ control, name: ruta('tipo_implante_id') })
  const llevaImplante = implante.field.value === 'SI'

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CampoOpciones
          etiqueta={etiqueta}
          categoria={categoria}
          control={control}
          name={ruta('procedimiento_id')}
          nameOtro={ruta('especificacion')}
          accion={accion}
          className="sm:col-span-2"
        />
        {fecha}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="¿Lleva implante?">
          <select
            name={implante.field.name}
            ref={implante.field.ref}
            value={(implante.field.value as string) ?? ''}
            onBlur={implante.field.onBlur}
            onChange={(e) => {
              implante.field.onChange(e.target.value)
              // Sin implante no hay tipo: se vacía para que no quede uno elegido y oculto.
              if (e.target.value !== 'SI') tipo.field.onChange('')
            }}
            className={claseInput}
          >
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
            <option value="NA">No aplica</option>
          </select>
        </Campo>
        <Campo etiqueta="Tipo de implante" className="sm:col-span-2">
          <SelectOpciones
            categoria="IMPLANTE"
            control={control}
            name={ruta('tipo_implante_id')}
            disabled={!llevaImplante}
            placeholder={llevaImplante ? 'Seleccione…' : 'No aplica'}
          />
        </Campo>
      </div>
      {children}
    </div>
  )
}
