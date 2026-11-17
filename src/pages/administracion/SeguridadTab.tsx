import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Cargando, MensajeError } from '../../components/Estados'

interface Evento { id: number; fecha: string; evento: string; usuario_id: string | null; ip: string | null; recurso: string; detalles: Record<string, unknown> }
interface Resumen { eventos_24h: { evento: string; total: number }[]; cuentas_pendientes: number }
export function SeguridadTab() {
  const eventos = useQuery({ queryKey: ['eventos-seguridad'], queryFn: () => api.get<Evento[]>('/admin/eventos-seguridad'), refetchInterval: 60_000 })
  const resumen = useQuery({ queryKey: ['seguridad-resumen'], queryFn: () => api.get<Resumen>('/admin/seguridad/resumen'), refetchInterval: 60_000 })
  const fallos = resumen.data?.eventos_24h.filter((e) => ['login_fallido', 'mfa_fallido', 'permiso_denegado'].includes(e.evento)).reduce((total, e) => total + e.total, 0) ?? 0
  return <div className="space-y-4">
    <h2 className="font-semibold">Actividad de seguridad</h2>
    {fallos >= 10 && <p role="alert" className="rounded bg-amber-100 p-3">Revise la actividad: se registraron {fallos} fallos de acceso o permisos en las últimas 24 horas.</p>}
    <p>Cuentas activas con inscripción o cambio de contraseña pendiente: {resumen.data?.cuentas_pendientes ?? '…'}</p>
    <p className="text-xs text-slate-500">Los eventos de acceso y exportación indican solicitudes autorizadas. No confirman que el archivo se haya descargado. Se muestran los últimos 200 eventos.</p>
    {eventos.isLoading && <Cargando />}{eventos.isError && <MensajeError>No se pudo consultar la auditoría de seguridad.</MensajeError>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Fecha UTC</th><th>Evento</th><th>Cuenta</th><th>Recurso</th><th>IP</th></tr></thead>
      <tbody>{eventos.data?.map((e) => <tr key={e.id} className="border-t"><td className="p-2">{e.fecha}</td><td className="p-2">{e.evento}</td><td className="p-2">{e.usuario_id ?? 'Sin autenticar'}</td><td className="p-2">{e.recurso}</td><td className="p-2">{e.ip}</td></tr>)}</tbody></table></div>
  </div>
}
