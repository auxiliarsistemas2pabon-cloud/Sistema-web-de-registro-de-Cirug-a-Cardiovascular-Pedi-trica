import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { claseBotonSecundarioCompacto } from '../../components/Campo'
import { Cargando, EstadoVacio, MensajeError } from '../../components/Estados'
import { IconoBajar, IconoChevronIzquierda, IconoPacientes } from '../../components/iconos'
import { Tarjeta } from '../../components/Tarjeta'
import { api } from '../../lib/api'
import { descargarMatrizExcel, type FilaExportacion } from '../../lib/excelMatriz'
import { formatearFecha } from '../../lib/fechas'
import type { GrupoActivo } from '../../lib/grupoActivo'
import { ENCABEZADOS_EXPORTACION, ENCABEZADOS_EXPORTACION_ADULTOS } from '../../lib/importacion'
import { EnlaceFicha, FichaDetalle, type Detalle } from './DetallePaciente'
import { NOMBRE_CAMPO, type Filtro } from './filtros'
import { INDICADORES_CON_DETALLE, nombreMes, type IndicadorClave } from './indicadoresClave'

interface Props {
  grupo: GrupoActivo
  desde: string
  hasta: string
  filtros: Filtro[]
  indicador: IndicadorClave
  /** Si se llegó desde el punto de un mes del gráfico ("2026-05"); sin él, todo el periodo. */
  mes: string | null
  onVolver: () => void
}

/** Los parámetros de la consulta: los mismos del tablero, más el indicador y el mes. */
function parametros({ desde, hasta, filtros, indicador, mes }: Omit<Props, 'grupo' | 'onVolver'>) {
  const p = new URLSearchParams({ desde, hasta, indicador })
  if (mes) p.set('mes', mes)
  if (filtros.length) p.set('filtros', JSON.stringify(filtros.map(({ campo, valor }) => ({ campo, valor }))))
  return p.toString()
}

/** El dato de cada caso que explica por qué está en la lista. */
function motivo(indicador: IndicadorClave, d: Detalle): string | null {
  if (indicador === 'mortalidad') return d.condicion_salida
  if (indicador === 'complicacion_intraqx') return d.complicacion_intraqx
  if (indicador === 'complicacion_pop') return d.complicacion_pop
  return [d.causa_reingreso, d.fecha_reingreso && formatearFecha(d.fecha_reingreso)].filter(Boolean).join(' · ') || null
}

const ENCABEZADO_MOTIVO: Record<IndicadorClave, string> = {
  mortalidad: 'Condición de salida',
  complicacion_intraqx: 'Complicación intraquirúrgica',
  complicacion_pop: 'Complicación postoperatoria',
  reingreso: 'Causa y fecha de reingreso',
}

/**
 * El detalle de un indicador clave (pedido del 23-oct: "si se selecciona mortalidad del 7 %, que al
 * hacer clic dirija al detalle de los pacientes fallecidos con la totalidad de sus datos"): cuántos son
 * los casos y de qué total salen, una lista para ubicarlos y, debajo, la ficha completa de cada uno.
 * Respeta los filtros del tablero y se descarga en Excel con todos los campos.
 */
