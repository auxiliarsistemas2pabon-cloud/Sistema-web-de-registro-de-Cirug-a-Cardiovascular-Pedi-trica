import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EstadoModuloChip } from '../components/EstadoModuloChip'
import { api } from '../lib/api'
import { formatearEdad } from '../lib/fechas'
import type { PacienteDetalle, PacienteResumen } from '../types/db'
import { Modulo1Form } from './modulos/Modulo1Form'
import { Modulo2Form } from './modulos/Modulo2Form'
import { Modulo3Form } from './modulos/Modulo3Form'
import { Modulo4Form } from './modulos/Modulo4Form'
import { Modulo5Form } from './modulos/Modulo5Form'

const PESTANAS = [
  { clave: 1, etiqueta: 'Datos del paciente' },
  { clave: 2, etiqueta: 'Diagnóstico y riesgo' },
  { clave: 3, etiqueta: 'Procedimiento quirúrgico' },
  { clave: 4, etiqueta: 'Postoperatorio y egreso' },
  { clave: 5, etiqueta: 'Seguimiento post-egreso' },
] as const

function usePaciente(id: string | undefined) {
  return useQuery({
    queryKey: ['paciente', id],
    enabled: !!id && id !== 'nuevo',
    queryFn: () => api.get<PacienteDetalle>(`/pacientes/${id}`),
  })
}

function useResumenEdad(id: string | undefined) {
  return useQuery({
    queryKey: ['paciente-resumen', id],
    enabled: !!id && id !== 'nuevo',
    queryFn: () =>
      api.get<Pick<PacienteResumen, 'edad_dias' | 'diagnostico_valor' | 'estado_m1' | 'estado_m2' | 'estado_m3' | 'estado_m4' | 'estado_m5'>>(
        `/pacientes/${id}/resumen`,
      ),
  })
}

export function PacienteFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const esNuevo = !id || id === 'nuevo'
  const [pestanaActiva, setPestanaActiva] = useState<number>(1)

  const { data: paciente, isLoading, error } = usePaciente(id)
  const { data: resumen } = useResumenEdad(id)

  if (!esNuevo && isLoading) return <p className="text-sm text-slate-500">Cargando…</p>
  if (!esNuevo && error) return <p className="text-sm text-red-600">No se pudo cargar el paciente.</p>

  const estados = {
    1: paciente?.estado_modulo,
    2: resumen?.estado_m2,
    3: resumen?.estado_m3,
    4: resumen?.estado_m4,
    5: resumen?.estado_m5,
  } as const

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {esNuevo ? 'Nuevo paciente' : paciente?.nombre_completo}
        </h1>
        {!esNuevo && paciente && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            N° {paciente.numero_paciente} · Identificación {paciente.identificacion} ·{' '}
            {formatearEdad(resumen?.edad_dias)} · {resumen?.diagnostico_valor ?? 'Sin diagnóstico'}
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
        {PESTANAS.map((p) => {
          const bloqueada = esNuevo && p.clave !== 1
          const estado = estados[p.clave]
          return (
            <button
              key={p.clave}
              type="button"
              disabled={bloqueada}
              onClick={() => setPestanaActiva(p.clave)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                pestanaActiva === p.clave
                  ? 'border-sky-600 text-sky-700 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              } ${bloqueada ? 'cursor-not-allowed opacity-40' : ''}`}
              title={bloqueada ? 'Guarda primero el Módulo 1' : undefined}
            >
              {p.etiqueta}
              {estado && <EstadoModuloChip estado={estado} />}
            </button>
          )
        })}
      </div>

      {pestanaActiva === 1 && (
        <Modulo1Form
          paciente={paciente ?? null}
          onGuardado={(pacienteId) => {
            if (esNuevo) navigate(`/pacientes/${pacienteId}`, { replace: true })
          }}
        />
      )}

      {pestanaActiva === 2 && paciente && <Modulo2Form pacienteId={paciente.id} />}
      {pestanaActiva === 3 && paciente && <Modulo3Form pacienteId={paciente.id} />}
      {pestanaActiva === 4 && paciente && <Modulo4Form pacienteId={paciente.id} />}
      {pestanaActiva === 5 && paciente && <Modulo5Form pacienteId={paciente.id} />}
    </div>
  )
}
