import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo5Adulto } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import { AvisoInformativo, AvisoSoloLectura, Cargando, MensajeError } from '../../components/Estados'

interface SeguimientoAdultoDetalle {
  no_aplica: boolean
  fecha_control_cirugia: string | null
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | null
  estado_herida_id: string | null
  llamado_15_dias: 'SI' | 'NO' | null
  persona_recibe_llamada: string | null
  reingreso_30_dias: 'SI' | 'NO' | null
  fecha_reingreso: string | null
  causa_reingreso_id: string | null
  observaciones: string | null
}

interface Valores {
  fecha_control_cirugia: string
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | ''
  estado_herida_id: string
  llamado_15_dias: 'SI' | 'NO' | ''
  persona_recibe_llamada: string
  reingreso_30_dias: 'SI' | 'NO' | ''
  fecha_reingreso: string
  causa_reingreso_id: string
  observaciones: string
}

function sumarDias(iso: string, dias: number): string {
  const fecha = new Date(iso + 'T00:00:00')
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toLocaleDateString('en-CA')
}

function useSeguimientoAdulto(pacienteId: string) {
  return useQuery({
    queryKey: ['seguimiento-adulto', pacienteId],
    queryFn: async () => {
      const [seguimiento, postoperatorio] = await Promise.all([
        api.get<SeguimientoAdultoDetalle | null>(`/pacientes-adultos/${pacienteId}/seguimiento`),
        api.get<{ fecha_salida: string | null } | null>(`/pacientes-adultos/${pacienteId}/postoperatorio`),
      ])
      return { seguimiento, fechaSalida: postoperatorio?.fecha_salida ?? null }
    },
  })
}

function valoresIniciales(s: SeguimientoAdultoDetalle | null): Valores {
  return {
    fecha_control_cirugia: s?.fecha_control_cirugia ?? '',
    rehabilitacion_cardiaca: s?.rehabilitacion_cardiaca ?? '',
    estado_herida_id: s?.estado_herida_id ?? '',
    llamado_15_dias: s?.llamado_15_dias ?? '',
    persona_recibe_llamada: s?.persona_recibe_llamada ?? '',
    reingreso_30_dias: s?.reingreso_30_dias ?? '',
    fecha_reingreso: s?.fecha_reingreso ?? '',
    causa_reingreso_id: s?.causa_reingreso_id ?? '',
    observaciones: s?.observaciones ?? '',
  }
}

