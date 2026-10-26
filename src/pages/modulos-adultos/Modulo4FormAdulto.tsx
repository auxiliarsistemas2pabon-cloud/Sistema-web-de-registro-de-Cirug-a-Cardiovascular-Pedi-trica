import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, CampoCalculado, claseInput } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { calcularEstadoModulo4Adulto } from '../../lib/completitud'
import { diasEstancia, formatearFecha } from '../../lib/fechas'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { api, mensajeDe } from '../../lib/api'
import { Cargando, MensajeError } from '../../components/Estados'

interface PostoperatorioAdultoDetalle {
  id: string
  unidad_pop_id: string | null
  horas_ventilacion_mecanica: number | null
  complicacion_pop_ids: string[]
  complicacion_pop_especificaciones: Record<string, string>
  fecha_traslado_intermedio: string | null
  fecha_salida: string | null
  condicion_salida_id: string | null
  condicion_salida_otro: string | null
}

interface Valores {
  unidad_pop_id: string
  horas_ventilacion_mecanica: string
  complicacion_pop_ids: string[]
  complicacion_pop_especificaciones: Record<string, string>
  fecha_traslado_intermedio: string
  fecha_salida: string
  condicion_salida_id: string
  condicion_salida_otro: string
}

function usePostoperatorioAdulto(pacienteId: string, episodioId: string) {
  return useQuery({
    queryKey: ['postoperatorio-adulto', episodioId],
    queryFn: async () => {
      const [postoperatorio, cirugia] = await Promise.all([
        api.get<PostoperatorioAdultoDetalle | null>(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/postoperatorio`),
        api.get<{ extubacion_quirofano: 'SI' | 'NO' | null; fecha_cirugia: string | null } | null>(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/cirugia`),
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
    complicacion_pop_ids: po?.complicacion_pop_ids ?? [],
    complicacion_pop_especificaciones: po?.complicacion_pop_especificaciones ?? {},
    fecha_traslado_intermedio: po?.fecha_traslado_intermedio ?? '',
    fecha_salida: po?.fecha_salida ?? '',
    condicion_salida_id: po?.condicion_salida_id ?? '',
    condicion_salida_otro: po?.condicion_salida_otro ?? '',
  }
}

const textoDias = (dias: number | null) => (dias === null ? null : `${dias} ${dias === 1 ? 'día' : 'días'}`)

export function Modulo4FormAdulto({ pacienteId, episodioId }: { pacienteId: string; episodioId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const esOtro = useEsOpcionOtro()
  const { data, isLoading } = usePostoperatorioAdulto(pacienteId, episodioId)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [camposFaltantes, setCamposFaltantes] = useState<string[]>([])

  const { register, handleSubmit, watch, setValue, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(null, false),
  })

  useEffect(() => {
    if (data) {
      reset(valoresIniciales(data.postoperatorio, !data.postoperatorio && data.extubacionQuirofano === 'SI'))
    }
  }, [data, reset])

  const complicacionPopIds = watch('complicacion_pop_ids')
  const complicacionPopEspecificaciones = watch('complicacion_pop_especificaciones')
  // Antes se escribían a mano; desde el pedido del 23-oct se calculan de las fechas mientras se
  // escriben, con la misma cuenta del servidor.
  const dias = diasEstancia({ fechaCirugia: data?.fechaCirugia ?? null, fechaTraslado: watch('fecha_traslado_intermedio'), fechaSalida: watch('fecha_salida') })
  const sinCirugia = data?.fechaCirugia ? undefined : 'Registre la fecha de cirugía en el Módulo 3'

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setGuardadoEn(null)
    setCamposFaltantes([])
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

    const condicionEsOtro = esOtro('CONDICION_SALIDA', valores.condicion_salida_id)
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo4Adulto({
      sinEspecificar: sinEspecificar([
        ...valores.complicacion_pop_ids.map((id) => ({
          etiqueta: 'Complicación postoperatoria', esOtro: esOtro('COMPLICACION_POP', id), texto: valores.complicacion_pop_especificaciones[id],
        })),
        { etiqueta: 'Condición en que sale el paciente', esOtro: condicionEsOtro, texto: valores.condicion_salida_otro },
      ]),
      unidadPopId: valores.unidad_pop_id,
      horasVentilacion: valores.horas_ventilacion_mecanica,
      complicacionPopIds: valores.complicacion_pop_ids,
      fechaSalida: valores.fecha_salida,
      condicionSalidaId: valores.condicion_salida_id,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/postoperatorio`, {
        unidad_pop_id: valores.unidad_pop_id || null,
        horas_ventilacion_mecanica:
          valores.horas_ventilacion_mecanica !== '' ? Number(valores.horas_ventilacion_mecanica) : null,
        complicacion_pop_ids: valores.complicacion_pop_ids,
        complicacion_pop_especificaciones: especificacionesElegidas(valores.complicacion_pop_ids, valores.complicacion_pop_especificaciones),
        fecha_traslado_intermedio: valores.fecha_traslado_intermedio || null,
        fecha_salida: valores.fecha_salida || null,
        condicion_salida_id: valores.condicion_salida_id || null,
        condicion_salida_otro: condicionEsOtro ? valores.condicion_salida_otro.trim() || null : null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['postoperatorio-adulto', episodioId] })
      // Guardar el Módulo 4 puede crear o bloquear el Módulo 5 (condición de salida = Muerte).
      queryClient.invalidateQueries({ queryKey: ['seguimiento-adulto', episodioId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['episodios-adulto', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 4.'))
    } finally {
      setGuardando(false)
    }
  }

  const desdeCirugia = data?.fechaCirugia ? `Desde la fecha de cirugía (${formatearFecha(data.fechaCirugia)})` : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <fieldset className="space-y-5">
        <div className="space-y-5">
          <SeccionFormulario titulo="Cuidado postoperatorio">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3">
              <Campo etiqueta="Unidad postoperatoria *">
                <SelectOpciones categoria="UNIDAD_POP" control={control} name="unidad_pop_id" />
              </Campo>

              <Campo etiqueta="Horas de ventilación mecánica *">
                <input type="number" min="0" step="1" {...register('horas_ventilacion_mecanica')} className={claseInput} />
              </Campo>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-2 block text-sm font-medium text-slate-700">Complicación postoperatoria *</label>
                <SeleccionMultiple
                  categoria="COMPLICACION_POP"
                  codigoExcluyente="NO"
                  value={complicacionPopIds}
                  onChange={(v) => setValue('complicacion_pop_ids', v)}
                  especificaciones={complicacionPopEspecificaciones}
                  onEspecificar={(id, texto) => setValue('complicacion_pop_especificaciones', { ...complicacionPopEspecificaciones, [id]: texto })}
                />
              </div>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Estancia en UCI">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Fecha de traslado a intermedio">
                <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_traslado_intermedio')} className={claseInput} />
              </Campo>
              <CampoCalculado
                etiqueta="Días de estancia en UCI"
                valor={textoDias(dias.uci)}
                pendiente={sinCirugia ?? 'Se calcula con las fechas'}
                explicacion={desdeCirugia ? `${desdeCirugia} hasta el traslado a cuidados intermedios (o la salida, si no hubo traslado).` : undefined}
                className="lg:col-span-2"
              />
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Egreso">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Fecha de salida *">
                <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_salida')} className={claseInput} />
              </Campo>
              <CampoCalculado
                etiqueta="Días totales de hospitalización"
                valor={textoDias(dias.hospitalizacion)}
                pendiente={sinCirugia ?? 'Se calcula con la fecha de salida'}
                explicacion={desdeCirugia ? `${desdeCirugia} hasta el egreso de la institución.` : undefined}
              />
              <CampoOpciones
                etiqueta="Condición en que sale el paciente *"
                categoria="CONDICION_SALIDA"
                control={control}
                name="condicion_salida_id"
                nameOtro="condicion_salida_otro"
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
          </SeccionFormulario>
        </div>

        {error && <MensajeError>{error}</MensajeError>}

        <PieFormulario etiqueta="Guardar Módulo 4" guardando={guardando} guardadoEn={guardadoEn} faltantes={camposFaltantes} />
      </fieldset>
    </form>
  )
}
