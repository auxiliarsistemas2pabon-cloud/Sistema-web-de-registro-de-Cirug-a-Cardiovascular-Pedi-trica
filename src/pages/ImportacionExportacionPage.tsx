import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { useEffect, useState, type ReactNode } from 'react'
import { claseBotonPrimario, claseBotonSecundario } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { MensajeAdvertencia, MensajeError, MensajeExito } from '../components/Estados'
import { Tarjeta } from '../components/Tarjeta'
import { IconoAdultos, IconoBajar, IconoDocumento, IconoPacientes } from '../components/iconos'
import { ENCABEZADOS_EXPORTACION, ENCABEZADOS_EXPORTACION_ADULTOS, type ColumnaExportacion } from '../lib/importacion'
import { api } from '../lib/api'
import { useGrupoActivo } from '../lib/grupoActivo'

type FilaExportacion = Record<string, string | number | boolean | null>
type Encabezados = readonly ColumnaExportacion[]

const TIPOS_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Casilla grande (tarjeta seleccionable) para elegir un grupo de pacientes. */
function OpcionGrupo({
  marcado,
  onCambiar,
  icono,
  titulo,
  detalle,
}: {
  marcado: boolean
  onCambiar: (marcado: boolean) => void
  icono: ReactNode
  titulo: string
  detalle: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[var(--pabon-azul-claro)]/40 ${
        marcado ? 'border-[var(--pabon-azul-oscuro)] bg-sky-50/50 ring-1 ring-[var(--pabon-azul-oscuro)]' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => onCambiar(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-[var(--pabon-azul-oscuro)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-[var(--pabon-azul-oscuro)]">{icono}</span>
          {titulo}
        </span>
        <span className="mt-1 block text-xs text-slate-500">{detalle}</span>
      </span>
    </label>
  )
}

function fechaArchivo(): string {
  return new Date().toLocaleDateString('en-CA')
}

function escaparCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function prepararHoja(libro: ExcelJS.Workbook, nombre: string, columnas: Encabezados, filas: FilaExportacion[]) {
  const hoja = libro.addWorksheet(nombre)
  hoja.addRow(columnas.map(([, etiqueta]) => etiqueta))
  for (const fila of filas) hoja.addRow(columnas.map(([clave]) => fila[clave] ?? ''))
  hoja.getRow(1).font = { bold: true }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.columns.forEach((columna, indice) => {
    const etiqueta = columnas[indice]?.[1] ?? ''
    columna.width = Math.min(Math.max(etiqueta.length + 2, 14), 38)
  })
}

/** Agrega la hoja "Datos" (todas las columnas) y una hoja por módulo (1 a 5) de un grupo, con las
 * columnas que ENCABEZADOS_EXPORTACION* marca de ese módulo. Cuando se exportan ambos grupos a la vez,
 * `sufijo` evita nombres de hoja repetidos ("Módulo 1" por partida doble no tendría sentido en un
 * mismo libro); si se exporta un solo grupo, las hojas quedan con el nombre de siempre. */
function agregarHojasGrupo(libro: ExcelJS.Workbook, filas: FilaExportacion[], encabezados: Encabezados, sufijo: string | null) {
  const nombre = (base: string) => (sufijo ? `${base} (${sufijo})` : base)
  prepararHoja(libro, nombre('Datos'), encabezados, filas)
  for (const modulo of [1, 2, 3, 4, 5] as const) {
    prepararHoja(libro, nombre(`Módulo ${modulo}`), encabezados.filter(([, , m]) => m === modulo), filas)
  }
}

/**
 * En el archivo descargado el N° de paciente va seguido desde 1, una fila tras otra (pedido del
 * 30-oct): el del sistema tiene huecos (pacientes eliminados o números ya usados) que en una tabla se
 * leen como faltantes. En adultos cada intervención es una fila y cuenta como un paciente más: quien
 * fue operado dos veces aparece dos veces, con dos números (la columna "N° intervención" dice cuál es).
 */
function numerarDesdeUno(filas: FilaExportacion[]): FilaExportacion[] {
  return filas.map((fila, i) => ({ ...fila, numero_paciente: i + 1 }))
}

const obtenerFilasPediatricos = async () => numerarDesdeUno(await api.get<FilaExportacion[]>('/exportacion/pacientes'))
const obtenerFilasAdultos = async () => numerarDesdeUno(await api.get<FilaExportacion[]>('/exportacion/pacientes-adultos'))

export function ImportacionExportacionPage() {
  // Las casillas se ponen solas según el grupo activo del menú (Pediátricos o Adultos) — no solo
  // al entrar a la página, sino cada vez que ese grupo cambia — pero se pueden ajustar a mano (o
  // marcar los dos) antes de exportar, sin que ese ajuste manual se pierda mientras el grupo activo
  // no vuelva a cambiar.
  const { grupo } = useGrupoActivo()
  const [incluirPediatricos, setIncluirPediatricos] = useState(grupo === 'pediatricos')
  const [incluirAdultos, setIncluirAdultos] = useState(grupo === 'adultos')

  useEffect(() => {
    setIncluirPediatricos(grupo === 'pediatricos')
    setIncluirAdultos(grupo === 'adultos')
  }, [grupo])
  const [exportando, setExportando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ningunGrupo = !incluirPediatricos && !incluirAdultos
  const ambosGrupos = incluirPediatricos && incluirAdultos

  async function descargarExcel() {
    if (ningunGrupo) return
    setError(null)
    setMensaje(null)
    setExportando(true)
    try {
      const libro = new ExcelJS.Workbook()
      const resumen: string[] = []
      if (incluirPediatricos) {
        const filas = await obtenerFilasPediatricos()
        agregarHojasGrupo(libro, filas, ENCABEZADOS_EXPORTACION, ambosGrupos ? 'Pediátricos' : null)
        resumen.push(`${filas.length} pediátricos`)
      }
      if (incluirAdultos) {
        const filas = await obtenerFilasAdultos()
        agregarHojasGrupo(libro, filas, ENCABEZADOS_EXPORTACION_ADULTOS, ambosGrupos ? 'Adultos' : null)
        resumen.push(`${filas.length} adultos`)
      }
      const contenido = await libro.xlsx.writeBuffer()
      const sufijoArchivo = ambosGrupos ? '' : incluirAdultos ? '-adultos' : '-pediatricos'
      saveAs(new Blob([contenido], { type: TIPOS_XLSX }), `cirugia-cardiovascular${sufijoArchivo}-${fechaArchivo()}.xlsx`)
      setMensaje(`Se exportaron ${resumen.join(' y ')} pacientes en Excel.`)
    } catch {
      setError('No se pudo generar el archivo Excel.')
    } finally {
      setExportando(false)
    }
  }

  async function descargarCsv() {
    // El botón solo está habilitado con exactamente un grupo marcado (ver JSX): un CSV es una
    // sola tabla plana y pediátricos/adultos no comparten columnas (RACHS-1 vs EuroSCORE, etc.),
    // mezclarlos dejaría la mitad de las columnas vacías según la fila. Para los dos grupos a la
    // vez, Excel sí tiene sentido porque cada uno va en sus propias hojas.
    if (ningunGrupo || ambosGrupos) return
    setError(null)
    setMensaje(null)
    setExportando(true)
    try {
      const filas = incluirAdultos ? await obtenerFilasAdultos() : await obtenerFilasPediatricos()
      const columnas = incluirAdultos ? ENCABEZADOS_EXPORTACION_ADULTOS : ENCABEZADOS_EXPORTACION
      const contenido = [
        columnas.map(([, etiqueta]) => escaparCsv(etiqueta)).join(','),
        ...filas.map((fila) => columnas.map(([clave]) => escaparCsv(fila[clave])).join(',')),
      ].join('\r\n')
      const sufijoArchivo = incluirAdultos ? '-adultos' : '-pediatricos'
      saveAs(new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' }), `cirugia-cardiovascular${sufijoArchivo}-${fechaArchivo()}.csv`)
      setMensaje(`Se exportaron ${filas.length} pacientes ${incluirAdultos ? 'adultos' : 'pediátricos'} en CSV.`)
    } catch {
      setError('No se pudo generar el archivo CSV.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <EncabezadoPagina
        icono={<IconoDocumento className="h-5 w-5" />}
        titulo="Exportar datos"
        subtitulo="Descarga los pacientes activos y todos sus módulos en Excel o CSV, pediátricos y/o adultos."
      />

      {/* En pantalla ancha, al lado va qué trae el archivo: antes la tarjeta dejaba un tercio vacío. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Tarjeta titulo="Exportar registros" icono={<IconoBajar />}>
          <p className="text-sm text-slate-500">
            Incluye pacientes activos y todos sus módulos: una hoja plana con todo y una hoja adicional por cada módulo (1 a 5).
          </p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">¿Qué pacientes exportar?</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <OpcionGrupo
                marcado={incluirPediatricos}
                onCambiar={setIncluirPediatricos}
                icono={<IconoPacientes className="h-4 w-4" />}
                titulo="Pacientes pediátricos"
                detalle={'Cirugía cardiovascular pediátrica, con escala RACHS\u20111.' /* guion que no se parte */}
              />
              <OpcionGrupo
                marcado={incluirAdultos}
                onCambiar={setIncluirAdultos}
                icono={<IconoAdultos className="h-4 w-4" />}
                titulo="Pacientes adultos"
                detalle="Pacientes de 18 años o más, con escala EuroSCORE."
              />
            </div>
          </fieldset>
          {ningunGrupo && (
            <div className="mt-3">
              <MensajeAdvertencia>Seleccione al menos un grupo para exportar.</MensajeAdvertencia>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={() => void descargarExcel()} disabled={exportando || ningunGrupo} className={claseBotonPrimario}>
              <IconoBajar className="h-4 w-4" /> {exportando ? 'Generando…' : 'Descargar Excel'}
            </button>
            <button
              type="button"
              onClick={() => void descargarCsv()}
              disabled={exportando || ningunGrupo || ambosGrupos}
              title={ambosGrupos ? 'El CSV es una sola tabla: elija solo pediátricos o solo adultos (o use Excel para los dos).' : undefined}
              className={claseBotonSecundario}
            >
              <IconoBajar className="h-4 w-4" /> Descargar CSV
            </button>
          </div>
          {ambosGrupos && (
            <p className="mt-2 text-xs text-slate-500">
              Con los dos grupos marcados, el CSV queda deshabilitado (pediátricos y adultos no comparten las mismas columnas); use Excel, que los exporta en hojas separadas.
            </p>
          )}
        </Tarjeta>

        {mensaje && <MensajeExito>{mensaje}</MensajeExito>}
        {error && <MensajeError>{error}</MensajeError>}
      </div>

      <Tarjeta titulo="Qué trae el archivo" icono={<IconoDocumento />}>
        <ul className="space-y-3 text-sm text-slate-700">
          {CONTENIDO_ARCHIVO.map(([titulo, texto]) => (
            <li key={titulo} className="flex gap-3">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pabon-azul-oscuro)]" />
              <span>
                <span className="font-medium text-slate-900">{titulo}.</span> {texto}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
      </div>
    </div>
  )
}

/** Lo que conviene saber del archivo antes de abrirlo (pedidos del 29 y 30-oct). */
const CONTENIDO_ARCHIVO: [titulo: string, texto: string][] = [
  ['Hojas', 'En Excel, una hoja "Datos" con todas las columnas y una por cada módulo (1 a 5). El CSV es una sola tabla.'],
  ['Una fila por cirugía', 'Un paciente que reingresó y se operó otra vez aparece en otra fila, como paciente aparte.'],
  ['N° de paciente', 'Va seguido desde 1 en el archivo. Para ubicar a alguien en la aplicación, use la columna Identificación.'],
  ['Solo pacientes activos', 'Los pacientes eliminados no se exportan.'],
]
