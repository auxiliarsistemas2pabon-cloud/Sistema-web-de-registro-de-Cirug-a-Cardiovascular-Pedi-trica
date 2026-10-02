import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cargando, MensajeError } from '../components/Estados'
import { FichaPaciente, type NumeroModulo } from '../components/FichaPaciente'
import { IconoPacientes } from '../components/iconos'
import { api } from '../lib/api'
import { formatearEdad } from '../lib/fechas'
import type { PacienteDetalle, PacienteResumen } from '../types/db'
import { Modulo1Form } from './modulos/Modulo1Form'
import { Modulo2Form } from './modulos/Modulo2Form'
import { Modulo3Form } from './modulos/Modulo3Form'
import { Modulo4Form } from './modulos/Modulo4Form'
import { Modulo5Form } from './modulos/Modulo5Form'

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

export function PacienteFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const esNuevo = !id || id === 'nuevo'
  const [pestanaActiva, setPestanaActiva] = useState<NumeroModulo>(1)

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
  }

  return (
    <FichaPaciente
      rutaListado="/pacientes"
      etiquetaListado="Pacientes pediátricos"
      esNuevo={esNuevo}
      titulo={esNuevo ? 'Nuevo paciente' : (paciente?.nombre_completo ?? '')}
      avatar={esNuevo ? <IconoPacientes className="h-6 w-6" /> : iniciales(paciente?.nombre_completo ?? '?')}
      subtitulo={esNuevo ? 'Completa el Módulo 1 para crear la ficha.' : paciente && `Paciente N° ${paciente.numero_paciente}`}
      datos={
        !esNuevo && paciente
          ? [
              { etiqueta: 'Identificación', valor: paciente.identificacion },
              { etiqueta: 'Edad', valor: formatearEdad(resumen?.edad_dias) || '—' },
              { etiqueta: 'Diagnóstico', valor: resumen?.diagnostico_valor ?? 'Sin diagnóstico', ancho: true },
            ]
          : undefined
      }
      estados={estados}
      pestanaActiva={pestanaActiva}
      onCambiarPestana={setPestanaActiva}
    >
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
    </FichaPaciente>
  )
}
