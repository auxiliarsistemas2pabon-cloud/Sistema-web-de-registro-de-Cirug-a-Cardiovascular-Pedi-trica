import { NOMBRES_MODULOS } from './modulos'
import type { ColumnaExportacion } from './importacion'

export type FilaExportacion = Record<string, string | number | boolean | null>

/** Columnas con respuesta Sí / No / No aplica: en la matriz se leen en palabras, no como SI/NO/NA. */
const COLUMNAS_SI_NO = new Set([
  'uso_cec', 'cierre_esternal_diferido', 'extubacion_quirofano', 'rehabilitacion_cardiaca', 'reingreso_30_dias', 'llamado_15_dias',
  'implante_1', 'implante_2', 'implante_3',
])
const TEXTO_SI_NO: Record<string, string> = { SI: 'Sí', NO: 'No', NA: 'No aplica' }
/** Van como texto aunque sean dígitos: un documento o un teléfono de 10 cifras Excel lo mostraría en
 * notación científica. */
const COLUMNAS_TEXTO = new Set(['identificacion', 'telefono', 'telefonos'])

/** El valor de una celda: fechas como fechas de Excel (se ordenan y filtran como tales), Sí/No en
 * palabras, documentos y teléfonos como texto y el resto tal cual (números como números). */
function valorCelda(clave: string, valor: FilaExportacion[string]): string | number | Date | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (COLUMNAS_SI_NO.has(clave)) return TEXTO_SI_NO[String(valor)] ?? String(valor)
  if (COLUMNAS_TEXTO.has(clave)) return String(valor)
  if (clave.startsWith('fecha_') && typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return new Date(`${valor}T00:00:00Z`)
  return valor
}

interface Opciones {
  /** Primera línea del encabezado ("Matriz por paciente · Pacientes adultos"). */
  titulo: string
  /** Segunda línea: periodo y cantidad de pacientes. */
  subtitulo: string
  /** Filtros y búsquedas aplicados, uno por elemento (vacío: "Sin filtros"). */
  condiciones: string[]
  columnas: readonly ColumnaExportacion[]
  filas: FilaExportacion[]
  nombreArchivo: string
}

/**
 * Descarga una matriz de Excel con una fila por paciente y todos sus campos en columnas, agrupadas por
 * módulo de la ficha (pedido del 23-oct: "que contenga todos los campos diligenciados del paciente").
 * exceljs se carga solo al descargar: pesa y no hace falta antes.
 */
export async function descargarMatrizExcel({ titulo, subtitulo, condiciones, columnas, filas, nombreArchivo }: Opciones) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')])
  const libro = new ExcelJS.Workbook()
  const filaModulos = 5
  const filaEncabezado = 6
  const hoja = libro.addWorksheet('Matriz por paciente', { views: [{ state: 'frozen', xSplit: 3, ySplit: filaEncabezado }] })
  hoja.columns = columnas.map(([clave, etiqueta]) => ({ key: clave, width: Math.min(Math.max(etiqueta.length + 2, 12), 40) }))

  const borde = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } }
  const bordes = { top: borde, bottom: borde, left: borde, right: borde }

  hoja.getCell('A1').value = titulo
  hoja.getCell('A1').font = { bold: true, size: 14 }
  hoja.getCell('A2').value = subtitulo
  hoja.getCell('A3').value = condiciones.length ? `Filtros: ${condiciones.join(' · ')}` : 'Sin filtros'

  // Una franja con el nombre de cada módulo sobre sus columnas, para ubicarse en una tabla tan ancha.
  let inicio = 1
  columnas.forEach(([, , modulo], i) => {
    const ultimo = i === columnas.length - 1 || columnas[i + 1][2] !== modulo
    if (!ultimo) return
    hoja.mergeCells(filaModulos, inicio, filaModulos, i + 1)
    const celda = hoja.getCell(filaModulos, inicio)
    celda.value = `Módulo ${modulo} · ${NOMBRES_MODULOS[modulo - 1]}`
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    celda.alignment = { vertical: 'middle' }
    inicio = i + 2
  })

  const encabezado = hoja.getRow(filaEncabezado)
  encabezado.values = columnas.map(([, etiqueta]) => etiqueta)
  encabezado.eachCell((celda) => {
    celda.font = { bold: true }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EDFA' } }
    celda.border = bordes
    celda.alignment = { vertical: 'middle', wrapText: true }
  })
  // Filtros de Excel en el encabezado, para que el equipo pueda ordenar y filtrar la matriz.
  hoja.autoFilter = { from: { row: filaEncabezado, column: 1 }, to: { row: filaEncabezado, column: columnas.length } }

  for (const fila of filas) {
    const agregada = hoja.addRow(columnas.map(([clave]) => valorCelda(clave, fila[clave])))
    agregada.eachCell({ includeEmpty: true }, (celda, numero) => {
      celda.border = bordes
      const clave = columnas[numero - 1]?.[0] ?? ''
      if (celda.value instanceof Date) celda.numFmt = 'dd/mm/yyyy'
      else if (clave === 'superficie_corporal') celda.numFmt = '0.00'
      else if (typeof celda.value === 'string' && celda.value.length > 40) celda.alignment = { wrapText: true, vertical: 'top' }
    })
  }

  const contenido = await libro.xlsx.writeBuffer()
  saveAs(new Blob([contenido], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo)
}