export function Modulo5FormAdulto({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useSeguimientoAdulto(pacienteId)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)

  const { register, handleSubmit, watch, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(null),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.seguimiento))
  }, [data, reset])

  const reingreso = watch('reingreso_30_dias')
  const llamado = watch('llamado_15_dias')

  if (isLoading) return <Cargando />

  if (!data?.seguimiento) {
    return (
      <AvisoInformativo
        icono={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        }
      >
        Guarda primero el <strong className="font-semibold text-slate-900">Módulo 4 (Postoperatorio y egreso)</strong> para habilitar el seguimiento.
      </AvisoInformativo>
    )
  }

  if (data.seguimiento.no_aplica) {
    return (
      <AvisoInformativo
        icono={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path d="M6 12h12" strokeLinecap="round" />
          </svg>
        }
      >
        Este módulo no aplica: la condición de salida del paciente fue <strong className="font-semibold text-slate-900">Muerte</strong>.
      </AvisoInformativo>
    )
  }

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setGuardadoEn(null)
    if (valores.reingreso_30_dias === 'SI' && (!valores.fecha_reingreso || !valores.causa_reingreso_id)) {
      setError('Si hubo reingreso, la fecha y la causa son obligatorias.')
      return
    }
    if (
      valores.reingreso_30_dias === 'SI' &&
      data?.fechaSalida &&
      valores.fecha_reingreso &&
      (valores.fecha_reingreso < data.fechaSalida || valores.fecha_reingreso > sumarDias(data.fechaSalida, 30))
    ) {
      setError('La fecha de reingreso debe estar dentro de los 30 días posteriores a la fecha de salida.')
      return
    }
    setError(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo5Adulto({
      fechaControl: valores.fecha_control_cirugia,
      rehabilitacionCardiaca: valores.rehabilitacion_cardiaca,
      estadoHeridaId: valores.estado_herida_id,
      llamado15Dias: valores.llamado_15_dias,
      personaRecibeLlamada: valores.persona_recibe_llamada,
      reingreso: valores.reingreso_30_dias,
      fechaReingreso: valores.fecha_reingreso,
      causaReingresoId: valores.causa_reingreso_id,
    })

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/seguimiento`, {
        fecha_control_cirugia: valores.fecha_control_cirugia || null,
        rehabilitacion_cardiaca: valores.rehabilitacion_cardiaca || null,
        estado_herida_id: valores.estado_herida_id || null,
        llamado_15_dias: valores.llamado_15_dias || null,
        persona_recibe_llamada: valores.llamado_15_dias === 'SI' ? valores.persona_recibe_llamada.trim() || null : null,
        reingreso_30_dias: valores.reingreso_30_dias || null,
        fecha_reingreso: valores.reingreso_30_dias === 'SI' ? valores.fecha_reingreso || null : null,
        causa_reingreso_id: valores.reingreso_30_dias === 'SI' ? valores.causa_reingreso_id || null : null,
        observaciones: valores.observaciones.trim() || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['seguimiento-adulto', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 5.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-5 disabled:opacity-70">
        <div className="space-y-5">
          <SeccionFormulario titulo="Control posterior">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3">
              <Campo etiqueta="Fecha de control por cirugía cardiovascular *">
                <input type="date" {...register('fecha_control_cirugia')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Terapia de rehabilitación cardíaca *">
                <select {...register('rehabilitacion_cardiaca')} className={claseInput}>
                  <option value="">Seleccione…</option>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                  <option value="NA">N/A</option>
                </select>
              </Campo>

              <Campo etiqueta="Estado de la herida quirúrgica *" className="sm:col-span-2 lg:col-span-1">
                <SelectOpciones categoria="ESTADO_HERIDA" control={control} name="estado_herida_id" />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Llamada de los 15 días">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo etiqueta="Llamado 15 días *">
                <select {...register('llamado_15_dias')} className={claseInput}>
                  <option value="">Seleccione…</option>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                </select>
              </Campo>

              <Campo etiqueta="Persona que recibe la llamada *" className="sm:col-span-2">
                <input disabled={llamado !== 'SI'} {...register('persona_recibe_llamada')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Reingreso a la institución en los primeros 30 días">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3">
              <Campo etiqueta="¿Hubo reingreso? *">
                <select {...register('reingreso_30_dias')} className={claseInput}>
                  <option value="">Seleccione…</option>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                </select>
              </Campo>
              <Campo etiqueta="Fecha de reingreso">
                <input
                  type="date"
                  disabled={reingreso !== 'SI'}
                  min={data.fechaSalida ?? undefined}
                  max={data.fechaSalida ? sumarDias(data.fechaSalida, 30) : undefined}
                  {...register('fecha_reingreso')}
                  className={claseInput}
                />
              </Campo>
              <Campo etiqueta="Causa de reingreso" className="sm:col-span-2 lg:col-span-1">
                <SelectOpciones
                  categoria="CAUSA_REINGRESO"
                  control={control} name="causa_reingreso_id"
                  disabled={reingreso !== 'SI'}
                />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Observaciones">
            <textarea
              rows={4}
              aria-label="Observaciones"
              placeholder="Notas adicionales del seguimiento (opcional)"
              {...register('observaciones')}
              className={claseInput}
            />
          </SeccionFormulario>
        </div>

        {error && <MensajeError>{error}</MensajeError>}

        {puedeEditar && <PieFormulario etiqueta="Guardar Módulo 5" guardando={guardando} guardadoEn={guardadoEn} />}
      </fieldset>
    </form>
  )
}
