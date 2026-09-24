import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { useState } from 'react'
import { claseBotonPrimario, claseBotonSecundario } from '../components/Campo'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { MensajeError, MensajeExito } from '../components/Estados'
import { Tarjeta } from '../components/Tarjeta'
import { IconoBajar, IconoDocumento } from '../components/iconos'
import { ENCABEZADOS_EXPORTACION } from '../lib/importacion'
import { api } from '../lib/api'

type FilaExportacion = Record<string, string | number | boolean | null>

const TIPOS_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function fechaArchivo(): string {
  return new Date().toLocaleDateString('en-CA')
}

function escaparCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function prepararHoja(
  libro: ExcelJS.Workbook,
  nombre: string,
  columnas: readonly (readonly [string, string])[],
  filas: FilaExportacion[],
) {
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

async function obtenerFilasExportacion(): Promise<FilaExportacion[]> {
  return api.get<FilaExportacion[]>('/exportacion/pacientes')
}

export function ImportacionExportacionPage() {
  const [exportando, setExportando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function descargarExcel() {
    setError(null)
    setMensaje(null)
    setExportando(true)
    try {
      const filasExportacion = await obtenerFilasExportacion()
      const libro = new ExcelJS.Workbook()
      prepararHoja(libro, 'Datos', ENCABEZADOS_EXPORTACION, filasExportacion)
      prepararHoja(libro, 'Módulo 1', ENCABEZADOS_EXPORTACION.slice(0, 12), filasExportacion)
      prepararHoja(libro, 'Módulo 2', ENCABEZADOS_EXPORTACION.slice(12, 16), filasExportacion)
      prepararHoja(libro, 'Módulo 3', ENCABEZADOS_EXPORTACION.slice(16, 25), filasExportacion)
      prepararHoja(libro, 'Módulo 4', ENCABEZADOS_EXPORTACION.slice(25, 31), filasExportacion)
      prepararHoja(libro, 'Módulo 5', ENCABEZADOS_EXPORTACION.slice(31), filasExportacion)
      const contenido = await libro.xlsx.writeBuffer()
      saveAs(new Blob([contenido], { type: TIPOS_XLSX }), `cirugia-cardiovascular-${fechaArchivo()}.xlsx`)
      setMensaje(`Se exportaron ${filasExportacion.length} pacientes en Excel.`)
    } catch {
      setError('No se pudo generar el archivo Excel.')
    } finally {
      setExportando(false)
    }
  }

  async function descargarCsv() {
    setError(null)
    setMensaje(null)
    setExportando(true)
    try {
      const filasExportacion = await obtenerFilasExportacion()
      const columnas = ENCABEZADOS_EXPORTACION
      const contenido = [
        columnas.map(([, etiqueta]) => escaparCsv(etiqueta)).join(','),
        ...filasExportacion.map((fila) => columnas.map(([clave]) => escaparCsv(fila[clave])).join(',')),
      ].join('\r\n')
      saveAs(new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' }), `cirugia-cardiovascular-${fechaArchivo()}.csv`)
      setMensaje(`Se exportaron ${filasExportacion.length} pacientes en CSV.`)
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
        subtitulo="Descarga los pacientes activos y todos sus módulos en Excel o CSV."
      />

      <div className="space-y-6">
        <Tarjeta titulo="Exportar registros" icono={<IconoBajar />}>
          <p className="text-sm text-slate-500">
            Incluye pacientes activos y todos sus módulos: una hoja plana con todo y una hoja adicional por cada módulo (1 a 5).
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void descargarExcel()} disabled={exportando} className={claseBotonPrimario}>
              <IconoBajar className="h-4 w-4" /> {exportando ? 'Generando…' : 'Descargar Excel'}
            </button>
            <button type="button" onClick={() => void descargarCsv()} disabled={exportando} className={claseBotonSecundario}>
              <IconoBajar className="h-4 w-4" /> Descargar CSV
            </button>
          </div>
        </Tarjeta>

        {mensaje && <MensajeExito>{mensaje}</MensajeExito>}
        {error && <MensajeError>{error}</MensajeError>}
      </div>
    </div>
  )
}
