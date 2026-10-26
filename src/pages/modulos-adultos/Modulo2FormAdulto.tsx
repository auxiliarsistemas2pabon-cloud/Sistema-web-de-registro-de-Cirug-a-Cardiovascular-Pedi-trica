import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { CampoOpciones } from '../../components/CampoOpciones'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo2Adulto } from '../../lib/completitud'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { api, mensajeDe } from '../../lib/api'
import type { DiagnosticoAdultoDetalle } from '../../types/db'
import { Cargando, MensajeError } from '../../components/Estados'

interface Valores {
  diagnostico_id: string
  diagnostico_otro: string
  diagnostico_adicional_id: string
  diagnostico_adicional_otro: string
  valvulopatia_id: string
  euroscore: string
  riesgo_ids: string[]
  riesgo_especificaciones: Record<string, string>
}

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
    diagnostico_adicional_id: diagnostico?.diagnostico_adicional_id ?? '',
    diagnostico_adicional_otro: diagnostico?.diagnostico_adicional_otro ?? '',
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
  const diagnosticoAdicionalId = watch('diagnostico_adicional_id')
  const riesgoIds = watch('riesgo_ids')
  const riesgoEspecificaciones = watch('riesgo_especificaciones')
  // A diferencia del módulo pediátrico (un único código 'VALVULOPATIAS'), aquí hay tres
  // diagnósticos que implican valvulopatía ("Valvulopatía", "Arritmia cardíaca + valvulopatía",
  // "Enfermedad coronaria + valvulopatía"), así que se detecta por texto, igual que en el backend
  // (servicios-adultos.mjs, diagnosticoMencionaValvulopatia) para que ambos lados coincidan siempre.
  // Vale tanto para el diagnóstico principal como para el adicional.
  const esValvulopatia = [diagnosticoId, diagnosticoAdicionalId].some(
    (id) => !!id && /valvulopat/i.test(opcionesDiagnostico?.find((o) => o.id === id)?.valor ?? ''),
  )
  const adicionalRepetido = !!diagnosticoAdicionalId && diagnosticoAdicionalId === diagnosticoId

  useEffect(() => {
    // Mismo guard que Modulo2Form (pediátrico): exigir diagnosticoId evita que este efecto borre
    // valvulopatia_id en el mismo ciclo en que reset() recién la puso, antes de que `watch` la vea.
    if (diagnosticoId && opcionesDiagnostico && !esValvulopatia) setValue('valvulopatia_id', '')
  }, [diagnosticoId, esValvulopatia, opcionesDiagnostico, setValue])

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
      diagnostico: esOtro('DIAGNOSTICO_ADULTO', valores.diagnostico_id),
      adicional: esOtro('DIAGNOSTICO_ADULTO', valores.diagnostico_adicional_id),
    }
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo2Adulto({
      sinEspecificar: sinEspecificar([
        { etiqueta: 'Diagnóstico', esOtro: especificar.diagnostico, texto: valores.diagnostico_otro },
        { etiqueta: 'Diagnóstico adicional', esOtro: especificar.adicional, texto: valores.diagnostico_adicional_otro },
        ...valores.riesgo_ids.map((id) => ({ etiqueta: 'Factores de riesgo', esOtro: esOtro('RIESGOS_ADULTO', id), texto: valores.riesgo_especificaciones[id] })),
      ]),
      diagnosticoId: valores.diagnostico_id,
      euroscore: valores.euroscore,
      diagnosticoEsValvulopatia: esValvulopatia,
      valvulopatiaId: valores.valvulopatia_id,
      riesgoIds: valores.riesgo_ids,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes-adultos/${pacienteId}/episodios/${episodioId}/diagnostico`, {
        diagnostico_id: valores.diagnostico_id || null,
        diagnostico_otro: especificar.diagnostico ? valores.diagnostico_otro.trim() || null : null,
        diagnostico_adicional_id: valores.diagnostico_id ? valores.diagnostico_adicional_id || null : null,
        diagnostico_adicional_otro: especificar.adicional ? valores.diagnostico_adicional_otro.trim() || null : null,
        valvulopatia_id: esValvulopatia ? valores.valvulopatia_id || null : null,
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
                  disabled={!esValvulopatia}
                  placeholder={esValvulopatia ? 'Seleccione…' : 'N/A'}
                />
              </Campo>

              {/* Un segundo diagnóstico, de la misma lista: solo junto a un principal. */}
              <CampoOpciones
                etiqueta="Diagnóstico adicional"
                categoria="DIAGNOSTICO_ADULTO"
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
