import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthProvider'
import { Campo, claseInput, claseBotonPrimario } from '../../components/Campo'
import { AvisoSoloLectura } from '../../components/Estados'
import { SelectOpciones } from '../../components/SelectOpciones'
import { useOpciones } from '../../hooks/useOpciones'
import { calcularEstadoModulo1 } from '../../lib/completitud'
import { hoyIso } from '../../lib/fechas'
import { api, mensajeDe } from '../../lib/api'
import type { PacienteDetalle } from '../../types/db'

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
      .refine((v) => v <= hoyIso(), 'La fecha de nacimiento no puede ser futura'),
    peso_kg: z.string(),
    talla_cm: z.string(),
    procedencia_id: z.string(),
    municipio_narino_id: z.string(),
    sin_telefono: z.boolean(),
    telefonos: z.array(z.string()),
    eps_id: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.peso_kg && (Number(v.peso_kg) < 0.5 || Number(v.peso_kg) > 150)) {
      ctx.addIssue({ code: 'custom', message: 'El peso debe estar entre 0.5 y 150 kg', path: ['peso_kg'] })
    }
    if (v.talla_cm && (Number(v.talla_cm) < 30 || Number(v.talla_cm) > 220)) {
      ctx.addIssue({ code: 'custom', message: 'La talla debe estar entre 30 y 220 cm', path: ['talla_cm'] })
    }
  })

type Valores = z.infer<typeof esquema>

function valoresIniciales(paciente: PacienteDetalle | null): Valores {
  return {
    nombre_completo: paciente?.nombre_completo ?? '',
    identificacion: paciente?.identificacion ?? '',
    sexo_id: paciente?.sexo_id ?? '',
    fecha_nacimiento: paciente?.fecha_nacimiento ?? '',
    peso_kg: paciente?.peso_kg?.toString() ?? '',
    talla_cm: paciente?.talla_cm?.toString() ?? '',
    procedencia_id: paciente?.procedencia_id ?? '',
    municipio_narino_id: paciente?.municipio_narino_id ?? '',
    sin_telefono: paciente?.sin_telefono ?? false,
    telefonos: paciente?.telefonos && paciente.telefonos.length > 0 ? paciente.telefonos : [''],
    eps_id: paciente?.eps_id ?? '',
  }
}

interface Props {
  paciente: PacienteDetalle | null
  onGuardado: (pacienteId: string) => void
}

export function Modulo1Form({ paciente, onGuardado }: Props) {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const { data: opcionesProcedencia } = useOpciones('PROCEDENCIA')
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

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
  const sinTelefono = watch('sin_telefono')
  const telefonos = watch('telefonos')

  const narinioId = opcionesProcedencia?.find((o) => o.codigo === 'NARINO')?.id
  const procedenciaEsNarino = !!narinioId && procedenciaId === narinioId

  useEffect(() => {
    // Mientras PROCEDENCIA no ha cargado, narinioId es undefined y procedenciaEsNarino da un
    // falso "no es Nariño": sin el guard de abajo, esto borraría el municipio ya guardado del
    // paciente antes de que reset() llegue a fijarlo (o justo después).
    if (opcionesProcedencia && !procedenciaEsNarino) setValue('municipio_narino_id', '')
  }, [procedenciaEsNarino, opcionesProcedencia, setValue])

  async function onSubmit(valores: Valores) {
    if (!perfil || !puedeEditar) return
    setErrorGuardado(null)
    setGuardando(true)

    const telefonosLimpios = valores.sin_telefono
      ? []
      : valores.telefonos.map((t) => t.trim()).filter(Boolean)

    const estado_modulo = calcularEstadoModulo1({
      nombreCompleto: valores.nombre_completo,
      identificacion: valores.identificacion,
      fechaNacimiento: valores.fecha_nacimiento,
      procedenciaEsNarino,
      municipioNarinoId: valores.municipio_narino_id,
      sinTelefono: valores.sin_telefono,
      telefonos: telefonosLimpios,
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
      sin_telefono: valores.sin_telefono,
      telefonos: telefonosLimpios,
      eps_id: valores.eps_id || null,
      estado_modulo,
    }

    try {
      if (paciente) {
        await api.put(`/pacientes/${paciente.id}`, payload)
        queryClient.invalidateQueries({ queryKey: ['paciente', paciente.id] })
        queryClient.invalidateQueries({ queryKey: ['pacientes'] })
        queryClient.invalidateQueries({ queryKey: ['paciente-resumen', paciente.id] })
        onGuardado(paciente.id)
      } else {
        const { id } = await api.post<{ id: string }>('/pacientes', payload)
        queryClient.invalidateQueries({ queryKey: ['pacientes'] })
        onGuardado(id)
      }
    } catch (causa) {
      setErrorGuardado(mensajeDe(causa, 'No se pudo guardar el Módulo 1.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
      {!puedeEditar && <AvisoSoloLectura />}
      <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo *" error={errors.nombre_completo?.message} className="sm:col-span-2">
          <input {...register('nombre_completo')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Identificación *" error={errors.identificacion?.message}>
          <input {...register('identificacion')} inputMode="numeric" className={claseInput} />
        </Campo>

        <Campo etiqueta="Sexo">
          <SelectOpciones categoria="SEXO" control={control} name="sexo_id" />
        </Campo>

        <Campo etiqueta="Fecha de nacimiento *" error={errors.fecha_nacimiento?.message}>
          <input type="date" max={hoyIso()} {...register('fecha_nacimiento')} className={claseInput} />
        </Campo>

        <Campo etiqueta="EPS">
          <SelectOpciones categoria="EPS" control={control} name="eps_id" />
        </Campo>

        <Campo etiqueta="Peso (kg)" error={errors.peso_kg?.message}>
          <input type="number" min="0.5" max="150" step="0.1" {...register('peso_kg')} className={claseInput} />
        </Campo>

        <Campo etiqueta="Talla (cm)" error={errors.talla_cm?.message}>
          <input type="number" min="30" max="220" step="1" {...register('talla_cm')} className={claseInput} />
        </Campo>

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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Teléfono(s)
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" {...register('sin_telefono')} />
          No tiene teléfono
        </label>
        {!sinTelefono && (
          <div className="space-y-2">
            {telefonos.map((_, i) => (
              <div key={i} className="flex gap-2">
                <input
                  {...register(`telefonos.${i}`)}
                  placeholder="Número de teléfono"
                  className={claseInput}
                />
                {telefonos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setValue('telefonos', telefonos.filter((_, j) => j !== i))}
                    className="rounded-md px-2 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setValue('telefonos', [...telefonos, ''])}
              className="text-sm text-sky-600 hover:underline"
            >
              + Agregar otro número
            </button>
          </div>
        )}
      </div>

      {errorGuardado && <p className="text-sm text-red-600">{errorGuardado}</p>}

      <button
        type="submit"
        disabled={guardando}
        className={claseBotonPrimario}
      >
        {guardando ? 'Guardando…' : 'Guardar Módulo 1'}
      </button>
      </fieldset>
    </form>
  )
}
