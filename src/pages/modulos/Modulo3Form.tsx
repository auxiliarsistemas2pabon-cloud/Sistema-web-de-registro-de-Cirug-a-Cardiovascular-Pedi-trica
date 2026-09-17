import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { calcularEstadoModulo3 } from '../../lib/completitud'
import { supabase } from '../../lib/supabase'

interface CirugiaDetalle {
  id: string
  fecha_cirugia: string | null
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
  procedimiento_3_id: string
  implante_id: string
  uso_cec: 'SI' | 'NO' | ''
  tiempo_cec_min: string
  tiempo_clamp_min: string
  complicacion_intraqx_id: string
  cierre_esternal_diferido: 'SI' | 'NO' | ''
  extubacion_quirofano: 'SI' | 'NO' | ''
}

function useCirugia(pacienteId: string) {
  return useQuery({
    queryKey: ['cirugia', pacienteId],
    queryFn: async (): Promise<{ cirugia: CirugiaDetalle | null; procedimientoIds: string[] }> => {
      const { data: cirugia, error } = await supabase
        .from('cirugias')
        .select(
          'id, fecha_cirugia, implante_id, uso_cec, tiempo_cec_min, tiempo_clamp_min, complicacion_intraqx_id, cierre_esternal_diferido, extubacion_quirofano, estado_modulo',
        )
        .eq('paciente_id', pacienteId)
        .maybeSingle()
      if (error) throw error
      if (!cirugia) return { cirugia: null, procedimientoIds: [] }

      const { data: procedimientos, error: errorProc } = await supabase
        .from('cirugias_procedimientos')
        .select('procedimiento_id, orden')
        .eq('cirugia_id', cirugia.id)
        .order('orden')
      if (errorProc) throw errorProc

      return { cirugia, procedimientoIds: procedimientos.map((p) => p.procedimiento_id) }
    },
  })
}

function valoresIniciales(cirugia: CirugiaDetalle | null, procedimientoIds: string[]): Valores {
  return {
    fecha_cirugia: cirugia?.fecha_cirugia ?? '',
    procedimiento_1_id: procedimientoIds[0] ?? '',
    procedimiento_2_id: procedimientoIds[1] ?? '',
    procedimiento_3_id: procedimientoIds[2] ?? '',
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
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.cirugia ?? null, data?.procedimientoIds ?? []),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.cirugia, data.procedimientoIds))
  }, [data, reset])

  const usoCec = watch('uso_cec')
  const p1 = watch('procedimiento_1_id')
  const p2 = watch('procedimiento_2_id')
  const p3 = watch('procedimiento_3_id')

  if (isLoading) return <p className="text-sm text-slate-500">Cargando…</p>

  const repetido =
    (!!p1 && !!p2 && p1 === p2) || (!!p1 && !!p3 && p1 === p3) || (!!p2 && !!p3 && p2 === p3)

  async function onSubmit(valores: Valores) {
    if (!perfil) return
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

    const estado_modulo = calcularEstadoModulo3({
      fechaCirugia: valores.fecha_cirugia,
      procedimiento1Id: valores.procedimiento_1_id,
      usoCec: valores.uso_cec,
      tiempoCecMin: valores.tiempo_cec_min,
    })

    const { error: errorRpc } = await supabase.rpc('fn_guardar_cirugia', {
      p_paciente_id: pacienteId,
      p_fecha_cirugia: valores.fecha_cirugia || null,
      p_implante_id: valores.implante_id || null,
      p_uso_cec: valores.uso_cec || null,
      p_tiempo_cec_min: valores.uso_cec === 'SI' && valores.tiempo_cec_min ? Number(valores.tiempo_cec_min) : null,
      p_tiempo_clamp_min: valores.uso_cec === 'SI' && valores.tiempo_clamp_min ? Number(valores.tiempo_clamp_min) : null,
      p_complicacion_intraqx_id: valores.complicacion_intraqx_id || null,
      p_cierre_esternal_diferido: valores.cierre_esternal_diferido || null,
      p_extubacion_quirofano: valores.extubacion_quirofano || null,
      p_procedimiento_ids: procedimientoIds,
      p_estado_modulo: estado_modulo,
      p_usuario_id: perfil.id,
    })

    setGuardando(false)
    if (errorRpc) {
      setError(errorRpc.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['cirugia', pacienteId] })
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de cirugía *">
          <input type="date" {...register('fecha_cirugia')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Tipo de implante">
          <SelectOpciones categoria="IMPLANTE" registro={register('implante_id')} />
        </Campo>

        <Campo etiqueta="Procedimiento quirúrgico 1 *">
          <SelectOpciones categoria="PROCEDIMIENTOS" registro={register('procedimiento_1_id')} />
        </Campo>
        <Campo etiqueta="Procedimiento quirúrgico 2">
          <SelectOpciones categoria="PROCEDIMIENTOS" registro={register('procedimiento_2_id')} />
        </Campo>
        <Campo etiqueta="Procedimiento quirúrgico 3">
          <SelectOpciones categoria="PROCEDIMIENTOS" registro={register('procedimiento_3_id')} />
        </Campo>
      </div>
      {repetido && <p className="text-sm text-red-600">Los procedimientos no pueden repetirse.</p>}

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
            disabled={usoCec !== 'SI'}
            {...register('tiempo_cec_min')}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Tiempo de clamp de aorta (min)">
          <input
            type="number"
            disabled={usoCec !== 'SI'}
            {...register('tiempo_clamp_min')}
            className={claseInput}
          />
        </Campo>
      </div>

      <Campo etiqueta="Complicación intraquirúrgica">
        <SelectOpciones categoria="COMPLICACION_INTRAQX" registro={register('complicacion_intraqx_id')} />
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 3'}
      </button>
    </form>
  )
}
