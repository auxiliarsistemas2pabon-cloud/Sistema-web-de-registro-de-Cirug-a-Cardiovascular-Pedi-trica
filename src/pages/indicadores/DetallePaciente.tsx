import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { claseBotonTexto } from '../../components/Campo'
import { Cargando, MensajeError } from '../../components/Estados'
import { IconoChevronDerecha } from '../../components/iconos'
import { Tarjeta } from '../../components/Tarjeta'
import { api } from '../../lib/api'
import { formatearNumero } from '../../lib/estadisticas'
import { formatearEdad, formatearFecha } from '../../lib/fechas'
import type { GrupoActivo } from '../../lib/grupoActivo'
import { NOMBRES_MODULOS } from '../../lib/modulos'

type SiNo = 'SI' | 'NO' | 'NA' | null

/** Todo lo registrado de una cirugía de un paciente, con el texto de cada lista y cada "Otro…" con su
 * especificación entre paréntesis (GET /indicadores/pacientes/:id y GET /indicadores/casos). */
export interface Detalle {
  paciente_id: string
  cirugia_id: string
  numero_paciente: number
  /** Solo en adultos: qué intervención del paciente es (1 la primera, 2 una reintervención…). */
  numero_episodio?: number
  nombre_completo: string
  identificacion: string
  telefonos: string[]
  sin_telefono: boolean
  sexo: string | null
  fecha_nacimiento: string
  edad_cirugia_dias: number | null
  peso_kg: number | null
  talla_cm: number | null
  superficie_corporal: number | null
  procedencia: string | null
  municipio_narino: string | null
  eps: string | null
  diagnostico: string | null
  /** Separados por " | ". */
  diagnosticos_adicionales: string | null
  valvulopatia: string | null
  riesgos: string[]
  /** Solo en pediátricos. */
  rachs?: string | null
  /** Solo en adultos. */
  euroscore?: number | null
  fecha_cirugia: string | null
  procedimientos: { procedimiento: string; especificacion: string | null; implante: SiNo; tipo_implante: string | null; fecha: string | null }[]
  uso_cec: SiNo
  tiempo_cec_min: number | null
  tiempo_clamp_min: number | null
  complicacion_intraqx: string | null
  cierre_esternal_diferido: SiNo
  extubacion_quirofano: SiNo
  unidad_pop: string | null
  horas_ventilacion_mecanica: number | null
  complicacion_pop: string | null
  fecha_traslado_intermedio: string | null
  dias_uci: number | null
  fecha_salida: string | null
  dias_hospitalizacion: number | null
  condicion_salida: string | null
  fallecido: boolean
  seguimiento_no_aplica: boolean
  fecha_control_cirugia: string | null
  rehabilitacion_cardiaca: SiNo
  estado_herida: string | null
  /** Adultos guardan además si se hizo la llamada (Sí/No). */
  llamado_15_dias?: SiNo
  fecha_llamada_15_dias: string | null
  persona_recibe_llamada: string | null
  reingreso_30_dias: SiNo
  fecha_reingreso: string | null
  causa_reingreso: string | null
  observaciones: string | null
}

const TEXTO_SI_NO = { SI: 'Sí', NO: 'No', NA: 'No aplica' } as const
const siNo = (v: SiNo | undefined) => (v ? TEXTO_SI_NO[v] : null)
const fecha = (iso: string | null | undefined) => (iso ? formatearFecha(iso) : null)
const conUnidad = (v: number | null, unidad: string) => (v === null ? null : `${v} ${unidad}`)
const dias = (v: number | null) => (v === null ? null : `${v} ${v === 1 ? 'día' : 'días'}`)

/** El implante de un procedimiento en palabras: "Implante mecánico", "Sin implante", "No aplica". */
function textoImplante(p: Detalle['procedimientos'][number]): string | null {
  if (p.implante === 'SI') return p.tipo_implante ? `Implante ${p.tipo_implante.toLowerCase()}` : 'Con implante (sin tipo registrado)'
  if (p.implante === 'NO') return 'Sin implante'
  if (p.implante === 'NA') return 'Implante: no aplica'
  return null
}