export function DetalleIndicador({ grupo, desde, hasta, filtros, indicador, mes, onVolver }: Props) {
  const adultos = grupo === 'adultos'
  const ruta = adultos ? '/indicadores/adultos' : '/indicadores'
  const consulta = parametros({ desde, hasta, filtros, indicador, mes })
  const [descargando, setDescargando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState(false)
  const { data, isLoading, error, isPlaceholderData } = useQuery({
    queryKey: ['indicadores-casos', grupo, consulta],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<{ total: number; casos: Detalle[] }>(`${ruta}/casos?${consulta}`),
  })

  const textos = INDICADORES_CON_DETALLE[indicador]
  const periodo = mes ? nombreMes(mes) : `${formatearFecha(desde)} – ${formatearFecha(hasta)}`
  const condiciones = filtros.map((f) => `${NOMBRE_CAMPO[f.campo]} = ${f.etiqueta}`)
  const tasa = data && data.total ? Math.round((1000 * data.casos.length) / data.total) / 10 : 0

  async function descargar() {
    setDescargando(true)
    setErrorDescarga(false)
    try {
      const { filas } = await api.get<{ filas: FilaExportacion[] }>(`${ruta}/exportar?${consulta}`)
      await descargarMatrizExcel({
        titulo: `${textos.casos} · ${adultos ? 'Pacientes adultos' : 'Pacientes pediátricos'}`,
        subtitulo: `Fecha de cirugía: ${periodo} · ${filas.length} de ${data?.total ?? filas.length} pacientes operados`,
        condiciones,
        columnas: adultos ? ENCABEZADOS_EXPORTACION_ADULTOS : ENCABEZADOS_EXPORTACION,
        filas,
        nombreArchivo: `${indicador.replace(/_/g, '-')}-${grupo}-${mes ?? `${desde}-a-${hasta}`}.xlsx`,
      })
    } catch {
      setErrorDescarga(true)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className={`space-y-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      {/* Las acciones van en su propia fila (no junto al título de la tarjeta): en el celular, dos
          botones al lado del título lo apretaban a una palabra por línea. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onVolver} className={claseBotonSecundarioCompacto}>
          <IconoChevronIzquierda className="h-3.5 w-3.5" />
          Volver al tablero
        </button>
        {!!data?.casos.length && (
          <button type="button" onClick={() => void descargar()} disabled={descargando} className={`${claseBotonSecundarioCompacto} ml-auto`}>
            <IconoBajar />
            {descargando ? 'Generando…' : 'Descargar Excel con todos los datos'}
          </button>
        )}
      </div>

      <Tarjeta
        icono={<IconoPacientes className="h-4 w-4" />}
        titulo={`${textos.casos} · ${periodo}`}
        descripcion={condiciones.length ? `Con los filtros del tablero: ${condiciones.join(' · ')}.` : 'Todos los pacientes operados del periodo.'}
      >
        {isLoading && <Cargando />}
        {error && <MensajeError>No se pudieron cargar los pacientes.</MensajeError>}
        {errorDescarga && <p className="mb-3 text-sm text-red-700">No se pudo generar el archivo. Intente de nuevo.</p>}
        {data && (
          <>
            <p className="text-sm text-slate-700">
              <span className="text-2xl font-semibold tabular-nums text-slate-900">{data.casos.length}</span> de{' '}
              <span className="font-semibold tabular-nums text-slate-900">{data.total}</span> pacientes operados
              {data.total > 0 && <> · <span className="font-semibold tabular-nums text-slate-900">{tasa.toFixed(1)} %</span></>}
            </p>

            {data.casos.length === 0 ? (
              <EstadoVacio icono={<IconoPacientes className="h-6 w-6" />} titulo={`${textos.ninguno} en ${periodo}`} mensaje="Pruebe con otro periodo o quite los filtros." />
            ) : (
              <div className="-mx-5 -mb-5 mt-4 overflow-x-auto border-t border-slate-200">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th scope="col" className="py-2.5 pr-3 pl-5">N.º</th>
                      <th scope="col" className="px-3 py-2.5">Paciente</th>
                      <th scope="col" className="px-3 py-2.5">Documento</th>
                      <th scope="col" className="px-3 py-2.5">Fecha de cirugía</th>
                      <th scope="col" className="px-3 py-2.5">Diagnóstico</th>
                      <th scope="col" className="px-3 py-2.5 pr-5">{ENCABEZADO_MOTIVO[indicador]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {data.casos.map((d) => (
                      <tr key={d.cirugia_id} className="hover:bg-sky-50/70">
                        <th scope="row" className="py-2 pr-3 pl-5 font-semibold tabular-nums text-slate-900">{d.numero_paciente}</th>
                        <td className="px-3 py-2">
                          {/* Lleva a su ficha completa, más abajo en esta misma página. */}
                          <a href={`#caso-${d.cirugia_id}`} className="font-medium text-sky-700 hover:underline">{d.nombre_completo}</a>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{d.identificacion}</td>
                        <td className="px-3 py-2 tabular-nums">{d.fecha_cirugia ? formatearFecha(d.fecha_cirugia) : '—'}</td>
                        <td className="max-w-[16rem] px-3 py-2">{d.diagnostico ?? '—'}</td>
                        <td className="max-w-[18rem] px-3 py-2 pr-5">{motivo(indicador, d) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Tarjeta>

      {data?.casos.map((d) => (
        <section key={d.cirugia_id} id={`caso-${d.cirugia_id}`} className="scroll-mt-24">
          <Tarjeta
            titulo={`Paciente N.º ${d.numero_paciente} · ${d.nombre_completo}${d.numero_episodio && d.numero_episodio > 1 ? ` · intervención ${d.numero_episodio}` : ''}`}
            acciones={<EnlaceFicha adultos={adultos} pacienteId={d.paciente_id} />}
          >
            <FichaDetalle d={d} adultos={adultos} />
          </Tarjeta>
        </section>
      ))}
    </div>
  )
}
