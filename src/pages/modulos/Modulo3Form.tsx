import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseAccionCampo, claseBotonAgregar, claseInput } from '../../components/Campo'
import { FilaProcedimiento } from '../../components/FilaProcedimiento'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { IconoCerrar, IconoMas } from '../../components/iconos'
import { SeleccionMultiple } from '../../components/SeleccionMultiple'
import { calcularEstadoModulo3 } from '../../lib/completitud'
import { especificacionesElegidas, sinEspecificar, useEsOpcionOtro } from '../../lib/opciones'
import { implantesParaCompletitud, procedimientosIniciales, procedimientosParaGuardar, type ProcedimientoFormulario } from '../../lib/procedimientos'
import { api, mensajeDe } from '../../lib/api'
import type { PacienteDetalle, ProcedimientoGuardado } from '../../types/db'
import { Cargando, MensajeError } from '../../components/Estados'

interface CirugiaDetalle {
  id: string
  fecha_cirugia: string | null
  uso_cec: 'SI' | 'NO' | null
  tiempo_cec_min: number | null
  tiempo_clamp_min: number | null
  cierre_esternal_diferido: 'SI' | 'NO' | null
  extubacion_quirofano: 'SI' | 'NO' | null
  estado_modulo: string
  procedimientos: ProcedimientoGuardado[]
  complicacion_intraqx_ids: string[]
  complicacion_intraqx_especificaciones: Record<string, string>
}

interface Valores {
  fecha_cirugia: string
  /** Siempre tres lugares: los procedimientos 2 y 3 sin agregar quedan vacíos. */
  procedimientos: ProcedimientoFormulario[]
  uso_cec: 'SI' | 'NO' | ''
  tiempo_cec_min: string
  tiempo_clamp_min: string
  complicacion_intraqx_ids: string[]
  complicacion_intraqx_especificaciones: Record<string, string>
  cierre_esternal_diferido: 'SI' | 'NO' | ''
  extubacion_quirofano: 'SI' | 'NO' | ''
}

const PROCEDIMIENTO_VACIO: ProcedimientoFormulario = { procedimiento_id: '', especificacion: '', implante: '', tipo_implante_id: '', numero_implante: '', numero_implante_no_aplica: false }

function useCirugia(pacienteId: string) {
  return useQuery({
    queryKey: ['cirugia', pacienteId],
    queryFn: async (): Promise<{ cirugia: CirugiaDetalle | null; fechaNacimiento: string | null }> => {
      const [cirugia, paciente] = await Promise.all([
        api.get<CirugiaDetalle | null>(`/pacientes/${pacienteId}/cirugia`),
        api.get<PacienteDetalle>(`/pacientes/${pacienteId}`),
      ])
      return { cirugia, fechaNacimiento: paciente.fecha_nacimiento }
    },
  })
}

function valoresIniciales(cirugia: CirugiaDetalle | null): Valores {
  return {
    fecha_cirugia: cirugia?.fecha_cirugia ?? '',
    procedimientos: procedimientosIniciales(cirugia?.procedimientos ?? []),
    uso_cec: cirugia?.uso_cec ?? '',
    tiempo_cec_min: cirugia?.tiempo_cec_min?.toString() ?? '',
    tiempo_clamp_min: cirugia?.tiempo_clamp_min?.toString() ?? '',
    complicacion_intraqx_ids: cirugia?.complicacion_intraqx_ids ?? [],
    complicacion_intraqx_especificaciones: cirugia?.complicacion_intraqx_especificaciones ?? {},
    cierre_esternal_diferido: cirugia?.cierre_esternal_diferido ?? '',
    extubacion_quirofano: cirugia?.extubacion_quirofano ?? '',
  }
}

