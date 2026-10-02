import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput } from '../../components/Campo'
import { AvisoSoloLectura, MensajeError } from '../../components/Estados'
import { PieFormulario, SeccionFormulario } from '../../components/FormularioModulo'
import { SelectOpciones } from '../../components/SelectOpciones'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo1Adulto } from '../../lib/completitud'
import { edadMinimaIso, hoyIso } from '../../lib/fechas'
import { api, mensajeDe } from '../../lib/api'
import type { PacienteAdultoDetalle } from '../../types/db'

const esquema = z
  .object({
    nombre_completo: z.string().trim().min(1, 'El nombre completo es obligatorio'),
    identificacion: z
      .string()
      .trim()
      .min(1, 'La identificación es obligatoria')
      .regex(/^[0-9]+$/, 'Solo se permiten números'),
    sexo_id: z.string(),
    fecha_nacimiento: z
      .string()
      .min(1, 'La fecha de nacimiento es obligatoria')
      .refine((v) => v <= hoyIso(), 'La fecha de nacimiento no puede ser futura')
      .refine((v) => v <= edadMinimaIso(18), 'El paciente debe ser mayor de edad (18 años o más)'),
    peso_kg: z.string(),
    talla_cm: z.string(),
    procedencia_id: z.string(),
    municipio_narino_id: z.string(),
    telefono: z.string(),
    eps_id: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.peso_kg && (Number(v.peso_kg) < 30 || Number(v.peso_kg) > 300)) {
      ctx.addIssue({ code: 'custom', message: 'El peso debe estar entre 30 y 300 kg', path: ['peso_kg'] })
    }
    if (v.talla_cm && (Number(v.talla_cm) < 120 || Number(v.talla_cm) > 230)) {
      ctx.addIssue({ code: 'custom', message: 'La talla debe estar entre 120 y 230 cm', path: ['talla_cm'] })
    }
  })

type Valores = z.infer<typeof esquema>

function valoresIniciales(paciente: PacienteAdultoDetalle | null): Valores {
  return {
    nombre_completo: paciente?.nombre_completo ?? '',
    identificacion: paciente?.identificacion ?? '',
    sexo_id: paciente?.sexo_id ?? '',
    fecha_nacimiento: paciente?.fecha_nacimiento ?? '',
    peso_kg: paciente?.peso_kg?.toString() ?? '',
    talla_cm: paciente?.talla_cm?.toString() ?? '',
    procedencia_id: paciente?.procedencia_id ?? '',
    municipio_narino_id: paciente?.municipio_narino_id ?? '',
    telefono: paciente?.telefono ?? '',
    eps_id: paciente?.eps_id ?? '',
  }
}

interface Props {
  paciente: PacienteAdultoDetalle | null
  onGuardado: (pacienteId: string) => void
}

