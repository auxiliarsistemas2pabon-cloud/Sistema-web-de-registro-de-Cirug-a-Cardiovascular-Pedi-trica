import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cargando, MensajeError } from '../components/Estados'
import { Tarjeta } from '../components/Tarjeta'
import { IconoPacientes } from '../components/iconos'
import { api } from '../lib/api'
import { formatearEdad } from '../lib/fechas'
import type { EstadoModulo, PacienteDetalle, PacienteResumen } from '../types/db'
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

function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function CirculoPaso({ numero, estado, activo }: { numero: number; estado: EstadoModulo | undefined; activo: boolean }) {
  if (estado === 'completo') {
    return (
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-white ${activo ? 'ring-2 ring-[var(--pabon-azul-claro)] ring-offset-2' : ''} bg-emerald-500`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
          <path d="m6 12.5 4 4 8-8.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (estado === 'no_aplica') {
    return (
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-slate-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
          <path d="M6 12h12" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold ${
        activo
          ? 'bg-[var(--pabon-azul-oscuro)] text-white'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {numero}
    </span>
  )
}

export function PacienteFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const esNuevo = !id || id === 'nuevo'
  const [pestanaActiva, setPestanaActiva] = useState<number>(1)

  const { data: paciente, isLoading, error } = usePaciente(id)
  const { data: resumen } = useResumenEdad(id)

  if (!esNuevo && isLoading) return <Cargando etiqueta="Cargando paciente…" />
  if (!esNuevo && error) return <MensajeError>No se pudo cargar el paciente.</MensajeError>

  const estados = {
    1: paciente?.estado_modulo,
    2: resumen?.estado_m2,
    3: resumen?.estado_m3,
    4: resumen?.estado_m4,
    5: resumen?.estado_m5,
  } as const

  return (
    <div>
      <Tarjeta className="mb-6">
        <div className="flex items-center gap-4 p-5">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)]/10 text-lg font-semibold text-[var(--pabon-azul-oscuro)]">
            {esNuevo ? <IconoPacientes className="h-6 w-6" /> : iniciales(paciente?.nombre_completo ?? '?')}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">
              {esNuevo ? 'Nuevo paciente' : paciente?.nombre_completo}
            </h1>
            {!esNuevo && paciente && (
              <p className="mt-0.5 text-sm text-slate-500">
                N° {paciente.numero_paciente} · Identificación {paciente.identificacion} ·{' '}
                {formatearEdad(resumen?.edad_dias)} · {resumen?.diagnostico_valor ?? 'Sin diagnóstico'}
              </p>
            )}
            {esNuevo && <p className="mt-0.5 text-sm text-slate-500">Completa el Módulo 1 para crear la ficha.</p>}
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/70 px-3 py-3 sm:gap-2 sm:px-4">
          {PESTANAS.map((p) => {
            const bloqueada = esNuevo && p.clave !== 1
            const activo = pestanaActiva === p.clave
            return (
              <button
                key={p.clave}
                type="button"
                disabled={bloqueada}
                onClick={() => setPestanaActiva(p.clave)}
                title={bloqueada ? 'Guarda primero el Módulo 1' : undefined}
                className={`flex flex-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  activo ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/60'
                } ${bloqueada ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <CirculoPaso numero={p.clave} estado={estados[p.clave]} activo={activo} />
                <span className={`whitespace-nowrap text-sm font-medium ${activo ? 'text-slate-900' : 'text-slate-500'}`}>
                  {p.etiqueta}
                </span>
              </button>
            )
          })}
        </div>
      </Tarjeta>

      <Tarjeta>
        <div className="p-5">
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
      </Tarjeta>
    </div>
  )
}
