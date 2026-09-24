import { useMemo, useRef, useState } from 'react'
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { useOpciones } from '../hooks/useOpciones'
import { claseInput } from './Campo'
import { api, mensajeDe } from '../lib/api'
import type { OpcionLista } from '../types/db'

interface Props<T extends FieldValues> {
  categoria: string
  control: Control<T>
  name: Path<T>
  disabled?: boolean
  placeholder?: string
  /** Vuelve el campo un cuadro de texto con autocompletar (filtra a medida que se escribe) en vez de un <select> nativo. Útil para listas largas con nombres compuestos (diagnósticos, procedimientos). */
  buscable?: boolean
  /** Solo con buscable: si el texto escrito no existe en la lista, ofrece crearlo (queda disponible para todos los pacientes, no solo como texto suelto de este). */
  permiteCrear?: boolean
}

/** Quita tildes/mayúsculas para comparar texto sin que un acento cambie el resultado. */
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * <select> de una categoría de opciones_lista, atado a react-hook-form vía useController
 * (no vía register): las opciones llegan de una consulta async, y con register() el valor
 * inicial se asigna sobre el <select> nativo antes de que esas <option> existan, así que el
 * navegador lo descarta en silencio y el campo se queda vacío aunque el dato sí esté guardado.
 * useController mantiene `value` como prop controlada, que React vuelve a aplicar en cada
 * render (incluida la llegada tardía de las opciones), así que siempre queda sincronizado.
 */
export function SelectOpciones<T extends FieldValues>({
  categoria,
  control,
  name,
  disabled,
  placeholder = 'Seleccione…',
  buscable = false,
  permiteCrear = false,
}: Props<T>) {
  const { data: opciones, isLoading } = useOpciones(categoria)
  const { field } = useController({ control, name })

  if (buscable) {
    return (
      <ComboboxOpciones
        categoria={categoria}
        permiteCrear={permiteCrear}
        opciones={opciones}
        isLoading={isLoading}
        disabled={disabled}
        placeholder={placeholder}
        value={(field.value as string) ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        inputRef={field.ref}
      />
    )
  }

  return (
    <select
      name={field.name}
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      disabled={disabled || isLoading}
      className={claseInput}
    >
      <option value="">{placeholder}</option>
      {opciones?.map((opcion) => (
        <option key={opcion.id} value={opcion.id}>
          {opcion.valor}
        </option>
      ))}
    </select>
  )
}

interface ComboboxProps {
  categoria: string
  permiteCrear: boolean
  opciones: OpcionLista[] | undefined
  isLoading: boolean
  disabled?: boolean
  placeholder: string
  value: string
  onChange: (id: string) => void
  onBlur: () => void
  name: string
  inputRef: (el: HTMLInputElement | null) => void
}

/** Cuadro de texto con autocompletar: escribe cualquier parte del nombre y filtra las opciones que la contengan. */
function ComboboxOpciones({ categoria, permiteCrear, opciones, isLoading, disabled, placeholder, value, onChange, onBlur, name, inputRef }: ComboboxProps) {
  const queryClient = useQueryClient()
  const [filtro, setFiltro] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)

  const etiquetaSeleccionada = opciones?.find((o) => o.id === value)?.valor ?? ''
  const textoMostrado = filtro ?? etiquetaSeleccionada

  const opcionesFiltradas = useMemo(() => {
    if (!opciones) return []
    if (filtro === null || filtro === '') return opciones
    const buscado = normalizar(filtro)
    return opciones.filter((o) => normalizar(o.valor).includes(buscado))
  }, [opciones, filtro])

  const textoNuevo = (filtro ?? '').trim()
  const yaExiste = opciones?.some((o) => normalizar(o.valor) === normalizar(textoNuevo))
  const puedeCrear = permiteCrear && textoNuevo !== '' && !yaExiste

  function seleccionar(opcion: OpcionLista | null) {
    onChange(opcion?.id ?? '')
    setFiltro(null)
    setErrorCrear(null)
    setAbierto(false)
  }

  async function crear() {
    if (!textoNuevo || creando) return
    setCreando(true)
    setErrorCrear(null)
    try {
      const creada = await api.post<{ id: string; valor: string; creada: boolean }>('/listas/opciones', {
        categoria,
        valor: textoNuevo,
      })
      queryClient.setQueryData<OpcionLista[]>(['opciones', categoria], (actuales) => {
        if (!actuales || actuales.some((o) => o.id === creada.id)) return actuales
        return [...actuales, { id: creada.id, categoria_id: '', codigo: null, valor: creada.valor, orden: 9999, activo: true }]
      })
      onChange(creada.id)
      setFiltro(null)
      setAbierto(false)
    } catch (causa) {
      setErrorCrear(mensajeDe(causa, 'No se pudo crear la opción.'))
    } finally {
      setCreando(false)
    }
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    const totalFilas = opcionesFiltradas.length + (puedeCrear ? 1 : 0)
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setAbierto(true)
      setResaltado((r) => Math.min(r + 1, totalFilas - 1))
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setResaltado((r) => Math.max(r - 1, 0))
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      if (!abierto) return
      if (resaltado < opcionesFiltradas.length) {
        if (opcionesFiltradas[resaltado]) seleccionar(opcionesFiltradas[resaltado])
      } else if (puedeCrear) {
        void crear()
      }
    } else if (evento.key === 'Escape') {
      setFiltro(null)
      setErrorCrear(null)
      setAbierto(false)
    }
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <input
        type="text"
        name={name}
        ref={inputRef}
        value={textoMostrado}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        autoComplete="off"
        className={claseInput}
        onFocus={() => {
          setAbierto(true)
          setResaltado(0)
        }}
        onChange={(e) => {
          setFiltro(e.target.value)
          setAbierto(true)
          setResaltado(0)
        }}
        onKeyDown={alTeclear}
        onBlur={() => {
          setFiltro(null)
          setErrorCrear(null)
          setAbierto(false)
          onBlur()
        }}
      />
      {value && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault()
            seleccionar(null)
          }}
          className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
          aria-label="Quitar selección"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {abierto && !disabled && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {opcionesFiltradas.length === 0 && !puedeCrear && <li className="px-3 py-2 text-slate-400">Sin coincidencias.</li>}
          {opcionesFiltradas.map((opcion, indice) => (
            <li key={opcion.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  seleccionar(opcion)
                }}
                onMouseEnter={() => setResaltado(indice)}
                className={`block w-full px-3 py-2 text-left ${
                  indice === resaltado ? 'bg-sky-50 text-[var(--pabon-azul-oscuro)]' : 'text-slate-700'
                } ${opcion.id === value ? 'font-semibold' : ''}`}
              >
                {opcion.valor}
              </button>
            </li>
          ))}
          {puedeCrear && (
            <li className="border-t border-slate-100">
              <button
                type="button"
                disabled={creando}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void crear()
                }}
                onMouseEnter={() => setResaltado(opcionesFiltradas.length)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left font-medium ${
                  resaltado === opcionesFiltradas.length ? 'bg-sky-50' : ''
                } text-[var(--pabon-azul-oscuro)] disabled:opacity-60`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 flex-none">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                {creando ? 'Creando…' : <>Crear "{textoNuevo}"</>}
              </button>
            </li>
          )}
        </ul>
      )}
      {errorCrear && <p className="mt-1 text-xs text-red-600">{errorCrear}</p>}
    </div>
  )
}
