import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { DiagnosticosAdicionales, type FilaDiagnosticoAdicional } from '../../components/DiagnosticosAdicionales'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2Adulto } from '../../lib/completitud'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoAdultoDetalle, OpcionLista } from '../../types/db'
import { Cargando, MensajeError } from '../../components/Estados'

interface Valores {
  diagnostico_id: string
  diagnostico_otro: string
  adicionales: FilaDiagnosticoAdicional[]
  valvulopatia_id: string
  euroscore: string
  riesgo_ids: string[]
  riesgo_especificaciones: Record<string, string>
}

// A diferencia del módulo pediátrico (un único código 'VALVULOPATIAS'), aquí hay varios diagnósticos
// que implican valvulopatía ("Valvulopatía", "Arritmia cardíaca + valvulopatía", "Enfermedad coronaria +
// valvulopatía"…), así que se detecta por texto, igual que en el backend (servicios-adultos.mjs,
// diagnosticoMencionaValvulopatia) para que ambos lados coincidan siempre.
const mencionaValvulopatia = (opcion: OpcionLista | undefined) => /valvulopat/i.test(opcion?.valor ?? '')

type DiagnosticoGuardado = DiagnosticoAdultoDetalle & { riesgo_ids: string[]; riesgo_especificaciones: Record<string, string> }

