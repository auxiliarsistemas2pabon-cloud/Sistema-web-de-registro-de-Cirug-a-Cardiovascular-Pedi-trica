import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput, claseBotonPrimario } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo5 } from '../../lib/completitud'
import { hoyIso } from '../../lib/fechas'
import { api, mensajeDe } from '../../lib/api'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

interface SeguimientoDetalle {
  no_aplica: boolean
  fecha_control_cirugia: string | null
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | null
  estado_herida_id: string | null
  fecha_llamada_15_dias: string | null
  persona_recibe_llamada: string | null
  reingreso_30_dias: 'SI' | 'NO' | 'NA' | null
  fecha_reingreso: string | null
  causa_reingreso_id: string | null
  observaciones: string | null
}

interface Valores {
  fecha_control_cirugia: string
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | ''
  estado_herida_id: string
  fecha_llamada_15_dias: string
  persona_recibe_llamada: string
  reingreso_30_dias: 'SI' | 'NO' | 'NA' | ''
  fecha_reingreso: string
  causa_reingreso_id: string
  observaciones: string
}

function sumarDias(iso: string, dias: number): string {
  const fecha = new Date(iso + 'T00:00:00')
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toLocaleDateString('en-CA')
}

function useSeguimiento(pacienteId: string) {
  return useQuery({
    queryKey: ['seguimiento', pacienteId],
    queryFn: async () => {
      const [seguimiento, postoperatorio] = await Promise.all([
        api.get<SeguimientoDetalle | null>(`/pacientes/${pacienteId}/seguimiento`),
        api.get<{ fecha_salida: string | null } | null>(`/pacientes/${pacienteId}/postoperatorio`),
      ])
      return { seguimiento, fechaSalida: postoperatorio?.fecha_salida ?? null }
    },
  })
}

function valoresIniciales(s: SeguimientoDetalle | null, fechaSalida: string | null): Valores {
  return {
    fecha_control_cirugia: s?.fecha_control_cirugia ?? '',
    rehabilitacion_cardiaca: s?.rehabilitacion_cardiaca ?? '',
    estado_herida_id: s?.estado_herida_id ?? '',
    fecha_llamada_15_dias: s?.fecha_llamada_15_dias ?? (fechaSalida ? sumarDias(fechaSalida, 15) : ''),
    persona_recibe_llamada: s?.persona_recibe_llamada ?? '',
    reingreso_30_dias: s?.reingreso_30_dias ?? '',
    fecha_reingreso: s?.fecha_reingreso ?? '',
    causa_reingreso_id: s?.causa_reingreso_id ?? '',
    observaciones: s?.observaciones ?? '',
  }
}

export function Modulo5Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useSeguimiento(pacienteId)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(null, null),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.seguimiento, data.fechaSalida))
  }, [data, reset])

  const reingreso = watch('reingreso_30_dias')
  const fechaLlamada = watch('fecha_llamada_15_dias')
  const llamadaHecha = !!data?.seguimiento?.persona_recibe_llamada

  if (isLoading) return <Cargando />

  if (!data?.seguimiento) {
    return (
      <p className="text-sm text-slate-500">
        Guarda primero el Módulo 4 (Postoperatorio, UCI y egreso) para habilitar el seguimiento.
      </p>
    )
  }

  if (data.seguimiento.no_aplica) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-200 text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path d="M6 12h12" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          Este módulo no aplica: la condición de salida del paciente fue <strong className="font-semibold text-slate-800">Muerte</strong>.
        </span>
      </div>
    )
  }

  const llamadaVencida = !llamadaHecha && !!fechaLlamada && fechaLlamada < hoyIso()
  const llamadaPendiente = !llamadaHecha && !!fechaLlamada && fechaLlamada >= hoyIso()

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
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

    const estado_modulo = calcularEstadoModulo5({
      fechaControl: valores.fecha_control_cirugia,
      rehabilitacionCardiaca: valores.rehabilitacion_cardiaca,
      estadoHeridaId: valores.estado_herida_id,
      fechaLlamada15Dias: valores.fecha_llamada_15_dias,
      personaRecibeLlamada: valores.persona_recibe_llamada,
      reingreso: valores.reingreso_30_dias,
      fechaReingreso: valores.fecha_reingreso,
      causaReingresoId: valores.causa_reingreso_id,
    })

    try {
      await api.put(`/pacientes/${pacienteId}/seguimiento`, {
        fecha_control_cirugia: valores.fecha_control_cirugia || null,
        rehabilitacion_cardiaca: valores.rehabilitacion_cardiaca || null,
        estado_herida_id: valores.estado_herida_id || null,
        fecha_llamada_15_dias: valores.fecha_llamada_15_dias || null,
        persona_recibe_llamada: valores.persona_recibe_llamada.trim() || null,
        reingreso_30_dias: valores.reingreso_30_dias || null,
        fecha_reingreso: valores.reingreso_30_dias === 'SI' ? valores.fecha_reingreso || null : null,
        causa_reingreso_id: valores.reingreso_30_dias === 'SI' ? valores.causa_reingreso_id || null : null,
        observaciones: valores.observaciones.trim() || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['seguimiento', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 5.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <Campo etiqueta="Estado de la herida quirúrgica *">
          <SelectOpciones categoria="ESTADO_HERIDA" control={control} name="estado_herida_id" />
        </Campo>

        <Campo etiqueta="Fecha de llamada de los 15 días *">
          <input type="date" {...register('fecha_llamada_15_dias')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Persona que recibe la llamada *" className="sm:col-span-2">
          <input {...register('persona_recibe_llamada')} className={claseInput} />
        </Campo>
      </div>

      {llamadaVencida && (
        <MensajeError>La llamada de los 15 días está vencida.</MensajeError>
      )}
      {llamadaPendiente && (
        <p className="text-sm text-amber-600">La llamada de los 15 días está pendiente.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Reingreso en los primeros 30 días *">
          <select {...register('reingreso_30_dias')} className={claseInput}>
            <option value="">Seleccione…</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
            <option value="NA">N/A</option>
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
        <Campo etiqueta="Causa de reingreso">
          <SelectOpciones
            categoria="CAUSA_REINGRESO"
            control={control} name="causa_reingreso_id"
            disabled={reingreso !== 'SI'}
          />
        </Campo>
      </div>

      <Campo etiqueta="Observaciones">
        <textarea rows={4} {...register('observaciones')} className={claseInput} />
      </Campo>

      {error && <MensajeError>{error}</MensajeError>}

      <button
        type="submit"
        disabled={guardando}
        className={claseBotonPrimario}
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 5'}
      </button>
      </fieldset>
    </form>
  )
}
