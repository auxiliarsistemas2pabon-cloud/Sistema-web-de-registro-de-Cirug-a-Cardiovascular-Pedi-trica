import { useState } from 'react'
import { claseBotonSecundarioCompacto, claseInput } from '../../components/Campo'
import { Cargando, EstadoVacio } from '../../components/Estados'
import { SinDatosGrafico } from '../../components/GraficoComun'
import { IconoBajar, IconoBuscar, IconoCerrar, IconoFiltro } from '../../components/iconos'
import { Tarjeta } from '../../components/Tarjeta'
import { formatearNumero, redondear } from '../../lib/estadisticas'
import { formatearFecha } from '../../lib/fechas'
import type { GrupoActivo } from '../../lib/grupoActivo'
import { DetallePaciente } from './DetallePaciente'
import { NOMBRE_CAMPO, type CampoFiltro, type Filtro } from './filtros'

/** Medidas de resumen de una variable numérica, calculadas en el servidor solo con los pacientes
 * que tienen el dato (ver resumenNumerico en server/rutas-consultas.mjs). */
export interface Estadisticas {
  n: number
  promedio: number | null
  mediana: number | null
  q1: number | null
  q3: number | null
  minimo: number | null
  maximo: number | null
}

type CampoEtiqueta = 'sexo' | 'procedencia' | 'peso' | 'talla' | 'superficie' | 'dias_uci' | 'horas_vm' | 'estado_herida'

/** Un paciente operado en el periodo, con todas sus variables (GET /indicadores/pacientes). */
export interface PacienteMatriz {
  paciente_id: string
  numero_paciente: number
  /** Documento de identidad: solo dígitos (así lo exige la base de datos). */
  identificacion: string
  fecha_cirugia: string
  sexo: string | null
  procedencia: string | null
  peso_kg: number | null
  talla_cm: number | null
  superficie_corporal: number | null
  dias_uci: number | null
  horas_vm: number | null
  estado_herida: string | null
  seguimiento_no_aplica: boolean
  /** La etiqueta de cada valor en su gráfico ("2.5–4.9 kg"): con ella un clic en la celda filtra el tablero. */
  etiquetas: Record<CampoEtiqueta, string | null>
}

interface Columna {
  titulo: string
  unidad?: string
  campo: CampoFiltro
  etiqueta: CampoEtiqueta
  numerica: boolean
  valor: (p: PacienteMatriz) => number | string | null
  ancho: string
}

/** Las columnas de la matriz, en el orden acordado: datos del paciente y luego su evolución. */
const COLUMNAS: Columna[] = [
  { titulo: 'Sexo', campo: 'sexo', etiqueta: 'sexo', numerica: false, valor: (p) => p.sexo, ancho: 'w-[6.5rem]' },
  { titulo: 'Procedencia', campo: 'procedencia', etiqueta: 'procedencia', numerica: false, valor: (p) => p.procedencia, ancho: 'w-[7.5rem]' },
  { titulo: 'Peso', unidad: 'kg', campo: 'peso', etiqueta: 'peso', numerica: true, valor: (p) => p.peso_kg, ancho: 'w-[5rem]' },
  { titulo: 'Talla', unidad: 'cm', campo: 'talla', etiqueta: 'talla', numerica: true, valor: (p) => p.talla_cm, ancho: 'w-[5rem]' },
  // La superficie corporal llega sin redondear (se calcula en el servidor): se muestra con 2 decimales.
  {
    titulo: 'Superficie corporal', unidad: 'm²', campo: 'superficie', etiqueta: 'superficie', numerica: true,
    valor: (p) => (p.superficie_corporal === null ? null : redondear(p.superficie_corporal, 2)), ancho: 'w-[6.5rem]',
  },
  { titulo: 'Estancia en UCI', unidad: 'días', campo: 'dias_uci', etiqueta: 'dias_uci', numerica: true, valor: (p) => p.dias_uci, ancho: 'w-[6rem]' },
  { titulo: 'Ventilación mecánica', unidad: 'h', campo: 'horas_vm', etiqueta: 'horas_vm', numerica: true, valor: (p) => p.horas_vm, ancho: 'w-[7rem]' },
  {
    titulo: 'Estado de la herida', campo: 'estado_herida', etiqueta: 'estado_herida', numerica: false,
    // Los fallecidos no tienen seguimiento: su herida no se evalúa.
    valor: (p) => (p.seguimiento_no_aplica ? 'No aplica' : p.estado_herida), ancho: 'w-[11rem]',
  },
]

