import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput, claseBotonPrimario } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo3 } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import type { PacienteDetalle } from '../../types/db'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

interface CirugiaDetalle {
  id: string
  fecha_cirugia: string | null
  fecha_procedimiento_2: string | null
  fecha_procedimiento_3: string | null
  implante_id: string | null
  uso_cec: 'SI' | 'NO' | null
  tiempo_cec_min: number | null
  tiempo_clamp_min: number | null
  complicacion_intraqx_id: string | null
  cierre_esternal_diferido: 'SI' | 'NO' | null
  extubacion_quirofano: 'SI' | 'NO' | null
  estado_modulo: string
}

interface Valores {
  fecha_cirugia: string
  procedimiento_1_id: string
  procedimiento_2_id: string
  fecha_procedimiento_2: string
  procedimiento_3_id: string
  fecha_procedimiento_3: string
  implante_id: string
  uso_cec: 'SI' | 'NO' | ''
  tiempo_cec_min: string
  tiempo_clamp_min: string
  complicacion_intraqx_id: string
  cierre_esternal_diferido: 'SI' | 'NO' | ''
  extubacion_quirofano: 'SI' | 'NO' | ''
}

/** Día siguiente a una fecha ISO (aaaa-mm-dd): sirve de límite mínimo para que un procedimiento
 * posterior no pueda quedar el mismo día que el anterior. */
function diaSiguiente(fechaIso: string): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 1)
  return fecha.toISOString().slice(0, 10)
}

function useCirugia(pacienteId: string) {
  return useQuery({
    queryKey: ['cirugia', pacienteId],
    queryFn: async (): Promise<{ cirugia: CirugiaDetalle | null; procedimientoIds: string[]; fechaNacimiento: string | null }> => {
      const [cirugia, paciente] = await Promise.all([
        api.get<(CirugiaDetalle & { procedimiento_ids: string[] }) | null>(`/pacientes/${pacienteId}/cirugia`),
        api.get<PacienteDetalle>(`/pacientes/${pacienteId}`),
      ])
      return {
        cirugia,
        procedimientoIds: cirugia?.procedimiento_ids ?? [],
        fechaNacimiento: paciente.fecha_nacimiento,
      }
    },
  })
}

function valoresIniciales(cirugia: CirugiaDetalle | null, procedimientoIds: string[]): Valores {
  return {
    fecha_cirugia: cirugia?.fecha_cirugia ?? '',
    procedimiento_1_id: procedimientoIds[0] ?? '',
    procedimiento_2_id: procedimientoIds[1] ?? '',
    fecha_procedimiento_2: cirugia?.fecha_procedimiento_2 ?? '',
    procedimiento_3_id: procedimientoIds[2] ?? '',
    fecha_procedimiento_3: cirugia?.fecha_procedimiento_3 ?? '',
    implante_id: cirugia?.implante_id ?? '',
    uso_cec: cirugia?.uso_cec ?? '',
    tiempo_cec_min: cirugia?.tiempo_cec_min?.toString() ?? '',
    tiempo_clamp_min: cirugia?.tiempo_clamp_min?.toString() ?? '',
    complicacion_intraqx_id: cirugia?.complicacion_intraqx_id ?? '',
    cierre_esternal_diferido: cirugia?.cierre_esternal_diferido ?? '',
    extubacion_quirofano: cirugia?.extubacion_quirofano ?? '',
  }
}

