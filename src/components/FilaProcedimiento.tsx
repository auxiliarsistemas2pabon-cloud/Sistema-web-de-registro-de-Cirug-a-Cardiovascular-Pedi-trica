import type { ReactNode } from 'react'
import { useController, type Control, type Path } from 'react-hook-form'
import type { ProcedimientoFormulario } from '../lib/procedimientos'
import { Campo, claseInput } from './Campo'
import { CampoOpciones } from './CampoOpciones'
import { useOpciones } from '../hooks/useOpciones'

type ConProcedimientos = { procedimientos: ProcedimientoFormulario[] }

interface Props<T extends ConProcedimientos> {
  control: Control<T>
  indice: 0 | 1 | 2
  /** PROCEDIMIENTOS (pediátricos) o PROCEDIMIENTOS_ADULTO. */
  categoria: string
  etiqueta: string
  /** Acción junto a la etiqueta (p. ej. "Quitar" en los procedimientos 2 y 3). */
  accion?: ReactNode
  /** La fecha que va al lado del procedimiento 1: la de cirugía (los demás comparten esa fecha). */
  fecha?: ReactNode
  /** Avisos de esta fila, al final. */
  children?: ReactNode
}

/**
 * Un procedimiento del Módulo 3 con todo lo suyo (pedido del 23-oct): cuál fue (y cuál, si es un
 * "Otro…"), si llevó implante — Sí, No o No aplica para los procedimientos que no lo requieren — y,
 * solo si lo llevó, de qué tipo. Con el tipo elegido aparece su número, o "No aplica" (pedido del 30-oct).
 */
export function FilaProcedimiento<T extends ConProcedimientos>({ control, indice, categoria, etiqueta, accion, fecha, children }: Props<T>) {
  // react-hook-form no puede comprobar la ruta de un índice genérico: se arma aquí, en un solo lugar.
  const ruta = (campo: keyof ProcedimientoFormulario) => `procedimientos.${indice}.${campo}` as Path<T>
  const { data: opcionesImplante } = useOpciones('IMPLANTE')
  const implante = useController({ control, name: ruta('implante') })
  const tipo = useController({ control, name: ruta('tipo_implante_id') })
  const numero = useController({ control, name: ruta('numero_implante') })
  const numeroNoAplica = useController({ control, name: ruta('numero_implante_no_aplica') })
  const llevaImplante = implante.field.value === 'SI'
  const conTipo = llevaImplante && !!tipo.field.value
  const sinNumero = numeroNoAplica.field.value === true
  // Sin tipo no hay número: se vacía para que no quede uno escrito y oculto.
  const limpiarNumero = () => {
    numero.field.onChange('')
    numeroNoAplica.field.onChange(false)
  }

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
              if (e.target.value !== 'SI') {
                tipo.field.onChange('')
                limpiarNumero()
              }
            }}
            className={claseInput}
          >
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
            <option value="NA">No aplica</option>
          </select>
        </Campo>
        <Campo etiqueta="Tipo de implante">
          <select
            name={tipo.field.name}
            ref={tipo.field.ref}
            value={(tipo.field.value as string) ?? ''}
            onBlur={tipo.field.onBlur}
            onChange={(e) => {
              tipo.field.onChange(e.target.value)
              if (!e.target.value) limpiarNumero()
            }}
            disabled={!llevaImplante}
            className={claseInput}
          >
            <option value="">{llevaImplante ? 'Seleccione…' : 'No aplica'}</option>
            {opcionesImplante?.map((o) => (
              <option key={o.id} value={o.id}>{o.valor}</option>
            ))}
          </select>
        </Campo>
        {conTipo && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <Campo etiqueta="Número de implante">
              <input
                name={numero.field.name}
                ref={numero.field.ref}
                value={sinNumero ? '' : ((numero.field.value as string) ?? '')}
                onChange={(e) => numero.field.onChange(e.target.value)}
                onBlur={numero.field.onBlur}
                disabled={sinNumero}
                maxLength={100}
                placeholder={sinNumero ? 'No aplica' : 'Lote o serie'}
                className={claseInput}
              />
            </Campo>
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={numeroNoAplica.field.name}
                checked={sinNumero}
                onChange={(e) => {
                  numeroNoAplica.field.onChange(e.target.checked)
                  if (e.target.checked) numero.field.onChange('')
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              No aplica
            </label>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