const nombreColumna = (c: Columna) => (c.unidad ? `${c.titulo} (${c.unidad})` : c.titulo)

/** Lo que se lee en la celda: el valor (la superficie con sus 2 decimales) o "—" si falta. */
function textoCelda(c: Columna, p: PacienteMatriz): string {
  const v = c.valor(p)
  if (v === null) return '—'
  return c.etiqueta === 'superficie' && typeof v === 'number' ? formatearNumero(v, 2) : String(v)
}

/** El documento con la parte buscada resaltada, para ver de un vistazo por qué coincidió. */
function DocumentoResaltado({ documento, buscado }: { documento: string; buscado: string }) {
  const inicio = buscado ? documento.indexOf(buscado) : -1
  if (inicio < 0) return <>{documento}</>
  return (
    <>
      {documento.slice(0, inicio)}
      <mark className="rounded-sm bg-sky-200 text-slate-900">{documento.slice(inicio, inicio + buscado.length)}</mark>
      {documento.slice(inicio + buscado.length)}
    </>
  )
}

/** Encabezado de columna: fijo arriba dentro del recuadro con scroll de la tabla. */
const claseEncabezado =
  'sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 align-bottom text-[11px] font-semibold uppercase tracking-wider text-slate-600'

interface Props {
  pacientes: PacienteMatriz[] | undefined
  cargando: boolean
  /** Nombre del grupo como se lee en pantalla y en el Excel ("Pacientes pediátricos"). */
  grupo: string
  claveGrupo: GrupoActivo
  desde: string
  hasta: string
  filtros: Filtro[]
  onFiltrar: (campo: CampoFiltro, valor: string, etiqueta: string) => void
  nombreArchivo: string
}

/**
 * Matriz de resumen por paciente: una sola tabla con una fila por paciente operado y todas sus
 * variables en columnas, con un buscador por documento. Un clic en un valor filtra todo el tablero
 * por él (en las columnas numéricas, por su rango). Se descarga tal cual a Excel. Al buscar un
 * paciente por su documento, debajo de la tabla aparece todo lo que se le hizo.
 */
