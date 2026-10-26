import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2 } from '../../lib/completitud'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoDetalle } from '../../types/db'
import { Cargando, MensajeError } from '../../components/Estados'

interface Valores {
  diagnostico_id: string
  diagnostico_otro: string
  diagnostico_adicional_id: string
  diagnostico_adicional_otro: string
  valvulopatia_id: string
  rachs_id: string
  riesgo_ids: string[]
  riesgo_especificaciones: Record<string, string>
}

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
    diagnostico_adicional_id: diagnostico?.diagnostico_adicional_id ?? '',
    diagnostico_adicional_otro: diagnostico?.diagnostico_adicional_otro ?? '',
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
  const diagnosticoAdicionalId = watch('diagnostico_adicional_id')
  const riesgoIds = watch('riesgo_ids')
  const riesgoEspecificaciones = watch('riesgo_especificaciones')
  // La valvulopatía aplica si el diagnóstico principal o el adicional es Valvulopatías (misma regla que
  // guardarDiagnostico en server/servicios.mjs).
  const esValvulopatias = [diagnosticoId, diagnosticoAdicionalId].some(
    (id) => !!id && opcionesDiagnostico?.find((o) => o.id === id)?.codigo === 'VALVULOPATIAS',
  )
  const adicionalRepetido = !!diagnosticoAdicionalId && diagnosticoAdicionalId === diagnosticoId

  useEffect(() => {
    // Exigir diagnosticoId (no solo que las opciones/`data` ya hayan llegado) es lo que importa:
    // cuando `data` llega, este efecto y el de reset() arriba corren en el mismo ciclo de efectos,
    // y `diagnosticoId` (leído por `watch` durante el render, antes de que reset() corriera) sigue
    // en su valor por defecto (''). Eso da un falso esValvulopatias=false y borra valvulopatia_id
    // justo después de que reset() la puso en su valor correcto. Exigir diagnosticoId aquí hace que
    // este efecto se salte esa vuelta y solo actúe una vez que el formulario ya tiene el diagnóstico
    // real (reset ya corrido), sea en la carga inicial o cuando el usuario cambia el diagnóstico.
    if (diagnosticoId && opcionesDiagnostico && !esValvulopatias) setValue('valvulopatia_id', '')
  }, [diagnosticoId, esValvulopatias, opcionesDiagnostico, setValue])

  if (isLoading) return <Cargando />

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setGuardadoEn(null)
    setCamposFaltantes([])
    if (valores.diagnostico_adicional_id && valores.diagnostico_adicional_id === valores.diagnostico_id) {
      setErrorGuardado('El diagnóstico adicional no puede ser el mismo diagnóstico principal.')
      return
    }
    setErrorGuardado(null)
    setGuardando(true)

    const especificar = {
      diagnostico: esOtro('DIAGNOSTICO', valores.diagnostico_id),
      adicional: esOtro('DIAGNOSTICO', valores.diagnostico_adicional_id),
    }
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo2({
      sinEspecificar: sinEspecificar([
        { etiqueta: 'Diagnóstico', esOtro: especificar.diagnostico, texto: valores.diagnostico_otro },
        { etiqueta: 'Diagnóstico adicional', esOtro: especificar.adicional, texto: valores.diagnostico_adicional_otro },
        ...valores.riesgo_ids.map((id) => ({ etiqueta: 'Factores de riesgo', esOtro: esOtro('RIESGOS', id), texto: valores.riesgo_especificaciones[id] })),
      ]),
      diagnosticoId: valores.diagnostico_id,
      rachsId: valores.rachs_id,
      diagnosticoEsValvulopatias: esValvulopatias,
      valvulopatiaId: valores.valvulopatia_id,
      riesgoIds: valores.riesgo_ids,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes/${pacienteId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        diagnostico_otro: especificar.diagnostico ? valores.diagnostico_otro.trim() || null : null,
        diagnostico_adicional_id: valores.diagnostico_id ? valores.diagnostico_adicional_id || null : null,
        diagnostico_adicional_otro: especificar.adicional ? valores.diagnostico_adicional_otro.trim() || null : null,
        rachs_id: valores.rachs_id || null,
        valvulopatia_id: esValvulopatias ? valores.valvulopatia_id || null : null,
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
                  disabled={!esValvulopatias}
                  placeholder={esValvulopatias ? 'Seleccione…' : 'N/A'}
                />
              </Campo>

              {/* Un segundo diagnóstico, de la misma lista: solo junto a un principal. */}
              <CampoOpciones
                etiqueta="Diagnóstico adicional"
                categoria="DIAGNOSTICO"
                control={control}
                name="diagnostico_adicional_id"
                nameOtro="diagnostico_adicional_otro"
                buscable
                permiteCrear
                disabled={!diagnosticoId}
                placeholder={diagnosticoId ? 'Opcional: busque otro diagnóstico…' : 'Elija primero el diagnóstico principal'}
                error={adicionalRepetido ? 'No puede ser el mismo diagnóstico principal.' : undefined}
                className="sm:col-span-2"
              />
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
