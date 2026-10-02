import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseAccionCampo, claseBotonAgregar, claseInput } from '../../components/Campo'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { IconoCerrar, IconoMas } from '../../components/iconos'
import { SelectOpciones } from '../../components/SelectOpciones'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo3Adulto } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import type { PacienteAdultoDetalle } from '../../types/db'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

interface CirugiaAdultoDetalle {
  id: string
  fecha_cirugia: string | null
  implante_id: string | null
  numero_implante: string | null
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
  procedimiento_3_id: string
  implante_id: string
  numero_implante: string
  uso_cec: 'SI' | 'NO' | ''
  tiempo_cec_min: string
  tiempo_clamp_min: string
  complicacion_intraqx_id: string
  cierre_esternal_diferido: 'SI' | 'NO' | ''
  extubacion_quirofano: 'SI' | 'NO' | ''
}

function useCirugiaAdulto(pacienteId: string) {
  return useQuery({
    queryKey: ['cirugia-adulto', pacienteId],
    queryFn: async (): Promise<{ cirugia: CirugiaAdultoDetalle | null; procedimientoIds: string[]; fechaNacimiento: string | null }> => {
      const [cirugia, paciente] = await Promise.all([
        api.get<(CirugiaAdultoDetalle & { procedimiento_ids: string[] }) | null>(`/pacientes-adultos/${pacienteId}/cirugia`),
        api.get<PacienteAdultoDetalle>(`/pacientes-adultos/${pacienteId}`),
      ])
      return {
        cirugia,
        procedimientoIds: cirugia?.procedimiento_ids ?? [],
        fechaNacimiento: paciente.fecha_nacimiento,
      }
    },
  })
}

function valoresIniciales(cirugia: CirugiaAdultoDetalle | null, procedimientoIds: string[]): Valores {
  return {
    fecha_cirugia: cirugia?.fecha_cirugia ?? '',
    procedimiento_1_id: procedimientoIds[0] ?? '',
    procedimiento_2_id: procedimientoIds[1] ?? '',
    procedimiento_3_id: procedimientoIds[2] ?? '',
    implante_id: cirugia?.implante_id ?? '',
    numero_implante: cirugia?.numero_implante ?? '',
    uso_cec: cirugia?.uso_cec ?? '',
    tiempo_cec_min: cirugia?.tiempo_cec_min?.toString() ?? '',
    tiempo_clamp_min: cirugia?.tiempo_clamp_min?.toString() ?? '',
    complicacion_intraqx_id: cirugia?.complicacion_intraqx_id ?? '',
    cierre_esternal_diferido: cirugia?.cierre_esternal_diferido ?? '',
    extubacion_quirofano: cirugia?.extubacion_quirofano ?? '',
  }
}