export function MatrizResumen({ pacientes, cargando, grupo, claveGrupo, desde, hasta, filtros, onFiltrar, nombreArchivo }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [descargando, setDescargando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState(false)
  const filas = pacientes ?? []
  // El documento solo tiene dígitos: se ignoran puntos, espacios o guiones al escribirlo
  // ("1.085.123" encuentra 1085123), y basta con una parte para encontrarlo.
  const buscado = busqueda.replace(/\D/g, '')
  const visibles = buscado ? filas.filter((p) => p.identificacion.includes(buscado)) : filas
  // El paciente del que se muestra todo lo que se le hizo: el único que queda a la vista o, si el
  // documento escrito también es parte de otros más largos, el que lo tiene exacto.
  const elegido = !buscado ? undefined : visibles.length === 1 ? visibles[0] : visibles.find((p) => p.identificacion === buscado)
  const periodo = `${formatearFecha(desde)} – ${formatearFecha(hasta)}`
  const filtrado = (campo: CampoFiltro) => filtros.some((f) => f.campo === campo)

  async function descargarExcel() {
    setDescargando(true)
    setErrorDescarga(false)
    try {
      // Carga diferida: exceljs pesa y solo hace falta al descargar (igual que en Exportar datos).
      const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')])
      const libro = new ExcelJS.Workbook()
      const hoja = libro.addWorksheet('Matriz por paciente', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] })
      hoja.columns = [{ width: 9 }, { width: 16 }, { width: 14 }, ...COLUMNAS.map((c) => ({ width: c.numerica ? 14 : 24 }))]
      const borde = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } }
      const bordes = { top: borde, bottom: borde, left: borde, right: borde }
      const condiciones = [
        ...filtros.map((f) => `${NOMBRE_CAMPO[f.campo]} = ${f.etiqueta}`),
        ...(buscado ? [`Documento contiene ${buscado}`] : []),
      ]

      hoja.addRow([`Matriz de resumen por paciente · ${grupo}`]).font = { bold: true, size: 14 }
      hoja.addRow([`Fecha de cirugía: ${periodo} · ${visibles.length} pacientes operados`])
      hoja.addRow([condiciones.length ? `Filtros: ${condiciones.join(' · ')}` : 'Sin filtros'])
      hoja.addRow([])
      const encabezado = hoja.addRow(['N.º', 'Documento', 'Fecha de cirugía', ...COLUMNAS.map(nombreColumna)])
      encabezado.eachCell((celda) => {
        celda.font = { bold: true }
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EDFA' } }
        celda.border = bordes
        celda.alignment = { vertical: 'middle', wrapText: true }
      })
      // Filtros de Excel en el encabezado, para que el equipo pueda ordenar y filtrar la matriz.
      hoja.autoFilter = { from: { row: encabezado.number, column: 1 }, to: { row: encabezado.number, column: 3 + COLUMNAS.length } }

      // Los valores van como números para poder usarlos en fórmulas; el documento, como texto (un
      // número de 10 o más cifras Excel lo mostraría en notación científica).
      const columnaSuperficie = 4 + COLUMNAS.findIndex((c) => c.etiqueta === 'superficie')
      for (const p of visibles) {
        const fila = hoja.addRow([p.numero_paciente, p.identificacion, formatearFecha(p.fecha_cirugia), ...COLUMNAS.map((c) => c.valor(p))])
        fila.eachCell({ includeEmpty: true }, (celda) => (celda.border = bordes))
        fila.getCell(columnaSuperficie).numFmt = '0.00'
      }

      const contenido = await libro.xlsx.writeBuffer()
      saveAs(new Blob([contenido], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo)
    } catch {
      setErrorDescarga(true)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo="Matriz de resumen por paciente"
        acciones={
          visibles.length > 0 && (
            <button type="button" onClick={() => void descargarExcel()} disabled={descargando} className={claseBotonSecundarioCompacto}>
              <IconoBajar />
              {descargando ? 'Generando…' : 'Descargar Excel'}
            </button>
          )
        }
      >
        <dl className="-mt-1 flex flex-wrap gap-x-10 gap-y-3">
          {[
            ['Grupo', grupo],
            ['Fecha de cirugía', periodo],
            ['Pacientes operados', String(filas.length)],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs text-slate-500">{etiqueta}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{valor}</dd>
            </div>
          ))}
        </dl>
        {errorDescarga && <p className="mt-4 text-sm text-red-700">No se pudo generar el archivo. Intente de nuevo.</p>}

        {cargando && !pacientes ? (
          <Cargando />
        ) : filas.length === 0 ? (
          <SinDatosGrafico />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Buscador por documento, con el mismo estilo que el de la lista de pacientes. */}
              <div className="group relative w-full sm:w-80">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--pabon-azul-oscuro)] opacity-60 transition-opacity group-focus-within:opacity-100">
                  <IconoBuscar className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  role="searchbox"
                  inputMode="numeric"
                  aria-label="Buscar paciente por documento"
                  placeholder="Buscar por documento…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setBusqueda('')
                  }}
                  className={`${claseInput} pl-9 ${busqueda ? 'border-sky-600 bg-sky-50 pr-9 hover:border-sky-700' : 'pr-3'}`}
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    aria-label="Borrar búsqueda"
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-[var(--pabon-azul-oscuro)] opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100"
                  >
                    <IconoCerrar className="h-4 w-4" />
                  </button>
                )}
              </div>
              {buscado && (
                <p className="text-sm text-slate-600" aria-live="polite">
                  <span className="font-semibold text-slate-900">{visibles.length}</span> de {filas.length}{' '}
                  {filas.length === 1 ? 'paciente' : 'pacientes'}
                </p>
              )}
              <p className="text-xs text-slate-500 sm:ml-auto">
                Clic en un documento para ver todo lo que se le hizo al paciente; en otro valor, para filtrar el tablero por él.
              </p>
            </div>

            {visibles.length === 0 ? (
              <EstadoVacio
                icono={<IconoBuscar className="h-6 w-6" />}
                titulo="Sin resultados"
                mensaje={`Ningún paciente operado en el periodo tiene un documento que contenga ${buscado}.`}
                accion={
                  <button type="button" onClick={() => setBusqueda('')} className={claseBotonSecundarioCompacto}>
                    Borrar búsqueda
                  </button>
                }
              />
            ) : (
              // Una sola tabla: una fila por paciente y todas sus variables en columnas. El recuadro tiene
              // su propio scroll para que el encabezado quede siempre a la vista (y, en pantallas
              // angostas, el N.º del paciente fijo a la izquierda).
              <div className="-mx-5 -mb-5 mt-3 max-h-[75vh] overflow-auto border-t border-slate-200">
                <table className="w-full min-w-[72.5rem] table-fixed text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={`${claseEncabezado} sticky left-0 z-20 w-[4.5rem] pl-5 text-left`}>N.º</th>
                      <th scope="col" className={`${claseEncabezado} w-[7rem] text-left`}>Documento</th>
                      <th scope="col" className={`${claseEncabezado} w-[6.5rem] text-left`}>Fecha de cirugía</th>
                      {COLUMNAS.map((c) => (
                        <th key={c.etiqueta} scope="col" className={`${claseEncabezado} ${c.ancho} ${c.numerica ? 'text-right' : 'text-left'}`}>
                          <span className={`flex items-center gap-1 ${c.numerica ? 'justify-end' : ''}`}>
                            {c.titulo}
                            {filtrado(c.campo) && <IconoFiltro className="h-3.5 w-3.5 flex-none text-[var(--pabon-azul-oscuro)]" aria-label="Filtrado" />}
                          </span>
                          {c.unidad && <span className="block font-normal normal-case">({c.unidad})</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((p) => (
                      <tr key={p.paciente_id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 hover:bg-sky-50/70">
                        <th scope="row" className="sticky left-0 z-[1] bg-inherit py-1.5 pr-3 pl-5 text-left font-semibold tabular-nums text-slate-900">
                          {p.numero_paciente}
                        </th>
                        <td className="px-3 py-1.5 tabular-nums text-slate-700">
                          {/* El documento completo en el buscador deja solo a este paciente, y con él su detalle. */}
                          <button
                            type="button"
                            onClick={() => setBusqueda(p.identificacion)}
                            title="Ver todo lo que se le hizo a este paciente"
                            className="block max-w-full truncate rounded-sm underline decoration-slate-300 underline-offset-2 outline-none hover:decoration-[var(--pabon-azul-oscuro)] focus-visible:ring-2 focus-visible:ring-[var(--pabon-azul-claro)]"
                          >
                            <DocumentoResaltado documento={p.identificacion} buscado={buscado} />
                          </button>
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-slate-700">{formatearFecha(p.fecha_cirugia)}</td>
                        {COLUMNAS.map((c) => {
                          const etiqueta = c.etiqueta === 'estado_herida' && p.seguimiento_no_aplica ? null : p.etiquetas[c.etiqueta]
                          return (
                            <td
                              key={c.etiqueta}
                              onClick={etiqueta ? () => onFiltrar(c.campo, etiqueta, etiqueta) : undefined}
                              title={etiqueta ? `Filtrar el tablero: ${NOMBRE_CAMPO[c.campo]} ${etiqueta}` : undefined}
                              className={`truncate px-3 py-1.5 text-slate-700 ${c.numerica ? 'text-right tabular-nums' : ''} ${etiqueta ? 'cursor-pointer hover:bg-sky-100 hover:text-slate-900' : ''}`}
                            >
                              {textoCelda(c, p)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Tarjeta>
      {elegido && <DetallePaciente key={elegido.paciente_id} grupo={claveGrupo} pacienteId={elegido.paciente_id} />}
    </div>
  )
}
