import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput, claseBotonPrimario } from '../../components/Campo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionRiesgos } from '../../components/SeleccionRiesgos'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2Adulto } from '../../lib/completitud'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoAdultoDetalle } from '../../types/db'
import { Cargando, MensajeError, AvisoSoloLectura } from '../../components/Estados'

interface Valores {
  diagnostico_id: string
  valvulopatia_id: string
  euroscore: string
  riesgo_ids: string[]
}

function useDiagnosticoAdulto(pacienteId: string) {
  return useQuery({
    queryKey: ['diagnostico-adulto', pacienteId],
    queryFn: async (): Promise<{ diagnostico: DiagnosticoAdultoDetalle | null; riesgoIds: string[] }> => {
      const datos = await api.get<(DiagnosticoAdultoDetalle & { riesgo_ids: string[] }) | null>(`/pacientes-adultos/${pacienteId}/diagnostico`)
      return datos ? { diagnostico: datos, riesgoIds: datos.riesgo_ids } : { diagnostico: null, riesgoIds: [] }
    },
  })
}

function valoresIniciales(diagnostico: DiagnosticoAdultoDetalle | null, riesgoIds: string[]): Valores {
  return {
    diagnostico_id: diagnostico?.diagnostico_id ?? '',
    valvulopatia_id: diagnostico?.valvulopatia_id ?? '',
    euroscore: diagnostico?.euroscore?.toString() ?? '',
    riesgo_ids: riesgoIds,
  }
}

export function Modulo2FormAdulto({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useDiagnosticoAdulto(pacienteId)
  const { data: opcionesDiagnostico } = useOpciones('DIAGNOSTICO_ADULTO')
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.diagnostico ?? null, data?.riesgoIds ?? []),
  })

  useEffect(() => {
    if (data) reset(valoresIniciales(data.diagnostico, data.riesgoIds))
  }, [data, reset])

  const diagnosticoId = watch('diagnostico_id')
  const riesgoIds = watch('riesgo_ids')
  // A diferencia del módulo pediátrico (un único código 'VALVULOPATIAS'), aquí hay tres
  // diagnósticos que implican valvulopatía ("Valvulopatía", "Arritmia cardíaca + valvulopatía",
  // "Enfermedad coronaria + valvulopatía"), así que se detecta por texto, igual que en el backend
  // (servicios-adultos.mjs, diagnosticoMencionaValvulopatia) para que ambos lados coincidan siempre.
  const esValvulopatia = /valvulopat/i.test(opcionesDiagnostico?.find((o) => o.id === diagnosticoId)?.valor ?? '')

  useEffect(() => {
    // Mismo guard que Modulo2Form (pediátrico): exigir diagnosticoId evita que este efecto borre
    // valvulopatia_id en el mismo ciclo en que reset() recién la puso, antes de que `watch` la vea.
    if (diagnosticoId && opcionesDiagnostico && !esValvulopatia) setValue('valvulopatia_id', '')
  }, [diagnosticoId, esValvulopatia, opcionesDiagnostico, setValue])

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setErrorGuardado(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo2Adulto({
      diagnosticoId: valores.diagnostico_id,
      euroscore: valores.euroscore,
      diagnosticoEsValvulopatia: esValvulopatia,
      valvulopatiaId: valores.valvulopatia_id,
      riesgoIds: valores.riesgo_ids,
    })

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        valvulopatia_id: esValvulopatia ? valores.valvulopatia_id || null : null,
        euroscore: valores.euroscore ? Number(valores.euroscore) : null,
        riesgo_ids: valores.riesgo_ids,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['diagnostico-adulto', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
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
          <SelectOpciones categoria="DIAGNOSTICO_ADULTO" control={control} name="diagnostico_id" buscable permiteCrear />
        </Campo>

        <Campo etiqueta="Tipo de valvulopatía">
          <SelectOpciones
            categoria="VALVULOPATIA"
            control={control} name="valvulopatia_id"
            disabled={!esValvulopatia}
            placeholder={esValvulopatia ? 'Seleccione…' : 'N/A'}
          />
        </Campo>

        <Campo etiqueta="Escala EuroSCORE (%) *">
          <input type="number" min="0" max="100" step="0.01" {...register('euroscore')} className={claseInput} />
        </Campo>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Factores de riesgo *
        </label>
        <SeleccionRiesgos categoria="RIESGOS_ADULTO" value={riesgoIds} onChange={(v) => setValue('riesgo_ids', v)} />
      </div>

      {errorGuardado && <MensajeError>{errorGuardado}</MensajeError>}

      <button type="submit" disabled={guardando} className={claseBotonPrimario}>
        {guardando ? 'Guardando…' : 'Guardar Módulo 2'}
      </button>
      </fieldset>
    </form>
  )
}