export function Modulo3FormAdulto({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useCirugiaAdulto(pacienteId)
  const { data: opcionesImplante } = useOpciones('IMPLANTE')
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)

  const { register, handleSubmit, watch, reset, setValue, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.cirugia ?? null, data?.procedimientoIds ?? []),
  })

  // Igual que en el módulo pediátrico: el procedimiento 2 y el 3 quedan ocultos hasta que se
  // agregan. Aquí, a diferencia del pediátrico, los tres comparten la misma fecha de cirugía
  // (el módulo de adultos no tiene fecha propia por procedimiento), así que no hay validación de
  // fechas entre ellos: agregar uno solo revela su selector de procedimiento.
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
  const implanteId = watch('implante_id')
  const implanteEsNA = !implanteId || opcionesImplante?.find((o) => o.id === implanteId)?.valor === 'N/A'
  const p1 = watch('procedimiento_1_id')
  const p2 = watch('procedimiento_2_id')
  const p3 = watch('procedimiento_3_id')

  if (isLoading) return <Cargando />

  const repetido =
    (!!p1 && !!p2 && p1 === p2) || (!!p1 && !!p3 && p1 === p3) || (!!p2 && !!p3 && p2 === p3)

  function quitarProcedimiento2() {
    setValue('procedimiento_2_id', '')
    setMostrarP2(false)
    quitarProcedimiento3()
  }

  function quitarProcedimiento3() {
    setValue('procedimiento_3_id', '')
    setMostrarP3(false)
  }

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setGuardadoEn(null)
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
    if (valores.uso_cec === 'SI' && valores.tiempo_clamp_min && valores.tiempo_cec_min &&
        Number(valores.tiempo_clamp_min) > Number(valores.tiempo_cec_min)) {
      setError('El tiempo de clamp de aorta no puede ser mayor que el tiempo de CEC.')
      return
    }

    setError(null)
    setGuardando(true)

    const procedimientoIds = [valores.procedimiento_1_id, valores.procedimiento_2_id, valores.procedimiento_3_id]
      .filter(Boolean)

    const estado_modulo = calcularEstadoModulo3Adulto({
      fechaCirugia: valores.fecha_cirugia,
      procedimiento1Id: valores.procedimiento_1_id,
      usoCec: valores.uso_cec,
      tiempoCecMin: valores.tiempo_cec_min,
    })

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/cirugia`, {
        fecha_cirugia: valores.fecha_cirugia || null,
        implante_id: valores.implante_id || null,
        numero_implante: !implanteEsNA && valores.numero_implante.trim() ? valores.numero_implante.trim() : null,
        uso_cec: valores.uso_cec || null,
        tiempo_cec_min: valores.uso_cec === 'SI' && valores.tiempo_cec_min ? Number(valores.tiempo_cec_min) : null,
        tiempo_clamp_min: valores.uso_cec === 'SI' && valores.tiempo_clamp_min ? Number(valores.tiempo_clamp_min) : null,
        complicacion_intraqx_id: valores.complicacion_intraqx_id || null,
        cierre_esternal_diferido: valores.cierre_esternal_diferido || null,
        extubacion_quirofano: valores.extubacion_quirofano || null,
        procedimiento_ids: procedimientoIds,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['cirugia-adulto', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 3.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-5 disabled:opacity-70">
        <div className="space-y-5">
          <SeccionFormulario titulo="Procedimientos realizados">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Campo etiqueta="Procedimiento quirúrgico 1 *" className="sm:col-span-2">
                  <SelectOpciones categoria="PROCEDIMIENTOS_ADULTO" control={control} name="procedimiento_1_id" />
                </Campo>
                <Campo etiqueta="Fecha de cirugía *">
                  <input type="date" min={data?.fechaNacimiento ?? undefined} {...register('fecha_cirugia')} className={claseInput} />
                </Campo>
              </div>

              {mostrarP2 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo
                    etiqueta="Procedimiento quirúrgico 2"
                    className="sm:col-span-2"
                    accion={
                      <button type="button" onClick={quitarProcedimiento2} aria-label="Quitar procedimiento 2" className={claseAccionCampo}>
                        <IconoCerrar className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    }
                  >
                    <SelectOpciones categoria="PROCEDIMIENTOS_ADULTO" control={control} name="procedimiento_2_id" />
                  </Campo>
                </div>
              )}

              {mostrarP2 && mostrarP3 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo
                    etiqueta="Procedimiento quirúrgico 3"
                    className="sm:col-span-2"
                    accion={
                      <button type="button" onClick={quitarProcedimiento3} aria-label="Quitar procedimiento 3" className={claseAccionCampo}>
                        <IconoCerrar className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    }
                  >
                    <SelectOpciones categoria="PROCEDIMIENTOS_ADULTO" control={control} name="procedimiento_3_id" />
                  </Campo>
                </div>
              )}

              {puedeEditar && !(mostrarP2 && mostrarP3) && (
                <button
                  type="button"
                  disabled={mostrarP2 ? !p2 : !p1}
                  onClick={() => (mostrarP2 ? setMostrarP3(true) : setMostrarP2(true))}
                  title={(mostrarP2 ? !p2 : !p1) ? 'Elija primero el procedimiento anterior' : undefined}
                  className={claseBotonAgregar}
                >
                  <IconoMas className="h-4 w-4" strokeWidth={2.2} />
                  Agregar otro procedimiento quirúrgico
                </button>
              )}
              {repetido && <MensajeError>Los procedimientos no pueden repetirse.</MensajeError>}
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Implante">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo etiqueta="Tipo de implante">
                <SelectOpciones categoria="IMPLANTE" control={control} name="implante_id" />
              </Campo>
              <Campo etiqueta="Número de implante">
                <input disabled={implanteEsNA} placeholder={implanteEsNA ? 'N/A' : undefined} {...register('numero_implante')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Circulación extracorpórea (CEC)">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
              <Campo etiqueta="Uso de CEC">
                <select {...register('uso_cec')} className={claseInput}>
                  <option value="">Seleccione…</option>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                </select>
              </Campo>
              <Campo etiqueta="Tiempo de CEC (min)">
                <input type="number" min="0" disabled={usoCec !== 'SI'} {...register('tiempo_cec_min')} className={claseInput} />
              </Campo>
              <Campo etiqueta="Tiempo de clamp de aorta (min)">
                <input type="number" min="0" disabled={usoCec !== 'SI'} {...register('tiempo_clamp_min')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Eventos en quirófano">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo etiqueta="Complicación intraquirúrgica" className="sm:col-span-2">
                <SelectOpciones categoria="COMPLICACION_INTRAQX" control={control} name="complicacion_intraqx_id" />
              </Campo>
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
          </SeccionFormulario>
        </div>

        {error && <MensajeError>{error}</MensajeError>}

        {puedeEditar && <PieFormulario etiqueta="Guardar Módulo 3" guardando={guardando} guardadoEn={guardadoEn} />}
      </fieldset>
    </form>
  )
}