export function Modulo3Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useCirugia(pacienteId)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, setValue, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.cirugia ?? null, data?.procedimientoIds ?? []),
  })

  // El procedimiento 2 y el 3 quedan ocultos hasta que se agregan: cada uno es una intervención
  // aparte, con su propia fecha, no una casilla más del mismo formulario.
  const [mostrarP2, setMostrarP2] = useState(!!data?.procedimientoIds[1])
  const [mostrarP3, setMostrarP3] = useState(!!data?.procedimientoIds[2])

  useEffect(() => {
    if (data) {
      reset(valoresIniciales(data.cirugia, data.procedimientoIds))
      setMostrarP2(!!data.procedimientoIds[1])
      setMostrarP3(!!data.procedimientoIds[2])
    }
  }, [data, reset])

  const usoCec = watch('uso_cec')
  const p1 = watch('procedimiento_1_id')
  const p2 = watch('procedimiento_2_id')
  const p3 = watch('procedimiento_3_id')
  const fechaCirugia = watch('fecha_cirugia')
  const fechaP2 = watch('fecha_procedimiento_2')
  const fechaP3 = watch('fecha_procedimiento_3')

  if (isLoading) return <Cargando />

  const repetido =
    (!!p1 && !!p2 && p1 === p2) || (!!p1 && !!p3 && p1 === p3) || (!!p2 && !!p3 && p2 === p3)

  const fecha2Invalida = mostrarP2 && !!fechaCirugia && !!fechaP2 && fechaP2 <= fechaCirugia
  const fecha3Invalida = mostrarP3 && !!fechaP2 && !!fechaP3 && fechaP3 <= fechaP2

  function quitarProcedimiento2() {
    setValue('procedimiento_2_id', '')
    setValue('fecha_procedimiento_2', '')
    setMostrarP2(false)
    quitarProcedimiento3()
  }

  function quitarProcedimiento3() {
    setValue('procedimiento_3_id', '')
    setValue('fecha_procedimiento_3', '')
    setMostrarP3(false)
  }

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    if (data?.fechaNacimiento && valores.fecha_cirugia && valores.fecha_cirugia < data.fechaNacimiento) {
      setError('La fecha de cirugía no puede ser anterior a la fecha de nacimiento.')
      return
    }
    if ((!!valores.procedimiento_1_id && !!valores.procedimiento_2_id && valores.procedimiento_1_id === valores.procedimiento_2_id) ||
        (!!valores.procedimiento_1_id && !!valores.procedimiento_3_id && valores.procedimiento_1_id === valores.procedimiento_3_id) ||
        (!!valores.procedimiento_2_id && !!valores.procedimiento_3_id && valores.procedimiento_2_id === valores.procedimiento_3_id)) {
      setError('Los procedimientos 1, 2 y 3 no pueden repetirse.')
      return
    }
    // Cada procedimiento agregado es una intervención propia: necesita su fecha y no puede coincidir
    // (ni ser anterior) con la del procedimiento previo.
    if (valores.procedimiento_2_id) {
      if (!valores.fecha_procedimiento_2) {
        setError('La fecha del procedimiento quirúrgico 2 es obligatoria.')
        return
      }
      if (!valores.fecha_cirugia || valores.fecha_procedimiento_2 <= valores.fecha_cirugia) {
        setError('La fecha del procedimiento quirúrgico 2 debe ser posterior a la del procedimiento 1: no pueden hacerse el mismo día.')
        return
      }
    }
    if (valores.procedimiento_3_id) {
      if (!valores.fecha_procedimiento_3) {
        setError('La fecha del procedimiento quirúrgico 3 es obligatoria.')
        return
      }
      if (!valores.fecha_procedimiento_2 || valores.fecha_procedimiento_3 <= valores.fecha_procedimiento_2) {
        setError('La fecha del procedimiento quirúrgico 3 debe ser posterior a la del procedimiento 2: no pueden hacerse el mismo día.')
        return
      }
    }
    if (valores.uso_cec === 'SI' && valores.tiempo_clamp_min && valores.tiempo_cec_min &&
        Number(valores.tiempo_clamp_min) > Number(valores.tiempo_cec_min)) {
      setError('El tiempo de clamp de aorta no puede ser mayor que el tiempo de CEC.')
      return
    }

    setError(null)
    setGuardando(true)

    const procedimientoIds = [valores.procedimiento_1_id, valores.procedimiento_2_id, valores.procedimiento_3_id]
      .filter(Boolean)

    const estado_modulo = calcularEstadoModulo3({
      fechaCirugia: valores.fecha_cirugia,
      procedimiento1Id: valores.procedimiento_1_id,
      usoCec: valores.uso_cec,
      tiempoCecMin: valores.tiempo_cec_min,
    })

    try {
      await api.put(`/pacientes/${pacienteId}/cirugia`, {
        fecha_cirugia: valores.fecha_cirugia || null,
        fecha_procedimiento_2: valores.procedimiento_2_id ? valores.fecha_procedimiento_2 || null : null,
        fecha_procedimiento_3: valores.procedimiento_3_id ? valores.fecha_procedimiento_3 || null : null,
        implante_id: valores.implante_id || null,
        uso_cec: valores.uso_cec || null,
        tiempo_cec_min: valores.uso_cec === 'SI' && valores.tiempo_cec_min ? Number(valores.tiempo_cec_min) : null,
        tiempo_clamp_min: valores.uso_cec === 'SI' && valores.tiempo_clamp_min ? Number(valores.tiempo_clamp_min) : null,
        complicacion_intraqx_id: valores.complicacion_intraqx_id || null,
        cierre_esternal_diferido: valores.cierre_esternal_diferido || null,
        extubacion_quirofano: valores.extubacion_quirofano || null,
        procedimiento_ids: procedimientoIds,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['cirugia', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 3.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de cirugía *">
          <input type="date" min={data?.fechaNacimiento ?? undefined} {...register('fecha_cirugia')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Tipo de implante">
          <SelectOpciones categoria="IMPLANTE" control={control} name="implante_id" />
        </Campo>
      </div>

      <Campo etiqueta="Procedimiento quirúrgico 1 *">
        <SelectOpciones categoria="PROCEDIMIENTOS" control={control} name="procedimiento_1_id" />
      </Campo>

      {/* Cada procedimiento adicional es una intervención aparte: se habilita al agregarla y exige su
          propia fecha, distinta de la del procedimiento anterior. */}
      {!mostrarP2 ? (
        <button
          type="button"
          disabled={!p1}
          onClick={() => setMostrarP2(true)}
          className="rounded-md border border-sky-600 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        >
          + Agregar otro procedimiento quirúrgico
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/40 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Procedimiento quirúrgico 2 *">
              <SelectOpciones categoria="PROCEDIMIENTOS" control={control} name="procedimiento_2_id" />
            </Campo>
            <Campo etiqueta="Fecha del procedimiento 2 *">
              <input
                type="date"
                min={fechaCirugia ? diaSiguiente(fechaCirugia) : (data?.fechaNacimiento ?? undefined)}
                {...register('fecha_procedimiento_2')}
                className={claseInput}
              />
            </Campo>
          </div>
          {fecha2Invalida && (
            <MensajeError>No puede ser el mismo día ni anterior a la fecha del procedimiento 1.</MensajeError>
          )}
          <button type="button" onClick={quitarProcedimiento2} className="text-xs font-medium text-red-600 hover:underline">
            Quitar procedimiento 2
          </button>

          {!mostrarP3 ? (
            <button
              type="button"
              disabled={!p2}
              onClick={() => setMostrarP3(true)}
              className="block rounded-md border border-sky-600 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              + Agregar otro procedimiento quirúrgico
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo etiqueta="Procedimiento quirúrgico 3 *">
                  <SelectOpciones categoria="PROCEDIMIENTOS" control={control} name="procedimiento_3_id" />
                </Campo>
                <Campo etiqueta="Fecha del procedimiento 3 *">
                  <input
                    type="date"
                    min={fechaP2 ? diaSiguiente(fechaP2) : undefined}
                    {...register('fecha_procedimiento_3')}
                    className={claseInput}
                  />
                </Campo>
              </div>
              {fecha3Invalida && (
                <MensajeError>No puede ser el mismo día ni anterior a la fecha del procedimiento 2.</MensajeError>
              )}
              <button type="button" onClick={quitarProcedimiento3} className="text-xs font-medium text-red-600 hover:underline">
                Quitar procedimiento 3
              </button>
            </div>
          )}
        </div>
      )}
      {repetido && <MensajeError>Los procedimientos no pueden repetirse.</MensajeError>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Uso de circulación extracorpórea (CEC)">
          <select {...register('uso_cec')} className={claseInput}>
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
        </Campo>
        <Campo etiqueta="Tiempo de CEC (min)">
          <input
            type="number"
            min="0"
            disabled={usoCec !== 'SI'}
            {...register('tiempo_cec_min')}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Tiempo de clamp de aorta (min)">
          <input
            type="number"
            min="0"
            disabled={usoCec !== 'SI'}
            {...register('tiempo_clamp_min')}
            className={claseInput}
          />
        </Campo>
      </div>

      <Campo etiqueta="Complicación intraquirúrgica">
        <SelectOpciones categoria="COMPLICACION_INTRAQX" control={control} name="complicacion_intraqx_id" />
      </Campo>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cierre esternal diferido">
          <select {...register('cierre_esternal_diferido')} className={claseInput}>
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
        </Campo>
        <Campo etiqueta="Extubación en quirófano">
          <select {...register('extubacion_quirofano')} className={claseInput}>
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
        </Campo>
      </div>

      {error && <MensajeError>{error}</MensajeError>}

      <button
        type="submit"
        disabled={guardando}
        className={claseBotonPrimario}
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 3'}
      </button>
      </fieldset>
    </form>
  )
}
