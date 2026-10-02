import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo4Adulto } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

interface PostoperatorioAdultoDetalle {
  id: string
  unidad_pop_id: string | null
  horas_ventilacion_mecanica: number | null
  complicacion_pop_id: string | null
  fecha_traslado_intermedio: string | null
  dias_estancia_uci: number | null
  fecha_salida: string | null
  dias_hospitalizacion_total: number | null
  condicion_salida_id: string | null
}

interface Valores {
  unidad_pop_id: string
  horas_ventilacion_mecanica: string
  complicacion_pop_id: string
  fecha_traslado_intermedio: string
  dias_estancia_uci: string
  fecha_salida: string
  dias_hospitalizacion_total: string
  condicion_salida_id: string
}

function usePostoperatorioAdulto(pacienteId: string) {
  return useQuery({
    queryKey: ['postoperatorio-adulto', pacienteId],
    queryFn: async () => {
      const [postoperatorio, cirugia] = await Promise.all([
        api.get<PostoperatorioAdultoDetalle | null>(`/pacientes-adultos/${pacienteId}/postoperatorio`),
        api.get<{ extubacion_quirofano: 'SI' | 'NO' | null; fecha_cirugia: string | null } | null>(`/pacientes-adultos/${pacienteId}/cirugia`),
      ])
      return {
        postoperatorio,
        extubacionQuirofano: cirugia?.extubacion_quirofano ?? null,
        fechaCirugia: cirugia?.fecha_cirugia ?? null,
      }
    },
  })
}

function valoresIniciales(po: PostoperatorioAdultoDetalle | null, sugerirCero: boolean): Valores {
  return {
    unidad_pop_id: po?.unidad_pop_id ?? '',
    horas_ventilacion_mecanica: po?.horas_ventilacion_mecanica?.toString() ?? (sugerirCero ? '0' : ''),
    complicacion_pop_id: po?.complicacion_pop_id ?? '',
    fecha_traslado_intermedio: po?.fecha_traslado_intermedio ?? '',
    dias_estancia_uci: po?.dias_estancia_uci?.toString() ?? '',
    fecha_salida: po?.fecha_salida ?? '',
    dias_hospitalizacion_total: po?.dias_hospitalizacion_total?.toString() ?? '',
    condicion_salida_id: po?.condicion_salida_id ?? '',
  }
}

export function Modulo4FormAdulto({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = usePostoperatorioAdulto(pacienteId)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)

  const { register, handleSubmit, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(null, false),
  })

  useEffect(() => {
    if (data) {
      reset(valoresIniciales(data.postoperatorio, !data.postoperatorio && data.extubacionQuirofano === 'SI'))
    }
  }, [data, reset])

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setGuardadoEn(null)
    if (data?.fechaCirugia && valores.fecha_traslado_intermedio && valores.fecha_traslado_intermedio < data.fechaCirugia) {
      setError('La fecha de traslado a intermedio no puede ser anterior a la fecha de cirugía.')
      return
    }
    if (data?.fechaCirugia && valores.fecha_salida && valores.fecha_salida < data.fechaCirugia) {
      setError('La fecha de salida no puede ser anterior a la fecha de cirugía.')
      return
    }
    if (
      valores.fecha_traslado_intermedio &&
      valores.fecha_salida &&
      valores.fecha_salida < valores.fecha_traslado_intermedio
    ) {
      setError('La fecha de salida no puede ser anterior a la fecha de traslado a intermedio.')
      return
    }
    setError(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo4Adulto({
      unidadPopId: valores.unidad_pop_id,
      horasVentilacion: valores.horas_ventilacion_mecanica,
      complicacionPopId: valores.complicacion_pop_id,
      diasEstanciaUci: valores.dias_estancia_uci,
      diasHospitalizacionTotal: valores.dias_hospitalizacion_total,
      condicionSalidaId: valores.condicion_salida_id,
    })

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/postoperatorio`, {
        unidad_pop_id: valores.unidad_pop_id || null,
        horas_ventilacion_mecanica:
          valores.horas_ventilacion_mecanica !== '' ? Number(valores.horas_ventilacion_mecanica) : null,
        complicacion_pop_id: valores.complicacion_pop_id || null,
        fecha_traslado_intermedio: valores.fecha_traslado_intermedio || null,
        dias_estancia_uci: valores.dias_estancia_uci !== '' ? Number(valores.dias_estancia_uci) : null,
        fecha_salida: valores.fecha_salida || null,
        dias_hospitalizacion_total: valores.dias_hospitalizacion_total !== '' ? Number(valores.dias_hospitalizacion_total) : null,
        condicion_salida_id: valores.condicion_salida_id || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['postoperatorio-adulto', pacienteId] })
      // Guardar el Módulo 4 puede crear o bloquear el Módulo 5 (condición de salida = Muerte).
      queryClient.invalidateQueries({ queryKey: ['seguimiento-adulto', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 4.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-5 disabled:opacity-70">
        <div className="space-y-5">
          <SeccionFormulario titulo="Cuidado postoperatorio">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3">
              <Campo etiqueta="Unidad postoperatoria *">
                <SelectOpciones categoria="UNIDAD_POP" control={control} name="unidad_pop_id" />
              </Campo>

              <Campo etiqueta="Horas de ventilación mecánica *">
                <input type="number" min="0" step="1" {...register('horas_ventilacion_mecanica')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Días de estancia en UCI *">
                <input type="number" min="0" step="1" {...register('dias_estancia_uci')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Complicación postoperatoria *" className="lg:col-span-2">
                <SelectOpciones categoria="COMPLICACION_POP" control={control} name="complicacion_pop_id" />
              </Campo>

              <Campo etiqueta="Fecha de traslado a intermedio">
                <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_traslado_intermedio')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Egreso">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3">
              <Campo etiqueta="Fecha de salida">
                <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_salida')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Días totales de hospitalización posterior a la cirugía *">
                <input type="number" min="0" step="1" {...register('dias_hospitalizacion_total')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Condición en que sale el paciente *" className="sm:col-span-2 lg:col-span-1">
                <SelectOpciones categoria="CONDICION_SALIDA" control={control} name="condicion_salida_id" />
              </Campo>
            </div>
          </SeccionFormulario>
        </div>

        {error && <MensajeError>{error}</MensajeError>}

        {puedeEditar && <PieFormulario etiqueta="Guardar Módulo 4" guardando={guardando} guardadoEn={guardadoEn} />}
      </fieldset>
    </form>
  )
}
