import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { calcularEstadoModulo5 } from '../../lib/completitud'
import { sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { hoyIso } from '../../lib/fechas'
import { api, mensajeDe } from '../../lib/api'
import { AvisoInformativo, Cargando, MensajeAdvertencia, MensajeError } from '../../components/Estados'

interface SeguimientoDetalle {
  no_aplica: boolean
  fecha_control_cirugia: string | null
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | null
  estado_herida_id: string | null
  estado_herida_otro: string | null
  fecha_llamada_15_dias: string | null
  persona_recibe_llamada: string | null
  reingreso_30_dias: 'SI' | 'NO' | 'NA' | null
  fecha_reingreso: string | null
  causa_reingreso_id: string | null
  causa_reingreso_otro: string | null
  observaciones: string | null
}

interface Valores {
  fecha_control_cirugia: string
  rehabilitacion_cardiaca: 'SI' | 'NO' | 'NA' | ''
  estado_herida_id: string
  estado_herida_otro: string
  fecha_llamada_15_dias: string
  persona_recibe_llamada: string
  reingreso_30_dias: 'SI' | 'NO' | 'NA' | ''
  fecha_reingreso: string
  causa_reingreso_id: string
  causa_reingreso_otro: string
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
    estado_herida_otro: s?.estado_herida_otro ?? '',
    fecha_llamada_15_dias: s?.fecha_llamada_15_dias ?? (fechaSalida ? sumarDias(fechaSalida, 15) : ''),
    persona_recibe_llamada: s?.persona_recibe_llamada ?? '',
    reingreso_30_dias: s?.reingreso_30_dias ?? '',
    fecha_reingreso: s?.fecha_reingreso ?? '',
    causa_reingreso_id: s?.causa_reingreso_id ?? '',
    causa_reingreso_otro: s?.causa_reingreso_otro ?? '',
    observaciones: s?.observaciones ?? '',
  }
}

export function Modulo5Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const esOtro = useEsOpcionOtro()
  const { data, isLoading } = useSeguimiento(pacienteId)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [camposFaltantes, setCamposFaltantes] = useState<string[]>([])

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

  const llamadaVencida = !llamadaHecha && !!fechaLlamada && fechaLlamada < hoyIso()
  const llamadaPendiente = !llamadaHecha && !!fechaLlamada && fechaLlamada >= hoyIso()

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setGuardadoEn(null)
    setCamposFaltantes([])
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

    const especificar = {
      herida: esOtro('ESTADO_HERIDA', valores.estado_herida_id),
      causa: valores.reingreso_30_dias === 'SI' && esOtro('CAUSA_REINGRESO', valores.causa_reingreso_id),
    }
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo5({
      sinEspecificar: sinEspecificar([
        { etiqueta: 'Estado de la herida quirúrgica', esOtro: especificar.herida, texto: valores.estado_herida_otro },
        { etiqueta: 'Causa de reingreso', esOtro: especificar.causa, texto: valores.causa_reingreso_otro },
      ]),
      fechaControl: valores.fecha_control_cirugia,
      rehabilitacionCardiaca: valores.rehabilitacion_cardiaca,
      estadoHeridaId: valores.estado_herida_id,
      fechaLlamada15Dias: valores.fecha_llamada_15_dias,
      personaRecibeLlamada: valores.persona_recibe_llamada,
      reingreso: valores.reingreso_30_dias,
      fechaReingreso: valores.fecha_reingreso,
      causaReingresoId: valores.causa_reingreso_id,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes/${pacienteId}/seguimiento`, {
        fecha_control_cirugia: valores.fecha_control_cirugia || null,
        rehabilitacion_cardiaca: valores.rehabilitacion_cardiaca || null,
        estado_herida_id: valores.estado_herida_id || null,
        estado_herida_otro: especificar.herida ? valores.estado_herida_otro.trim() || null : null,
        fecha_llamada_15_dias: valores.fecha_llamada_15_dias || null,
        persona_recibe_llamada: valores.persona_recibe_llamada.trim() || null,
        reingreso_30_dias: valores.reingreso_30_dias || null,
        fecha_reingreso: valores.reingreso_30_dias === 'SI' ? valores.fecha_reingreso || null : null,
        causa_reingreso_id: valores.reingreso_30_dias === 'SI' ? valores.causa_reingreso_id || null : null,
        causa_reingreso_otro: especificar.causa ? valores.causa_reingreso_otro.trim() || null : null,
        observaciones: valores.observaciones.trim() || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['seguimiento', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 5.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <fieldset className="space-y-5">
        <div className="space-y-5">
          <SeccionFormulario titulo="Control posterior">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Fecha de control por cirugía cardiovascular / cardiología o pediátrica *">
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

              <CampoOpciones
                etiqueta="Estado de la herida quirúrgica *"
                categoria="ESTADO_HERIDA"
                control={control}
                name="estado_herida_id"
                nameOtro="estado_herida_otro"
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Llamada de los 15 días">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Campo etiqueta="Fecha de la llamada *">
                  <input type="date" {...register('fecha_llamada_15_dias')} className={claseInput} />
                </Campo>

                <Campo etiqueta="Persona que recibe la llamada *" className="sm:col-span-2">
                  <input {...register('persona_recibe_llamada')} className={claseInput} />
                </Campo>
              </div>

              {llamadaVencida && <MensajeError>La llamada de los 15 días está vencida.</MensajeError>}
              {llamadaPendiente && <MensajeAdvertencia>La llamada de los 15 días está pendiente.</MensajeAdvertencia>}
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Reingreso en los primeros 30 días">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="¿Hubo reingreso? *">
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
              <CampoOpciones
                etiqueta="Causa de reingreso"
                categoria="CAUSA_REINGRESO"
                control={control}
                name="causa_reingreso_id"
                nameOtro="causa_reingreso_otro"
                disabled={reingreso !== 'SI'}
                className="sm:col-span-2 lg:col-span-1"
              />
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

        <PieFormulario etiqueta="Guardar Módulo 5" guardando={guardando} guardadoEn={guardadoEn} faltantes={camposFaltantes} />
      </fieldset>
    </form>
  )
}