function useDiagnosticoAdulto(pacienteId: string, episodioId: string) {
  return useQuery({
    queryKey: ['diagnostico-adulto', episodioId],
    queryFn: () => api.get<DiagnosticoGuardado | null>(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/diagnostico`),
  })
}

function valoresIniciales(diagnostico: DiagnosticoGuardado | null): Valores {
  return {
    diagnostico_id: diagnostico?.diagnostico_id ?? '',
    diagnostico_otro: diagnostico?.diagnostico_otro ?? '',
    adicionales: (diagnostico?.diagnosticos_adicionales ?? []).map((a) => ({
      diagnostico_id: a.diagnostico_id, especificacion: a.especificacion ?? '', valvulopatia_id: a.valvulopatia_id ?? '',
    })),
    valvulopatia_id: diagnostico?.valvulopatia_id ?? '',
    euroscore: diagnostico?.euroscore?.toString() ?? '',
    riesgo_ids: diagnostico?.riesgo_ids ?? [],
    riesgo_especificaciones: diagnostico?.riesgo_especificaciones ?? {},
  }
}

export function Modulo2FormAdulto({ pacienteId, episodioId }: { pacienteId: string; episodioId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const esOtro = useEsOpcionOtro()
  const { data, isLoading } = useDiagnosticoAdulto(pacienteId, episodioId)
  const { data: opcionesDiagnostico } = useOpciones('DIAGNOSTICO_ADULTO')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [camposFaltantes, setCamposFaltantes] = useState<string[]>([])

  const { register, handleSubmit, watch, setValue, reset, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data ?? null),
  })

  useEffect(() => {
    if (data !== undefined) reset(valoresIniciales(data))
  }, [data, reset])

  const diagnosticoId = watch('diagnostico_id')
  const riesgoIds = watch('riesgo_ids')
  const riesgoEspecificaciones = watch('riesgo_especificaciones')
  // El tipo de valvulopatía de aquí es el del diagnóstico principal: cada diagnóstico adicional tiene
  // el suyo (DiagnosticosAdicionales).
  const esValvulopatia = (id: string) => !!id && mencionaValvulopatia(opcionesDiagnostico?.find((o) => o.id === id))
  const principalEsValvulopatia = esValvulopatia(diagnosticoId)

  useEffect(() => {
    // Mismo guard que Modulo2Form (pediátrico): exigir diagnosticoId evita que este efecto borre
    // valvulopatia_id en el mismo ciclo en que reset() recién la puso, antes de que `watch` la vea.
    if (diagnosticoId && opcionesDiagnostico && !principalEsValvulopatia) setValue('valvulopatia_id', '')
  }, [diagnosticoId, principalEsValvulopatia, opcionesDiagnostico, setValue])

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setGuardadoEn(null)
    setCamposFaltantes([])
    setErrorGuardado(null)
    setGuardando(true)

    // Las filas que se agregaron pero se dejaron sin elegir no se guardan.
    const adicionales = valores.diagnostico_id ? valores.adicionales.filter((a) => a.diagnostico_id) : []
    const especificarDiagnostico = esOtro('DIAGNOSTICO_ADULTO', valores.diagnostico_id)
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo2Adulto({
      sinEspecificar: sinEspecificar([
        { etiqueta: 'Diagnóstico', esOtro: especificarDiagnostico, texto: valores.diagnostico_otro },
        ...adicionales.map((a) => ({ etiqueta: 'Otro diagnóstico', esOtro: esOtro('DIAGNOSTICO_ADULTO', a.diagnostico_id), texto: a.especificacion })),
        ...valores.riesgo_ids.map((id) => ({ etiqueta: 'Factores de riesgo', esOtro: esOtro('RIESGOS_ADULTO', id), texto: valores.riesgo_especificaciones[id] })),
      ]),
      diagnosticoId: valores.diagnostico_id,
      euroscore: valores.euroscore,
      diagnosticoEsValvulopatia: principalEsValvulopatia,
      valvulopatiaId: valores.valvulopatia_id,
      faltantesAdicionales: adicionales.flatMap((a, i) =>
        esValvulopatia(a.diagnostico_id) && !a.valvulopatia_id ? [`Tipo de valvulopatía (otro diagnóstico ${i + 1})`] : []),
      riesgoIds: valores.riesgo_ids,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        diagnostico_otro: especificarDiagnostico ? valores.diagnostico_otro.trim() || null : null,
        diagnosticos_adicionales: adicionales.map((a) => ({
          diagnostico_id: a.diagnostico_id,
          especificacion: esOtro('DIAGNOSTICO_ADULTO', a.diagnostico_id) ? a.especificacion.trim() || null : null,
          valvulopatia_id: esValvulopatia(a.diagnostico_id) ? a.valvulopatia_id || null : null,
        })),
        valvulopatia_id: principalEsValvulopatia ? valores.valvulopatia_id || null : null,
        euroscore: valores.euroscore ? Number(valores.euroscore) : null,
        riesgo_ids: valores.riesgo_ids,
        riesgo_especificaciones: especificacionesElegidas(valores.riesgo_ids, valores.riesgo_especificaciones),
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['diagnostico-adulto', episodioId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['episodios-adulto', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setErrorGuardado(mensajeDe(causa, 'No se pudo guardar el Módulo 2.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <fieldset className="space-y-5">
        <div className="space-y-5">
          <SeccionFormulario titulo="Diagnóstico">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CampoOpciones
                etiqueta="Diagnóstico *"
                categoria="DIAGNOSTICO_ADULTO"
                control={control}
                name="diagnostico_id"
                nameOtro="diagnostico_otro"
                buscable
                permiteCrear
                className="sm:col-span-2"
              />

              <Campo etiqueta="Tipo de valvulopatía">
                <SelectOpciones
                  categoria="VALVULOPATIA"
                  control={control} name="valvulopatia_id"
                  disabled={!principalEsValvulopatia}
                  placeholder={principalEsValvulopatia ? 'Seleccione…' : 'N/A'}
                />
              </Campo>

              <DiagnosticosAdicionales control={control} setValue={setValue} categoria="DIAGNOSTICO_ADULTO" esValvulopatia={mencionaValvulopatia} />
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Riesgo quirúrgico">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Campo etiqueta="Escala EuroSCORE (%) *">
                  <input type="number" min="0" max="100" step="0.01" {...register('euroscore')} className={claseInput} />
                </Campo>
              </div>

              <div role="group" aria-labelledby="etiqueta-riesgos">
                <p id="etiqueta-riesgos" className="mb-2 text-sm font-medium text-slate-700">
                  Factores de riesgo *
                </p>
                <SeleccionMultiple
                  categoria="RIESGOS_ADULTO"
                  codigoExcluyente="NINGUNO"
                  value={riesgoIds}
                  onChange={(v) => setValue('riesgo_ids', v)}
                  especificaciones={riesgoEspecificaciones}
                  onEspecificar={(id, texto) => setValue('riesgo_especificaciones', { ...riesgoEspecificaciones, [id]: texto })}
                />
              </div>
            </div>
          </SeccionFormulario>
        </div>

        {errorGuardado && <MensajeError>{errorGuardado}</MensajeError>}

        <PieFormulario etiqueta="Guardar Módulo 2" guardando={guardando} guardadoEn={guardadoEn} faltantes={camposFaltantes} />
      </fieldset>
    </form>
  )
}