export function Modulo1FormAdulto({ paciente, onGuardado }: Props) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data: opcionesProcedencia } = useOpciones('PROCEDENCIA')
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(paciente),
  })

  useEffect(() => {
    reset(valoresIniciales(paciente))
  }, [paciente, reset])

  const procedenciaId = watch('procedencia_id')

  const narinioId = opcionesProcedencia?.find((o) => o.codigo === 'NARINO')?.id
  const procedenciaEsNarino = !!narinioId && procedenciaId === narinioId

  useEffect(() => {
    // Mismo guard que en el módulo pediátrico (Modulo1Form): mientras PROCEDENCIA no ha cargado,
    // narinioId es undefined y procedenciaEsNarino da un falso "no es Nariño" que borraría el
    // municipio ya guardado antes de que reset() lo fije.
    if (opcionesProcedencia && !procedenciaEsNarino) setValue('municipio_narino_id', '')
  }, [procedenciaEsNarino, opcionesProcedencia, setValue])

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setErrorGuardado(null)
    setGuardadoEn(null)
    setGuardando(true)

    const estado_modulo = calcularEstadoModulo1Adulto({
      nombreCompleto: valores.nombre_completo,
      identificacion: valores.identificacion,
      fechaNacimiento: valores.fecha_nacimiento,
      procedenciaEsNarino,
      municipioNarinoId: valores.municipio_narino_id,
    })

    const payload = {
      nombre_completo: valores.nombre_completo.trim(),
      identificacion: valores.identificacion.trim(),
      sexo_id: valores.sexo_id || null,
      fecha_nacimiento: valores.fecha_nacimiento,
      peso_kg: valores.peso_kg ? Number(valores.peso_kg) : null,
      talla_cm: valores.talla_cm ? Number(valores.talla_cm) : null,
      procedencia_id: valores.procedencia_id || null,
      municipio_narino_id: procedenciaEsNarino ? valores.municipio_narino_id || null : null,
      telefono: valores.telefono.trim() || null,
      eps_id: valores.eps_id || null,
      estado_modulo,
    }

    try {
      if (paciente) {
        await api.put(`/pacientes-adultos/${paciente.id}`, payload)
        queryClient.invalidateQueries({ queryKey: ['paciente-adulto', paciente.id] })
        queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
        queryClient.invalidateQueries({ queryKey: ['paciente-adulto-resumen', paciente.id] })
        setGuardadoEn(new Date())
        onGuardado(paciente.id)
      } else {
        const { id } = await api.post<{ id: string }>('/pacientes-adultos', payload)
        queryClient.invalidateQueries({ queryKey: ['pacientes-adultos'] })
        onGuardado(id)
      }
    } catch (causa) {
      setErrorGuardado(mensajeDe(causa, 'No se pudo guardar el Módulo 1.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-5 disabled:opacity-70">
        <div className="space-y-5">
          <SeccionFormulario titulo="Datos personales">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Nombre completo *" error={errors.nombre_completo?.message} className="sm:col-span-2 lg:col-span-3">
                <input {...register('nombre_completo')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Identificación *" error={errors.identificacion?.message}>
                <input {...register('identificacion')} inputMode="numeric" className={claseInput} />
              </Campo>

              <Campo etiqueta="Sexo">
                <SelectOpciones categoria="SEXO" control={control} name="sexo_id" />
              </Campo>

              <Campo etiqueta="Fecha de nacimiento *" error={errors.fecha_nacimiento?.message}>
                <input type="date" max={edadMinimaIso(18)} {...register('fecha_nacimiento')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Salud y afiliación">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="EPS" className="sm:col-span-2 lg:col-span-1">
                <SelectOpciones categoria="EPS" control={control} name="eps_id" />
              </Campo>

              <Campo etiqueta="Peso (kg)" error={errors.peso_kg?.message}>
                <input type="number" min="30" max="300" step="0.1" {...register('peso_kg')} className={claseInput} />
              </Campo>

              <Campo etiqueta="Talla (cm)" error={errors.talla_cm?.message}>
                <input type="number" min="120" max="230" step="1" {...register('talla_cm')} className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>

          <SeccionFormulario titulo="Procedencia y contacto">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Procedencia">
                <SelectOpciones categoria="PROCEDENCIA" control={control} name="procedencia_id" />
              </Campo>

              <Campo etiqueta="Municipio de Nariño" error={errors.municipio_narino_id?.message}>
                <SelectOpciones
                  categoria="MUNICIPIOS"
                  control={control} name="municipio_narino_id"
                  disabled={!procedenciaEsNarino}
                  placeholder={procedenciaEsNarino ? 'Seleccione…' : 'N/A'}
                />
              </Campo>

              <Campo etiqueta="Teléfono" className="sm:col-span-2 lg:col-span-1">
                <input {...register('telefono')} placeholder="Número de teléfono" inputMode="tel" className={claseInput} />
              </Campo>
            </div>
          </SeccionFormulario>
        </div>

        {errorGuardado && <MensajeError>{errorGuardado}</MensajeError>}

        {puedeEditar && <PieFormulario etiqueta="Guardar Módulo 1" guardando={guardando} guardadoEn={guardadoEn} />}
      </fieldset>
    </form>
  )
}
