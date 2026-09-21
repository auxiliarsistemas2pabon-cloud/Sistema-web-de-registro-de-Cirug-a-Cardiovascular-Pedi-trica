import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo4 } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'

interface PostoperatorioDetalle {
  id: string
  unidad_pop_id: string | null
  horas_ventilacion_mecanica: number | null
  complicacion_pop_id: string | null
  fecha_traslado_intermedio: string | null
  fecha_salida: string | null
  condicion_salida_id: string | null
}

interface Valores {
  unidad_pop_id: string
  horas_ventilacion_mecanica: string
  complicacion_pop_id: string
  fecha_traslado_intermedio: string
  fecha_salida: string
  condicion_salida_id: string
}

function usePostoperatorio(pacienteId: string) {
  return useQuery({
    queryKey: ['postoperatorio', pacienteId],
    queryFn: async () => {
      const [postoperatorio, cirugia] = await Promise.all([
        api.get<PostoperatorioDetalle | null>(`/pacientes/${pacienteId}/postoperatorio`),
        api.get<{ extubacion_quirofano: 'SI' | 'NO' | null; fecha_cirugia: string | null } | null>(`/pacientes/${pacienteId}/cirugia`),
      ])
      return {
        postoperatorio,
        extubacionQuirofano: cirugia?.extubacion_quirofano ?? null,
        fechaCirugia: cirugia?.fecha_cirugia ?? null,
      }
    },
  })
}

function valoresIniciales(po: PostoperatorioDetalle | null, sugerirCero: boolean): Valores {
  return {
    unidad_pop_id: po?.unidad_pop_id ?? '',
    horas_ventilacion_mecanica:
      po?.horas_ventilacion_mecanica?.toString() ?? (sugerirCero ? '0' : ''),
    complicacion_pop_id: po?.complicacion_pop_id ?? '',
    fecha_traslado_intermedio: po?.fecha_traslado_intermedio ?? '',
    fecha_salida: po?.fecha_salida ?? '',
    condicion_salida_id: po?.condicion_salida_id ?? '',
  }
}

export function Modulo4Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = usePostoperatorio(pacienteId)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset } = useForm<Valores>({
    defaultValues: valoresIniciales(null, false),
  })

  useEffect(() => {
    if (data) {
      reset(valoresIniciales(data.postoperatorio, !data.postoperatorio && data.extubacionQuirofano === 'SI'))
    }
  }, [data, reset])

  if (isLoading) return <p className="text-sm text-slate-500">Cargando…</p>

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
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

    const estado_modulo = calcularEstadoModulo4({
      unidadPopId: valores.unidad_pop_id,
      horasVentilacion: valores.horas_ventilacion_mecanica,
      complicacionPopId: valores.complicacion_pop_id,
      condicionSalidaId: valores.condicion_salida_id,
    })

    try {
      await api.put(`/pacientes/${pacienteId}/postoperatorio`, {
        unidad_pop_id: valores.unidad_pop_id || null,
        horas_ventilacion_mecanica:
          valores.horas_ventilacion_mecanica !== '' ? Number(valores.horas_ventilacion_mecanica) : null,
        complicacion_pop_id: valores.complicacion_pop_id || null,
        fecha_traslado_intermedio: valores.fecha_traslado_intermedio || null,
        fecha_salida: valores.fecha_salida || null,
        condicion_salida_id: valores.condicion_salida_id || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['postoperatorio', pacienteId] })
      // Guardar el Módulo 4 puede crear o bloquear el Módulo 5 (condición de salida = Muerte).
      queryClient.invalidateQueries({ queryKey: ['seguimiento', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 4.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      {!puedeEditar && <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Modo consulta: este registro es de solo lectura.</p>}
      <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Unidad postoperatoria *">
          <SelectOpciones categoria="UNIDAD_POP" registro={register('unidad_pop_id')} />
        </Campo>

        <Campo etiqueta="Horas de ventilación mecánica *">
          <input type="number" min="0" step="1" {...register('horas_ventilacion_mecanica')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Complicación postoperatoria *" className="sm:col-span-2">
          <SelectOpciones categoria="COMPLICACION_POP" registro={register('complicacion_pop_id')} />
        </Campo>

        <Campo etiqueta="Fecha de traslado a intermedio">
          <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_traslado_intermedio')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Fecha de salida">
          <input type="date" min={data?.fechaCirugia ?? undefined} {...register('fecha_salida')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Condición en que sale el paciente *">
          <SelectOpciones categoria="CONDICION_SALIDA" registro={register('condicion_salida_id')} />
        </Campo>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 4'}
      </button>
      </fieldset>
    </form>
  )
}