/** Un dato del paciente: etiqueta arriba y valor abajo ("—" si aún no se registró). */
function Dato({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: ReactNode }) {
  const vacio = children === null || children === undefined || children === '' || children === false
  return (
    <div className={ancho ? 'col-span-2' : undefined}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-slate-900 [overflow-wrap:anywhere]">{vacio ? '—' : children}</dd>
    </div>
  )
}

/** Un módulo de la ficha, con el mismo número y nombre que tiene al registrarlo. */
function Modulo({ numero, className = '', aviso, children }: { numero: 1 | 2 | 3 | 4 | 5; className?: string; aviso?: string; children?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-slate-200 ${className}`}>
      <h3 className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-sm font-semibold text-slate-900">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--pabon-azul-oscuro)] text-xs font-semibold tabular-nums text-white">
          {numero}
        </span>
        {NOMBRES_MODULOS[numero - 1]}
      </h3>
      {aviso ? <p className="px-4 py-3.5 text-sm text-slate-600">{aviso}</p> : children}
    </section>
  )
}

const claseDatos = 'grid grid-cols-2 gap-x-4 gap-y-3.5 px-4 py-3.5 text-sm'

/** Los cinco módulos de una cirugía, con todos sus datos. La usan la matriz de resumen (al buscar un
 * documento) y el detalle de un indicador (p. ej. los pacientes fallecidos). */
export function FichaDetalle({ d, adultos }: { d: Detalle; adultos: boolean }) {
  // Un módulo sin ningún dato todavía no se ha diligenciado: se dice así, en vez de una lista de rayas.
  const sinDatos = (valores: unknown[]) => valores.every((v) => v === null || v === undefined)
  const sinPostoperatorio = sinDatos([d.unidad_pop, d.horas_ventilacion_mecanica, d.complicacion_pop, d.fecha_traslado_intermedio, d.fecha_salida, d.condicion_salida])
  const sinSeguimiento = sinDatos([d.fecha_control_cirugia, d.rehabilitacion_cardiaca, d.estado_herida, d.fecha_llamada_15_dias, d.llamado_15_dias, d.persona_recibe_llamada, d.reingreso_30_dias, d.observaciones])
  const telefonos = d.telefonos.length ? d.telefonos.join(' · ') : d.sin_telefono ? 'No tiene' : null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Modulo numero={1} className="lg:col-span-2">
        <dl className={`${claseDatos} sm:grid-cols-4`}>
          <Dato etiqueta="Nombre completo" ancho>{d.nombre_completo}</Dato>
          <Dato etiqueta="Documento">{d.identificacion}</Dato>
          <Dato etiqueta={d.telefonos.length > 1 ? 'Teléfonos' : 'Teléfono'}>{telefonos}</Dato>
          <Dato etiqueta="Sexo">{d.sexo}</Dato>
          <Dato etiqueta="Fecha de nacimiento">{fecha(d.fecha_nacimiento)}</Dato>
          <Dato etiqueta="Edad en la cirugía">{formatearEdad(d.fecha_nacimiento, d.fecha_cirugia) || null}</Dato>
          <Dato etiqueta="EPS">{d.eps}</Dato>
          <Dato etiqueta="Peso">{conUnidad(d.peso_kg, 'kg')}</Dato>
          <Dato etiqueta="Talla">{conUnidad(d.talla_cm, 'cm')}</Dato>
          <Dato etiqueta="Superficie corporal">{d.superficie_corporal === null ? null : `${formatearNumero(d.superficie_corporal, 2)} m²`}</Dato>
          <Dato etiqueta="Procedencia">
            {d.procedencia && d.municipio_narino ? `${d.procedencia} · ${d.municipio_narino}` : d.procedencia}
          </Dato>
        </dl>
      </Modulo>

      <Modulo numero={2}>
        <dl className={claseDatos}>
          <Dato etiqueta="Diagnóstico" ancho>{d.diagnostico}</Dato>
          {d.diagnosticos_adicionales && (
            <Dato etiqueta="Diagnósticos adicionales" ancho>{d.diagnosticos_adicionales.split(' | ').join(' · ')}</Dato>
          )}
          {d.valvulopatia && <Dato etiqueta="Tipo de valvulopatía" ancho>{d.valvulopatia}</Dato>}
          {adultos ? (
            <Dato etiqueta="Escala EuroSCORE">{d.euroscore === null || d.euroscore === undefined ? null : `${d.euroscore} %`}</Dato>
          ) : (
            <Dato etiqueta="Escala RACHS-1">{d.rachs}</Dato>
          )}
          <Dato etiqueta="Factores de riesgo" ancho>
            {d.riesgos.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4">
                {d.riesgos.map((riesgo) => (
                  <li key={riesgo}>{riesgo}</li>
                ))}
              </ul>
            )}
          </Dato>
        </dl>
      </Modulo>

      <Modulo numero={3}>
        <dl className={claseDatos}>
          <Dato etiqueta="Fecha de cirugía" ancho>{fecha(d.fecha_cirugia)}</Dato>
          <Dato etiqueta={d.procedimientos.length === 1 ? 'Procedimiento realizado' : 'Procedimientos realizados'} ancho>
            {d.procedimientos.length > 0 && (
              <ol className="list-decimal space-y-1 pl-4">
                {d.procedimientos.map((p) => (
                  <li key={p.procedimiento}>
                    {p.procedimiento}
                    {p.especificacion && ` (${p.especificacion})`}
                    {/* Solo los procedimientos hechos otro día (en pediátricos) llevan su fecha. */}
                    {p.fecha && p.fecha !== d.fecha_cirugia && <span className="text-slate-600"> · {formatearFecha(p.fecha)}</span>}
                    {textoImplante(p) && <span className="block text-xs text-slate-600">{textoImplante(p)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Dato>
          <Dato etiqueta="Uso de CEC" ancho={d.uso_cec !== 'SI'}>{siNo(d.uso_cec)}</Dato>
          {d.uso_cec === 'SI' && (
            <>
              <Dato etiqueta="Tiempo de CEC">{conUnidad(d.tiempo_cec_min, 'min')}</Dato>
              <Dato etiqueta="Tiempo de clamp de aorta" ancho>{conUnidad(d.tiempo_clamp_min, 'min')}</Dato>
            </>
          )}
          <Dato etiqueta="Complicación intraquirúrgica" ancho>{d.complicacion_intraqx}</Dato>
          <Dato etiqueta="Cierre esternal diferido">{siNo(d.cierre_esternal_diferido)}</Dato>
          <Dato etiqueta="Extubación en quirófano">{siNo(d.extubacion_quirofano)}</Dato>
        </dl>
      </Modulo>

      <Modulo numero={4} aviso={sinPostoperatorio ? 'Aún no se ha registrado el postoperatorio de este paciente.' : undefined}>
        <dl className={claseDatos}>
          <Dato etiqueta="Unidad postoperatoria">{d.unidad_pop}</Dato>
          <Dato etiqueta="Ventilación mecánica">{conUnidad(d.horas_ventilacion_mecanica, 'h')}</Dato>
          <Dato etiqueta="Complicación postoperatoria" ancho>{d.complicacion_pop}</Dato>
          <Dato etiqueta="Traslado a intermedio">{fecha(d.fecha_traslado_intermedio)}</Dato>
          <Dato etiqueta="Estancia en UCI">{dias(d.dias_uci)}</Dato>
          <Dato etiqueta="Fecha de salida">{fecha(d.fecha_salida)}</Dato>
          <Dato etiqueta="Hospitalización">{dias(d.dias_hospitalizacion)}</Dato>
          <Dato etiqueta="Condición de salida" ancho>{d.condicion_salida}</Dato>
        </dl>
      </Modulo>

      <Modulo
        numero={5}
        aviso={
          d.seguimiento_no_aplica
            ? 'No aplica: el paciente falleció, así que no tiene seguimiento post-egreso.'
            : sinSeguimiento
              ? 'Aún no se ha registrado el seguimiento de este paciente.'
              : undefined
        }
      >
        <dl className={claseDatos}>
          <Dato etiqueta="Control por cirugía cardiovascular">{fecha(d.fecha_control_cirugia)}</Dato>
          <Dato etiqueta="Rehabilitación cardíaca">{siNo(d.rehabilitacion_cardiaca)}</Dato>
          <Dato etiqueta="Estado de la herida quirúrgica" ancho>{d.estado_herida}</Dato>
          {adultos && <Dato etiqueta="Llamado 15 días">{siNo(d.llamado_15_dias)}</Dato>}
          <Dato etiqueta="Fecha de la llamada de los 15 días">{fecha(d.fecha_llamada_15_dias)}</Dato>
          <Dato etiqueta="Persona que recibe la llamada" ancho={!adultos}>{d.persona_recibe_llamada}</Dato>
          <Dato etiqueta="Reingreso en los primeros 30 días" ancho={d.reingreso_30_dias !== 'SI'}>{siNo(d.reingreso_30_dias)}</Dato>
          {d.reingreso_30_dias === 'SI' && (
            <>
              <Dato etiqueta="Fecha de reingreso">{fecha(d.fecha_reingreso)}</Dato>
              <Dato etiqueta="Causa de reingreso" ancho>{d.causa_reingreso}</Dato>
            </>
          )}
          <Dato etiqueta="Observaciones" ancho>
            {d.observaciones && <span className="whitespace-pre-line">{d.observaciones}</span>}
          </Dato>
        </dl>
      </Modulo>
    </div>
  )
}

/** Enlace a la ficha del paciente para editarlo. */
export function EnlaceFicha({ adultos, pacienteId }: { adultos: boolean; pacienteId: string }) {
  return (
    <Link to={`${adultos ? '/adultos' : '/pacientes'}/${pacienteId}`} className={`${claseBotonTexto} text-xs`}>
      Abrir la ficha
      <IconoChevronDerecha className="h-3.5 w-3.5" />
    </Link>
  )
}

interface Props {
  grupo: GrupoActivo
  pacienteId: string
  /** La cirugía puntual a mostrar — en adultos, un paciente puede tener varias (reintervención),
   * cada una con su propio diagnóstico/postoperatorio/seguimiento; esta ficha siempre muestra
   * exactamente una, nunca una mezcla. */
  cirugiaId: string
}

/** Todo lo que se le hizo a un paciente, módulo por módulo: lo que muestra la matriz de resumen al
 * buscarlo por documento. La ficha completa, para editarlo, queda a un clic. */
export function DetallePaciente({ grupo, pacienteId, cirugiaId }: Props) {
  const adultos = grupo === 'adultos'
  const { data: d, isLoading, error } = useQuery({
    queryKey: ['indicadores-paciente', grupo, cirugiaId],
    queryFn: () => api.get<Detalle>(`${adultos ? '/indicadores/adultos/pacientes' : '/indicadores/pacientes'}/${cirugiaId}`),
  })

  return (
    <Tarjeta
      titulo={
        d
          ? `Todo lo que se le hizo al paciente N.º ${d.numero_paciente} · ${d.nombre_completo}${d.numero_episodio && d.numero_episodio > 1 ? ` · intervención ${d.numero_episodio}` : ''}`
          : 'Todo lo que se le hizo al paciente'
      }
      acciones={<EnlaceFicha adultos={adultos} pacienteId={pacienteId} />}
    >
      {isLoading && <Cargando />}
      {error && <MensajeError>No se pudo cargar el detalle del paciente.</MensajeError>}
      {d && <FichaDetalle d={d} adultos={adultos} />}
    </Tarjeta>
  )
}
