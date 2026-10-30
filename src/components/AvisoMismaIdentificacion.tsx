import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface FichaResumen {
  paciente_id: string
  numero_paciente: number
  nombre_completo: string
  identificacion: string
}

interface Props {
  /** '/pacientes' (pediátricos) o '/pacientes-adultos'. */
  ruta: string
  identificacion: string
  /** La ficha abierta (no se cuenta a sí misma); undefined al crear una nueva. */
  pacienteId: string | undefined
}

/**
 * Aviso bajo "Identificación" cuando el documento ya tiene otra ficha (pedido del 30-oct): un paciente
 * que reingresa se registra como paciente nuevo, con su mismo documento. No impide guardar; solo deja
 * claro que es un reingreso y no un error de digitación.
 */
export function AvisoMismaIdentificacion({ ruta, identificacion, pacienteId }: Props) {
  const documento = identificacion.trim()
  const { data } = useQuery({
    queryKey: [ruta, 'misma-identificacion', documento],
    enabled: /^\d{5,}$/.test(documento),
    queryFn: () => api.get<FichaResumen[]>(`${ruta}?busqueda=${encodeURIComponent(documento)}`),
  })
  const otras = (data ?? []).filter((p) => p.identificacion === documento && p.paciente_id !== pacienteId)
  if (otras.length === 0) return null

  return (
    <p className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-slate-700">
      Esta identificación ya tiene {otras.length === 1 ? 'otra ficha' : `${otras.length} fichas más`}:{' '}
      {otras.map((p) => `N° ${p.numero_paciente} (${p.nombre_completo})`).join(', ')}.{' '}
      {pacienteId ? 'Cada ficha es un ingreso distinto.' : 'Al guardar se registra como un ingreso nuevo, en una ficha aparte.'}
    </p>
  )
}
