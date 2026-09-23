import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseBotonPrimario } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionRiesgos } from '../../components/SeleccionRiesgos'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2 } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoDetalle } from '../../types/db'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

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
      const datos = await api.get<(DiagnosticoDetalle & { riesgo_ids: string[] }) | null>(`/pacientes/${pacienteId}/diagnostico`)
      return datos ? { diagnostico: datos, riesgoIds: datos.riesgo_ids } : { diagnostico: null, riesgoIds: [] }
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
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const { handleSubmit, watch, setValue, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.diagnostico ?? null, data?.riesgoIds ?? []),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.diagnostico, data.riesgoIds))
  }, [data, reset])

  const diagnosticoId = watch('diagnostico_id')
  const riesgoIds = watch('riesgo_ids')
  const esValvulopatias = opcionesDiagnostico?.find((o) => o.id === diagnosticoId)?.codigo === 'VALVULOPATIAS'

  useEffect(() => {
    // Mientras DIAGNOSTICO no ha cargado, esValvulopatias da un falso negativo: sin este
    // guard, se borraría la valvulopatía ya guardada antes de que reset() la fije.
    if (opcionesDiagnostico && !esValvulopatias) setValue('valvulopatia_id', '')
  }, [esValvulopatias, opcionesDiagnostico, setValue])

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setErrorGuardado(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo2({
      diagnosticoId: valores.diagnostico_id,
      rachsId: valores.rachs_id,
      diagnosticoEsValvulopatias: esValvulopatias,
      valvulopatiaId: valores.valvulopatia_id,
      riesgoIds: valores.riesgo_ids,
    })

    try {
      await api.put(`/pacientes/${pacienteId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        rachs_id: valores.rachs_id || null,
        valvulopatia_id: esValvulopatias ? valores.valvulopatia_id || null : null,
        riesgo_ids: valores.riesgo_ids,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['diagnostico', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
    } catch (causa) {
      setErrorGuardado(mensajeDe(causa, 'No se pudo guardar el Módulo 2.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Diagnóstico *">
          <SelectOpciones categoria="DIAGNOSTICO" control={control} name="diagnostico_id" />
        </Campo>

        <Campo etiqueta="Tipo de valvulopatía">
          <SelectOpciones
            categoria="VALVULOPATIA"
            control={control} name="valvulopatia_id"
            disabled={!esValvulopatias}
            placeholder={esValvulopatias ? 'Seleccione…' : 'N/A'}
          />
        </Campo>

        <Campo etiqueta="Escala RACHS-1 *">
          <SelectOpciones categoria="RACHS" control={control} name="rachs_id" />
        </Campo>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Factores de riesgo *
        </label>
        <SeleccionRiesgos value={riesgoIds} onChange={(v) => setValue('riesgo_ids', v)} />
      </div>

      {errorGuardado && <MensajeError>{errorGuardado}</MensajeError>}

      <button
        type="submit"
        disabled={guardando}
        className={claseBotonPrimario}
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 2'}
      </button>
      </fieldset>
    </form>
  )
}