export function Modulo3Form({ pacienteId }: { pacienteId: string }) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const esOtro = useEsOpcionOtro()
  const { data, isLoading } = useCirugia(pacienteId)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  const [camposFaltantes, setCamposFaltantes] = useState<string[]>([])

  const { register, handleSubmit, watch, reset, setValue, control } = useForm<Valores>({
    defaultValues: valoresIniciales(data?.cirugia ?? null),
  })

  // El procedimiento 2 y el 3 quedan ocultos hasta que se agregan. Todos van con la fecha de cirugía:
  // la fecha propia de cada uno se quitó el 30-oct.
  const [mostrarP2, setMostrarP2] = useState(!!data?.cirugia?.procedimientos[1])
  const [mostrarP3, setMostrarP3] = useState(!!data?.cirugia?.procedimientos[2])

  useEffect(() => {
    if (data) {
      reset(valoresIniciales(data.cirugia))
      setMostrarP2(!!data.cirugia?.procedimientos[1])
      setMostrarP3(!!data.cirugia?.procedimientos[2])
    }
  }, [data, reset])

  const usoCec = watch('uso_cec')
  const complicacionIntraqxIds = watch('complicacion_intraqx_ids')
  const complicacionIntraqxEspecificaciones = watch('complicacion_intraqx_especificaciones')
  const [p1, p2, p3] = watch('procedimientos').map((p) => p.procedimiento_id)

  if (isLoading) return <Cargando />

  const repetido =
    (!!p1 && !!p2 && p1 === p2) || (!!p1 && !!p3 && p1 === p3) || (!!p2 && !!p3 && p2 === p3)

  function quitarProcedimiento2() {
    setValue('procedimientos.1', { ...PROCEDIMIENTO_VACIO })
    setMostrarP2(false)
    quitarProcedimiento3()
  }

  function quitarProcedimiento3() {
    setValue('procedimientos.2', { ...PROCEDIMIENTO_VACIO })
    setMostrarP3(false)
  }

  async function onSubmit(valores: Valores) {
    if (!perfil) return
    setGuardadoEn(null)
    setCamposFaltantes([])
    const [v1, v2, v3] = valores.procedimientos.map((p) => p.procedimiento_id)
    if (data?.fechaNacimiento && valores.fecha_cirugia && valores.fecha_cirugia < data.fechaNacimiento) {
      setError('La fecha de cirugía no puede ser anterior a la fecha de nacimiento.')
      return
    }
    if ((!!v1 && !!v2 && v1 === v2) || (!!v1 && !!v3 && v1 === v3) || (!!v2 && !!v3 && v2 === v3)) {
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

    const elegidos = valores.procedimientos.filter((p) => p.procedimiento_id)
    const { estado: estado_modulo, faltantes } = calcularEstadoModulo3({
      sinEspecificar: sinEspecificar([
        ...elegidos.map((p, i) => ({ etiqueta: `Procedimiento quirúrgico ${i + 1}`, esOtro: esOtro('PROCEDIMIENTOS', p.procedimiento_id), texto: p.especificacion })),
        ...valores.complicacion_intraqx_ids.map((id) => ({
          etiqueta: 'Complicación intraquirúrgica', esOtro: esOtro('COMPLICACION_INTRAQX', id), texto: valores.complicacion_intraqx_especificaciones[id],
        })),
      ]),
      fechaCirugia: valores.fecha_cirugia,
      procedimiento1Id: v1,
      procedimientos: implantesParaCompletitud(elegidos),
      usoCec: valores.uso_cec,
      tiempoCecMin: valores.tiempo_cec_min,
    })
    setCamposFaltantes(faltantes)

    try {
      await api.put(`/pacientes/${pacienteId}/cirugia`, {
        fecha_cirugia: valores.fecha_cirugia || null,
        procedimientos: procedimientosParaGuardar(valores.procedimientos, (id) => esOtro('PROCEDIMIENTOS', id)),
        uso_cec: valores.uso_cec || null,
        tiempo_cec_min: valores.uso_cec === 'SI' && valores.tiempo_cec_min ? Number(valores.tiempo_cec_min) : null,
        tiempo_clamp_min: valores.uso_cec === 'SI' && valores.tiempo_clamp_min ? Number(valores.tiempo_clamp_min) : null,
        complicacion_intraqx_ids: valores.complicacion_intraqx_ids,
        complicacion_intraqx_especificaciones: especificacionesElegidas(valores.complicacion_intraqx_ids, valores.complicacion_intraqx_especificaciones),
        cierre_esternal_diferido: valores.cierre_esternal_diferido || null,
        extubacion_quirofano: valores.extubacion_quirofano || null,
        estado_modulo,
      })
      queryClient.invalidateQueries({ queryKey: ['cirugia', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      queryClient.invalidateQueries({ queryKey: ['paciente-resumen', pacienteId] })
      setGuardadoEn(new Date())
    } catch (causa) {
      setError(mensajeDe(causa, 'No se pudo guardar el Módulo 3.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <fieldset className="space-y-5">
        <div className="space-y-5">
          <SeccionFormulario titulo="Procedimientos realizados">
            <div className="space-y-4">
              <FilaProcedimiento
                control={control}
                indice={0}
                categoria="PROCEDIMIENTOS"
                etiqueta="Procedimiento quirúrgico 1 *"
                fecha={
                  <Campo etiqueta="Fecha de cirugía *">
                    <input type="date" min={data?.fechaNacimiento ?? undefined} {...register('fecha_cirugia')} className={claseInput} />
                  </Campo>
                }
              />

              {/* Cada procedimiento adicional se habilita al agregarlo; va con la fecha de cirugía. */}
              {mostrarP2 && (
                <FilaProcedimiento
                  control={control}
                  indice={1}
                  categoria="PROCEDIMIENTOS"
                  etiqueta="Procedimiento quirúrgico 2 *"
                  accion={
                    <button type="button" onClick={quitarProcedimiento2} aria-label="Quitar procedimiento 2" className={claseAccionCampo}>
                      <IconoCerrar className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  }
                />
              )}

              {mostrarP2 && mostrarP3 && (
                <FilaProcedimiento
                  control={control}
                  indice={2}
                  categoria="PROCEDIMIENTOS"
                  etiqueta="Procedimiento quirúrgico 3 *"
                  accion={
                    <button type="button" onClick={quitarProcedimiento3} aria-label="Quitar procedimiento 3" className={claseAccionCampo}>
                      <IconoCerrar className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  }
                />
              )}

              {!(mostrarP2 && mostrarP3) && (
                <button
                  type="button"
                  disabled={mostrarP2 ? !p2 : !p1}
                  onClick={() => (mostrarP2 ? setMostrarP3(true) : setMostrarP2(true))}
                  title={(mostrarP2 ? !p2 : !p1) ? 'Elija primero el procedimiento anterior' : undefined}
                  className={claseBotonAgregar}
                >
                  <IconoMas className="h-4 w-4" strokeWidth={2.2} />
                  Agregar otro procedimiento quirúrgico
                </button>
              )}
              {repetido && <MensajeError>Los procedimientos no pueden repetirse.</MensajeError>}
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Circulación extracorpórea (CEC)">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
              <Campo etiqueta="Uso de CEC">
                <select {...register('uso_cec')} className={claseInput}>
                  <option value="">Seleccione…</option>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                </select>
              </Campo>
              <Campo etiqueta="Tiempo de CEC (min)">
                <input type="number" min="0" disabled={usoCec !== 'SI'} {...register('tiempo_cec_min')} className={claseInput} />
              </Campo>
              <Campo etiqueta="Tiempo de clamp de aorta (min)">
                <input type="number" min="0" disabled={usoCec !== 'SI'} {...register('tiempo_clamp_min')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Eventos en quirófano">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Complicación intraquirúrgica</label>
                <SeleccionMultiple
                  categoria="COMPLICACION_INTRAQX"
                  codigoExcluyente="NINGUNA"
                  value={complicacionIntraqxIds}
                  onChange={(v) => setValue('complicacion_intraqx_ids', v)}
                  especificaciones={complicacionIntraqxEspecificaciones}
                  onEspecificar={(id, texto) => setValue('complicacion_intraqx_especificaciones', { ...complicacionIntraqxEspecificaciones, [id]: texto })}
                />
              </div>
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
          </SeccionFormulario>
        </div>

        {error && <MensajeError>{error}</MensajeError>}

        <PieFormulario etiqueta="Guardar Módulo 3" guardando={guardando} guardadoEn={guardadoEn} faltantes={camposFaltantes} />
      </fieldset>
    </form>
  )
}
