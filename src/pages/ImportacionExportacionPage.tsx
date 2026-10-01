import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { useState } from 'react'
import { claseBotonPrimario, claseBotonSecundario } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { MensajeError, MensajeExito } from '../components/Estados'
import { Tarjeta } from '../components/Tarjeta'
import { IconoBajar, IconoDocumento } from '../components/iconos'
import { ENCABEZADOS_EXPORTACION, ENCABEZADOS_EXPORTACION_ADULTOS } from '../lib/importacion'
import { api } from '../lib/api'

type FilaExportacion = Record<string, string | number | boolean | null>
type Encabezados = readonly (readonly [string, string])[]

const TIPOS_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Límites (índice de inicio) de cada módulo dentro de ENCABEZADOS_EXPORTACION* — el último
// elemento (undefined) deja el Módulo 5 abierto hasta el final del arreglo. Pediátricos y adultos
// tienen cortes distintos porque sus columnas no son las mismas (ver lib/importacion.ts).
const CORTES_PEDIATRICOS = [0, 12, 16, 25, 31, undefined] as const
const CORTES_ADULTOS = [0, 11, 15, 24, 32, undefined] as const

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

/** Agrega la hoja "Datos" (todas las columnas) y una hoja por módulo (1 a 5) de un grupo. Cuando se
 * exportan ambos grupos a la vez, `sufijo` evita nombres de hoja repetidos ("Módulo 1" por partida
 * doble no tendría sentido en un mismo libro); si se exporta un solo grupo, las hojas quedan con
 * el nombre de siempre. */
function agregarHojasGrupo(
  libro: ExcelJS.Workbook,
  filas: FilaExportacion[],
  encabezados: Encabezados,
  cortes: readonly [number, number, number, number, number, number | undefined],
  sufijo: string | null,
) {
  const nombre = (base: string) => (sufijo ? `${base} (${sufijo})` : base)
  prepararHoja(libro, nombre('Datos'), encabezados, filas)
  for (let modulo = 1; modulo <= 5; modulo++) {
    prepararHoja(libro, nombre(`Módulo ${modulo}`), encabezados.slice(cortes[modulo - 1], cortes[modulo]), filas)
  }
}

const obtenerFilasPediatricos = () => api.get<FilaExportacion[]>('/exportacion/pacientes')
const obtenerFilasAdultos = () => api.get<FilaExportacion[]>('/exportacion/pacientes-adultos')

export function ImportacionExportacionPage() {
  const [incluirPediatricos, setIncluirPediatricos] = useState(true)
  const [incluirAdultos, setIncluirAdultos] = useState(true)
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
        agregarHojasGrupo(libro, filas, ENCABEZADOS_EXPORTACION, CORTES_PEDIATRICOS, ambosGrupos ? 'Pediátricos' : null)
        resumen.push(`${filas.length} pediátricos`)
      }
      if (incluirAdultos) {
        const filas = await obtenerFilasAdultos()
        agregarHojasGrupo(libro, filas, ENCABEZADOS_EXPORTACION_ADULTOS, CORTES_ADULTOS, ambosGrupos ? 'Adultos' : null)
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

      <div className="space-y-6">
        <Tarjeta titulo="Exportar registros" icono={<IconoBajar />}>
          <p className="text-sm text-slate-500">
            Incluye pacientes activos y todos sus módulos: una hoja plana con todo y una hoja adicional por cada módulo (1 a 5).
          </p>

          <fieldset className="mt-4 flex flex-wrap gap-4">
            <legend className="mb-2 w-full text-xs font-semibold uppercase tracking-wide text-slate-400">¿Qué pacientes exportar?</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={incluirPediatricos}
                onChange={(e) => setIncluirPediatricos(e.target.checked)}
                className="h-4 w-4 accent-[var(--pabon-azul-oscuro)]"
              />
              Pacientes pediátricos
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={incluirAdultos}
                onChange={(e) => setIncluirAdultos(e.target.checked)}
                className="h-4 w-4 accent-[var(--pabon-azul-oscuro)]"
              />
              Pacientes adultos
            </label>
          </fieldset>
          {ningunGrupo && <p className="mt-2 text-xs text-amber-600">Seleccione al menos un grupo para exportar.</p>}

          <div className="mt-4 flex flex-wrap gap-3">
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
    </div>
  )
}
