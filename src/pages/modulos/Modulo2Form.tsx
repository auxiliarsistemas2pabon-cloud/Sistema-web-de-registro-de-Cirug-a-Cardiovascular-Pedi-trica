import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { DiagnosticosAdicionales, type FilaDiagnosticoAdicional } from '../../components/DiagnosticosAdicionales'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2 } from '../../lib/completitud'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoDetalle, OpcionLista } from '../../types/db'
import { Cargando, MensajeError } from '../../components/Estados'

interface Valores {
  diagnostico_id: string
  diagnostico_otro: string
  adicionales: FilaDiagnosticoAdicional[]
  valvulopatia_id: string
  rachs_id: string
  riesgo_ids: string[]
  riesgo_especificaciones: Record<string, string>
}

/** Misma regla que guardarDiagnostico en server/servicios.mjs: por su código. */
const esValvulopatias = (opcion: OpcionLista | undefined) => opcion?.codigo === 'VALVULOPATIAS'

type DiagnosticoGuardado = DiagnosticoDetalle & { riesgo_ids: string[]; riesgo_especificaciones: Record<string, string> }

function useDiagnostico(pacienteId: string) {
  return useQuery({
    queryKey: ['diagnostico', pacienteId],
    queryFn: () => api.get<DiagnosticoGuardado | null>(`/pacientes/${pacienteId}/diagnostico`),
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
    rachs_id: diagnostico?.rachs_id ?? '',
    riesgo_ids: diagnostico?.riesgo_ids ?? [],
    riesgo_especificaciones: diagnostico?.riesgo_especificaciones ?? {},
  }
}

export function Modulo2Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const esOtro = useEsOpcionOtro()
  const { data, isLoading } = useDiagnostico(pacienteId)
  const { data: opcionesDiagnostico } = useOpciones('DIAGNOSTICO')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [camposFaltantes, setCamposFaltantes] = useState<string[]>([])

  const { handleSubmit, watch, setValue, reset, control } = useForm<Valores>({
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
  const esValvulopatia = (id: string) => !!id && esValvulopatias(opcionesDiagnostico?.find((o) => o.id === id))
  const principalEsValvulopatia = esValvulopatia(diagnosticoId)

  useEffect(() => {
    // Exigir diagnosticoId (no solo que las opciones/`data` ya hayan llegado) es lo que importa:
    // cuando `data` llega, este efecto y el de reset() arriba corren en el mismo ciclo de efectos,
    // y `diagnosticoId` (leído por `watch` durante el render, antes de que reset() corriera) sigue
    // en su valor por defecto (''). Eso da un falso principalEsValvulopatia=false y borra valvulopatia_id
    // justo después de que reset() la puso en su valor correcto. Exigir diagnosticoId aquí hace que
    // este efecto se salte esa vuelta y solo actúe una vez que el formulario ya tiene el diagnóstico
    // real (reset ya corrido), sea en la carga inicial o cuando el usuario cambia el diagnóstico.
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
    const especificarDiagnostico = esOtro('DIAGNOSTICO', valores.diagnostico_id)
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo2({
      sinEspecificar: sinEspecificar([
        { etiqueta: 'Diagnóstico', esOtro: especificarDiagnostico, texto: valores.diagnostico_otro },
        ...adicionales.map((a) => ({ etiqueta: 'Otro diagnóstico', esOtro: esOtro('DIAGNOSTICO', a.diagnostico_id), texto: a.especificacion })),
        ...valores.riesgo_ids.map((id) => ({ etiqueta: 'Factores de riesgo', esOtro: esOtro('RIESGOS', id), texto: valores.riesgo_especificaciones[id] })),
      ]),
      diagnosticoId: valores.diagnostico_id,
      rachsId: valores.rachs_id,
      diagnosticoEsValvulopatias: principalEsValvulopatia,
      valvulopatiaId: valores.valvulopatia_id,
      faltantesAdicionales: adicionales.flatMap((a, i) =>
        esValvulopatia(a.diagnostico_id) && !a.valvulopatia_id ? [`Tipo de valvulopatía (otro diagnóstico ${i + 1})`] : []),
      riesgoIds: valores.riesgo_ids,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes/${pacienteId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        diagnostico_otro: especificarDiagnostico ? valores.diagnostico_otro.trim() || null : null,
        diagnosticos_adicionales: adicionales.map((a) => ({
          diagnostico_id: a.diagnostico_id,
          especificacion: esOtro('DIAGNOSTICO', a.diagnostico_id) ? a.especificacion.trim() || null : null,
          valvulopatia_id: esValvulopatia(a.diagnostico_id) ? a.valvulopatia_id || null : null,
        })),
        rachs_id: valores.rachs_id || null,
        valvulopatia_id: principalEsValvulopatia ? valores.valvulopatia_id || null : null,
        riesgo_ids: valores.riesgo_ids,
        riesgo_especificaciones: especificacionesElegidas(valores.riesgo_ids, valores.riesgo_especificaciones),
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['diagnostico', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
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
                categoria="DIAGNOSTICO"
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

              <DiagnosticosAdicionales control={control} setValue={setValue} categoria="DIAGNOSTICO" esValvulopatia={esValvulopatias} />
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Riesgo quirúrgico">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Campo etiqueta="Escala RACHS-1 *">
                  <SelectOpciones categoria="RACHS" control={control} name="rachs_id" />
                </Campo>
              </div>

              <div role="group" aria-labelledby="etiqueta-riesgos">
                <p id="etiqueta-riesgos" className="mb-2 text-sm font-medium text-slate-700">
                  Factores de riesgo *
                </p>
                <SeleccionMultiple
                  categoria="RIESGOS"
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
