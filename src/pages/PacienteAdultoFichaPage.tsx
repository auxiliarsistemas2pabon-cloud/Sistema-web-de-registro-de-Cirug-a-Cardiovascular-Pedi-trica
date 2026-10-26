import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cargando, MensajeError } from '../components/Estados'
import { FichaPaciente, type NumeroModulo } from '../components/FichaPaciente'
import { IconoAdultos } from '../components/iconos'
import { SelectorEpisodiosAdulto } from '../components/SelectorEpisodiosAdulto'
import { api } from '../lib/api'
import { formatearEdad } from '../lib/fechas'
import type { EpisodioAdulto, PacienteAdultoDetalle, PacienteAdultoResumen } from '../types/db'
import { Modulo1FormAdulto } from './modulos-adultos/Modulo1FormAdulto'
import { Modulo2FormAdulto } from './modulos-adultos/Modulo2FormAdulto'
import { Modulo3FormAdulto } from './modulos-adultos/Modulo3FormAdulto'
import { Modulo4FormAdulto } from './modulos-adultos/Modulo4FormAdulto'
import { Modulo5FormAdulto } from './modulos-adultos/Modulo5FormAdulto'

function usePacienteAdulto(id: string | undefined) {
  return useQuery({
    queryKey: ['paciente-adulto', id],
    enabled: !!id && id !== 'nuevo',
    queryFn: () => api.get<PacienteAdultoDetalle>(`/pacientes-adultos/${id}`),
  })
}

function useEpisodiosAdulto(id: string | undefined) {
  return useQuery({
    queryKey: ['episodios-adulto', id],
    enabled: !!id && id !== 'nuevo',
    queryFn: () => api.get<EpisodioAdulto[]>(`/pacientes-adultos/${id}/episodios`),
  })
}

function useResumenEdad(id: string | undefined) {
  return useQuery({
    queryKey: ['paciente-adulto-resumen', id],
    enabled: !!id && id !== 'nuevo',
    queryFn: () =>
      api.get<Pick<PacienteAdultoResumen, 'edad_dias' | 'diagnostico_valor' | 'estado_m1' | 'estado_m2' | 'estado_m3' | 'estado_m4' | 'estado_m5'>>(
        `/pacientes-adultos/${id}/resumen`,
      ),
  })
}

function iniciales(nombreCompleto: string) {
  const partes = nombreCompleto.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

export function PacienteAdultoFichaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const esNuevo = !id || id === 'nuevo'
  const [pestanaActiva, setPestanaActiva] = useState<NumeroModulo>(1)
  const [episodioId, setEpisodioId] = useState<string | null>(null)

  const { data: paciente, isLoading, error } = usePacienteAdulto(id)
  const { data: resumen } = useResumenEdad(id)
  const { data: episodios } = useEpisodiosAdulto(id)

  // Por defecto se abre la intervención más reciente; una vez el usuario elige una (o se crea una
  // nueva), esa elección se respeta mientras la lista no cambie de identidad.
  useEffect(() => {
    if (episodios && episodios.length > 0 && !episodios.some((e) => e.id === episodioId)) {
      setEpisodioId(episodios[episodios.length - 1].id)
    }
  }, [episodios, episodioId])

  if (!esNuevo && isLoading) return <Cargando etiqueta="Cargando paciente…" />
  if (!esNuevo && error) return <MensajeError>No se pudo cargar el paciente.</MensajeError>

  // Los módulos 2 a 5 (y su diagnóstico) son de la intervención elegida, no de la última: con una
  // reintervención, ver la primera debe mostrar los estados y el diagnóstico de la primera.
  const episodio = episodios?.find((e) => e.id === episodioId)
  const varias = (episodios?.length ?? 0) > 1
  const estados = {
    1: paciente?.estado_modulo,
    2: episodio?.estado_m2 ?? resumen?.estado_m2,
    3: episodio?.estado_m3 ?? resumen?.estado_m3,
    4: episodio?.estado_m4 ?? resumen?.estado_m4,
    5: episodio?.estado_m5 ?? resumen?.estado_m5,
  }
  const diagnostico = episodio ? episodio.diagnostico_valor : resumen?.diagnostico_valor

  return (
    <FichaPaciente
      rutaListado="/adultos"
      etiquetaListado="Pacientes adultos"
      esNuevo={esNuevo}
      titulo={esNuevo ? 'Nuevo paciente adulto' : (paciente?.nombre_completo ?? '')}
      avatar={esNuevo ? <IconoAdultos className="h-6 w-6" /> : iniciales(paciente?.nombre_completo ?? '?')}
      subtitulo={esNuevo ? 'Completa el Módulo 1 para crear la ficha.' : paciente && `Paciente N° ${paciente.numero_paciente}`}
      datos={
        !esNuevo && paciente
          ? [
              { etiqueta: 'Identificación', valor: paciente.identificacion },
              { etiqueta: 'Edad', valor: formatearEdad(resumen?.edad_dias) || '—' },
              {
                etiqueta: varias && episodio ? `Diagnóstico (intervención ${episodio.numero_episodio})` : 'Diagnóstico',
                valor: diagnostico ?? 'Sin diagnóstico',
                ancho: true,
              },
            ]
          : undefined
      }
      estados={estados}
      pestanaActiva={pestanaActiva}
      onCambiarPestana={setPestanaActiva}
      intervenciones={
        paciente && episodios && (
          <SelectorEpisodiosAdulto pacienteId={paciente.id} episodios={episodios} episodioId={episodioId} onSeleccionar={setEpisodioId} />
        )
      }
      contexto={varias && episodio && pestanaActiva !== 1 ? `Intervención ${episodio.numero_episodio}` : undefined}
    >
      {pestanaActiva === 1 && (
        <Modulo1FormAdulto
          paciente={paciente ?? null}
          onGuardado={(pacienteId) => {
            if (esNuevo) navigate(`/adultos/${pacienteId}`, { replace: true })
          }}
        />
      )}
      {pestanaActiva === 2 && paciente && episodioId && <Modulo2FormAdulto pacienteId={paciente.id} episodioId={episodioId} />}
      {pestanaActiva === 3 && paciente && episodioId && <Modulo3FormAdulto pacienteId={paciente.id} episodioId={episodioId} />}
      {pestanaActiva === 4 && paciente && episodioId && <Modulo4FormAdulto pacienteId={paciente.id} episodioId={episodioId} />}
      {pestanaActiva === 5 && paciente && episodioId && <Modulo5FormAdulto pacienteId={paciente.id} episodioId={episodioId} />}
    </FichaPaciente>
  )
}
