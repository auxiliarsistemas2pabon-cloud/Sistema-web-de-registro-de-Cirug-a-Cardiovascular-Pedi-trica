import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  ENCABEZADOS_EXPORTACION,
  marcarIdentificacionesDuplicadas,
  normalizarFilaImportacion,
  type FilaImportacion,
  type OpcionImportacion,
} from '../lib/importacion'
import { api, mensajeDe } from '../lib/api'

type FilaExportacion = Record<string, string | number | boolean | null>

const TIPOS_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TAMANO_CONSULTA = 500

function fechaArchivo(): string {
  return new Date().toLocaleDateString('en-CA')
}

function textoCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toLocaleDateString('en-CA')
  if (typeof valor === 'object') {
    const objeto = valor as { text?: unknown; result?: unknown; richText?: { text?: unknown }[] }
    if (typeof objeto.result === 'string' || typeof objeto.result === 'number') return String(objeto.result)
    if (typeof objeto.text === 'string') return objeto.text
    if (Array.isArray(objeto.richText)) return objeto.richText.map((fragmento) => fragmento.text ?? '').join('')
  }
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  return String(valor).trim()
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

function useOpcionesImportacion() {
  return useQuery({
    queryKey: ['opciones-importacion'],
    queryFn: async (): Promise<OpcionImportacion[]> => {
      const opciones = await api.get<{ id: string; valor: string; codigo: string | null; categoria_codigo: string }[]>('/listas/opciones')
      return opciones.map((o) => ({ id: o.id, valor: o.valor, codigo: o.codigo, categoria: o.categoria_codigo }))
    },
  })
}

async function leerFilasArchivo(archivo: File): Promise<Record<string, string>[]> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await archivo.arrayBuffer())
  const hoja = libro.worksheets[0]
  if (!hoja || hoja.rowCount < 2) throw new Error('El archivo debe incluir una fila de encabezados y al menos una fila de datos.')

  const encabezados: string[] = []
  const maxColumnas = hoja.getRow(1).cellCount
  for (let columna = 1; columna <= maxColumnas; columna += 1) {
    encabezados.push(textoCelda(hoja.getRow(1).getCell(columna).value))
  }
  if (!encabezados.some(Boolean)) throw new Error('No se encontraron encabezados en la primera fila.')

  const filas: Record<string, string>[] = []
  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila += 1) {
    const fila: Record<string, string> = {}
    let tieneDatos = false
    for (let columna = 1; columna <= maxColumnas; columna += 1) {
      const encabezado = encabezados[columna - 1]
      if (!encabezado) continue
      const valor = textoCelda(hoja.getRow(numeroFila).getCell(columna).value)
      if (valor) tieneDatos = true
      fila[encabezado] = valor
    }
    if (tieneDatos) filas.push(fila)
  }
  return filas
}

function añadirErroresPorExistentes(filas: FilaImportacion[], existentes: Set<string>): FilaImportacion[] {
  return filas.map((fila) => {
    const paciente = fila.normalizado?.paciente as { identificacion?: string } | undefined
    if (!paciente?.identificacion || !existentes.has(paciente.identificacion)) return fila
    return {
      ...fila,
      normalizado: null,
      errores: [...fila.errores, 'Ya existe un paciente con esta identificación en la base de datos.'],
      estado: 'con_errores',
    }
  })
}

