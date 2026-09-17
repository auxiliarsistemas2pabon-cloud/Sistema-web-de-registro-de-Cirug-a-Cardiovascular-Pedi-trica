import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo4 } from '../../lib/completitud'
import { supabase } from '../../lib/supabase'

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
        supabase
          .from('postoperatorio')
          .select(
            'id, unidad_pop_id, horas_ventilacion_mecanica, complicacion_pop_id, fecha_traslado_intermedio, fecha_salida, condicion_salida_id',
          )
          .eq('paciente_id', pacienteId)
          .maybeSingle(),
        supabase.from('cirugias').select('extubacion_quirofano').eq('paciente_id', pacienteId).maybeSingle(),
      ])
      if (postoperatorio.error) throw postoperatorio.error
      if (cirugia.error) throw cirugia.error
      return {
        postoperatorio: postoperatorio.data as PostoperatorioDetalle | null,
        extubacionQuirofano: cirugia.data?.extubacion_quirofano ?? null,
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
    if (!perfil) return
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

    const payload = {
      paciente_id: pacienteId,
      unidad_pop_id: valores.unidad_pop_id || null,
      horas_ventilacion_mecanica:
        valores.horas_ventilacion_mecanica !== '' ? Number(valores.horas_ventilacion_mecanica) : null,
      complicacion_pop_id: valores.complicacion_pop_id || null,
      fecha_traslado_intermedio: valores.fecha_traslado_intermedio || null,
      fecha_salida: valores.fecha_salida || null,
      condicion_salida_id: valores.condicion_salida_id || null,
      estado_modulo,
      actualizado_por: perfil.id,
    }

    const { error: errorUpsert } = data?.postoperatorio
      ? await supabase.from('postoperatorio').update(payload).eq('paciente_id', pacienteId)
      : await supabase.from('postoperatorio').insert({ ...payload, creado_por: perfil.id })

    setGuardando(false)
    if (errorUpsert) {
      setError(errorUpsert.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['postoperatorio', pacienteId] })
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Unidad postoperatoria *">
          <SelectOpciones categoria="UNIDAD_POP" registro={register('unidad_pop_id')} />
        </Campo>

        <Campo etiqueta="Horas de ventilación mecánica *">
          <input type="number" {...register('horas_ventilacion_mecanica')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Complicación postoperatoria *" className="sm:col-span-2">
          <SelectOpciones categoria="COMPLICACION_POP" registro={register('complicacion_pop_id')} />
        </Campo>

        <Campo etiqueta="Fecha de traslado a intermedio">
          <input type="date" {...register('fecha_traslado_intermedio')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Fecha de salida">
          <input type="date" {...register('fecha_salida')} className={claseInput} />
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
    </form>
  )
}
