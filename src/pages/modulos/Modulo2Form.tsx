import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionRiesgos } from '../../components/SeleccionRiesgos'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2 } from '../../lib/completitud'
import { supabase } from '../../lib/supabase'
import type { DiagnosticoDetalle } from '../../types/db'

interface Valores {
  diagnostico_id: string
  valvulopatia_id: string
  rachs_id: string
  riesgo_ids: string[]
}

function useDiagnostico(pacienteId: string) {
  return useQuery({
    queryKey: ['diagnostico', pacienteId],
    queryFn: async (): Promise<{ diagnostico: DiagnosticoDetalle | null; riesgoIds: string[] }> => {
      const { data: diagnostico, error } = await supabase
        .from('diagnosticos')
        .select('id, paciente_id, diagnostico_id, valvulopatia_id, rachs_id, estado_modulo')
        .eq('paciente_id', pacienteId)
        .maybeSingle()
      if (error) throw error
      if (!diagnostico) return { diagnostico: null, riesgoIds: [] }

      const { data: riesgos, error: errorRiesgos } = await supabase
        .from('diagnosticos_riesgos')
        .select('riesgo_id')
        .eq('diagnostico_id', diagnostico.id)
      if (errorRiesgos) throw errorRiesgos

      return { diagnostico, riesgoIds: riesgos.map((r) => r.riesgo_id) }
    },
  })
}

function valoresIniciales(diagnostico: DiagnosticoDetalle | null, riesgoIds: string[]): Valores {
  return {
    diagnostico_id: diagnostico?.diagnostico_id ?? '',
    valvulopatia_id: diagnostico?.valvulopatia_id ?? '',
    rachs_id: diagnostico?.rachs_id ?? '',
    riesgo_ids: riesgoIds,
  }
}

export function Modulo2Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useDiagnostico(pacienteId)
  const { data: opcionesDiagnostico } = useOpciones('DIAGNOSTICO')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.diagnostico ?? null, data?.riesgoIds ?? []),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.diagnostico, data.riesgoIds))
  }, [data, reset])

  const diagnosticoId = watch('diagnostico_id')
  const riesgoIds = watch('riesgo_ids')
  const esValvulopatias = opcionesDiagnostico?.find((o) => o.id === diagnosticoId)?.codigo === 'VALVULOPATIAS'

  useEffect(() => {
    if (!esValvulopatias) setValue('valvulopatia_id', '')
  }, [esValvulopatias, setValue])

  if (isLoading) return <p className="text-sm text-slate-500">Cargando…</p>

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setErrorGuardado(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo2({
      diagnosticoId: valores.diagnostico_id,
      rachsId: valores.rachs_id,
      diagnosticoEsValvulopatias: esValvulopatias,
      valvulopatiaId: valores.valvulopatia_id,
      riesgoIds: valores.riesgo_ids,
    })

    const { error } = await supabase.rpc('fn_guardar_diagnostico', {
      p_paciente_id: pacienteId,
      p_diagnostico_id: valores.diagnostico_id || null,
      p_rachs_id: valores.rachs_id || null,
      p_valvulopatia_id: esValvulopatias ? valores.valvulopatia_id || null : null,
      p_riesgo_ids: valores.riesgo_ids,
      p_estado_modulo: estado_modulo,
      p_usuario_id: perfil.id,
    })

    setGuardando(false)
    if (error) {
      setErrorGuardado(error.message)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['diagnostico', pacienteId] })
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Diagnóstico *">
          <SelectOpciones categoria="DIAGNOSTICO" registro={register('diagnostico_id')} />
        </Campo>

        <Campo etiqueta="Tipo de valvulopatía">
          <SelectOpciones
            categoria="VALVULOPATIA"
            registro={register('valvulopatia_id')}
            disabled={!esValvulopatias}
            placeholder={esValvulopatias ? 'Seleccione…' : 'N/A'}
          />
        </Campo>

        <Campo etiqueta="Escala RACHS-1 *">
          <SelectOpciones categoria="RACHS" registro={register('rachs_id')} />
        </Campo>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Factores de riesgo *
        </label>
        <SeleccionRiesgos value={riesgoIds} onChange={(v) => setValue('riesgo_ids', v)} />
      </div>

      {errorGuardado && <p className="text-sm text-red-600">{errorGuardado}</p>}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 2'}
      </button>
    </form>
  )
}