export function ImportacionExportacionPage() {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const { data: opciones, isLoading: cargandoOpciones } = useOpcionesImportacion()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaImportacion[]>([])
  const [procesando, setProcesando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const puedeImportar = perfil?.rol === 'administrador' || perfil?.rol === 'registrador'
  const validas = filas.filter((fila) => fila.estado === 'valido')
  const conErrores = filas.filter((fila) => fila.estado === 'con_errores')

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
      saveAs(new Blob([`\ufeff${contenido}`], { type: 'text/csv;charset=utf-8' }), `cirugia-cardiovascular-${fechaArchivo()}.csv`)
      setMensaje(`Se exportaron ${filasExportacion.length} pacientes en CSV.`)
    } catch {
      setError('No se pudo generar el archivo CSV.')
    } finally {
      setExportando(false)
    }
  }

  async function descargarPlantilla() {
    const libro = new ExcelJS.Workbook()
    prepararHoja(libro, 'Datos', ENCABEZADOS_EXPORTACION, [])
    const contenido = await libro.xlsx.writeBuffer()
    saveAs(new Blob([contenido], { type: TIPOS_XLSX }), 'plantilla-importacion-cirugia.xlsx')
  }

  async function guardarEnStaging(nombreArchivo: string, filasNormalizadas: FilaImportacion[]): Promise<FilaImportacion[]> {
    if (!perfil) throw new Error('No se encontró la sesión del usuario.')
    const { filas: creadas } = await api.post<{ lote_id: string; filas: { numero_fila: number; id: string }[] }>('/importaciones/lotes', {
      archivo_nombre: nombreArchivo,
      filas: filasNormalizadas.map((fila) => ({
        numero_fila: fila.numeroFila,
        datos_originales: fila.datosOriginales,
        datos_normalizados: fila.normalizado,
        errores: fila.errores,
        estado: fila.estado,
      })),
    })
    const idsStaging = new Map(creadas.map((f) => [f.numero_fila, f.id]))
    return filasNormalizadas.map((fila) => ({ ...fila, idStaging: idsStaging.get(fila.numeroFila) }))
  }

  async function prepararImportacion() {
    if (!archivo || !opciones) return
    if (!archivo.name.toLowerCase().endsWith('.xlsx')) {
      setError('Seleccione un archivo con extensión .xlsx.')
      return
    }
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const crudas = await leerFilasArchivo(archivo)
      let normalizadas = crudas.map((fila, indice) => normalizarFilaImportacion(indice + 2, fila, opciones))
      normalizadas = marcarIdentificacionesDuplicadas(normalizadas)

      const identificaciones = normalizadas
        .map((fila) => (fila.normalizado?.paciente as { identificacion?: string } | undefined)?.identificacion)
        .filter((id): id is string => !!id)
      if (identificaciones.length > 0) {
        const existentes = new Set<string>()
        for (let inicio = 0; inicio < identificaciones.length; inicio += TAMANO_CONSULTA) {
          const respuesta = await api.post<{ existentes: string[] }>('/importaciones/identificaciones-existentes', {
            identificaciones: identificaciones.slice(inicio, inicio + TAMANO_CONSULTA),
          })
          for (const id of respuesta.existentes) existentes.add(id)
        }
        normalizadas = añadirErroresPorExistentes(normalizadas, existentes)
      }

      const conStaging = await guardarEnStaging(archivo.name, normalizadas)
      setFilas(conStaging)
      setMensaje(`Vista previa creada: ${conStaging.length} filas analizadas. Revise los errores antes de importar.`)
    } catch (causa) {
      setError(mensajeDe(causa, causa instanceof Error ? causa.message : 'No se pudo analizar el archivo.'))
      setFilas([])
    } finally {
      setProcesando(false)
    }
  }

  async function importarFilasValidas() {
    if (validas.length === 0) return
    setImportando(true)
    setError(null)
    let importadas = 0
    const actualizadas = [...filas]
    for (let indice = 0; indice < actualizadas.length; indice += 1) {
      const fila = actualizadas[indice]
      if (fila.estado !== 'valido' || !fila.idStaging) continue
      try {
        await api.post(`/importaciones/filas/${fila.idStaging}/aplicar`)
        actualizadas[indice] = { ...fila, estado: 'importado' }
        importadas += 1
      } catch (causa) {
        // El servidor ya dejó la fila en "con_errores" con el motivo; aquí solo se refleja en pantalla.
        actualizadas[indice] = { ...fila, normalizado: null, estado: 'con_errores', errores: [...fila.errores, mensajeDe(causa)] }
      }
    }
    setFilas(actualizadas)
    setMensaje(`${importadas} ${importadas === 1 ? 'fila fue importada' : 'filas fueron importadas'}.`)
    setImportando(false)
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    queryClient.invalidateQueries({ queryKey: ['indicadores'] })
    queryClient.invalidateQueries({ queryKey: ['alertas'] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Importar y exportar datos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Los archivos se procesan en formato Excel (.xlsx). La vista previa no crea pacientes hasta confirmar la importación.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exportar registros</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Incluye pacientes activos y todos sus módulos, en una hoja plana y hojas separadas por módulo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void descargarExcel()} disabled={exportando} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
            {exportando ? 'Generando…' : 'Descargar Excel'}
          </button>
          <button type="button" onClick={() => void descargarCsv()} disabled={exportando} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
            Descargar CSV
          </button>
        </div>
      </section>

      {puedeImportar && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Importar base existente</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Se limpian espacios y valores N/A, se convierten los números y se validan fechas, listas y duplicados.
              </p>
            </div>
            <button type="button" onClick={() => void descargarPlantilla()} className="text-sm font-medium text-sky-600 hover:underline">
              Descargar plantilla
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(evento) => {
                setArchivo(evento.target.files?.[0] ?? null)
                setFilas([])
                setError(null)
                setMensaje(null)
              }}
              className="max-w-full text-sm text-slate-600 dark:text-slate-300"
            />
            <button type="button" onClick={() => void prepararImportacion()} disabled={!archivo || cargandoOpciones || procesando} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
              {procesando ? 'Analizando…' : 'Crear vista previa'}
            </button>
          </div>

          {filas.length > 0 && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <span className="text-slate-700 dark:text-slate-200">
                  {filas.length} filas: <strong className="text-emerald-700 dark:text-emerald-400">{validas.length} válidas</strong>,{' '}
                  <strong className="text-red-700 dark:text-red-400">{conErrores.length} con errores</strong>,{' '}
                  {filas.filter((fila) => fila.estado === 'importado').length} importadas.
                </span>
                {validas.length > 0 && (
                  <button type="button" onClick={() => void importarFilasValidas()} disabled={importando} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                    {importando ? 'Importando…' : `Importar ${validas.length} filas válidas`}
                  </button>
                )}
              </div>

              {conErrores.length > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Corrija las filas con error en el archivo y vuelva a cargarlo. Las filas válidas pueden importarse ahora.
                </p>
              )}

              <div className="max-h-96 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Paciente</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Detalle</th></tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 100).map((fila) => {
                      const paciente = fila.normalizado?.paciente as { nombre_completo?: string; identificacion?: string } | undefined
                      const nombreOriginal = fila.datosOriginales['Nombre completo'] ?? fila.datosOriginales['nombre_completo'] ?? '—'
                      return (
                        <tr key={fila.numeroFila} className="border-t border-slate-100 align-top dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-500">{fila.numeroFila}</td>
                          <td className="px-3 py-2">{paciente?.nombre_completo ?? nombreOriginal}{paciente?.identificacion ? ` · ${paciente.identificacion}` : ''}</td>
                          <td className="px-3 py-2">
                            <span className={fila.estado === 'importado' ? 'text-emerald-700' : fila.estado === 'valido' ? 'text-sky-700' : 'text-red-700'}>
                              {fila.estado === 'importado' ? 'Importada' : fila.estado === 'valido' ? 'Válida' : 'Con errores'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{fila.errores.join(' ') || 'Lista para importar.'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filas.length > 100 && <p className="text-xs text-slate-500">Se muestran las primeras 100 filas de la vista previa.</p>}
            </div>
          )}
        </section>
      )}

      {mensaje && <p className="text-sm text-emerald-700 dark:text-emerald-400">{mensaje}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
