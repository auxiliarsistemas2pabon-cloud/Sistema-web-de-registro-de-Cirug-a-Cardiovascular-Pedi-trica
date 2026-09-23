import { useState } from 'react'
import { EncabezadoPagina } from '../components/EncabezadoPagina'
import { Tarjeta } from '../components/Tarjeta'
import { IconoEngranaje, IconoEscudo, IconoLista, IconoUsuarios } from '../components/iconos'
import { AuditoriaTab } from './administracion/AuditoriaTab'
import { ListasTab } from './administracion/ListasTab'
import { UsuariosTab } from './administracion/UsuariosTab'

const PESTANAS = [
  { clave: 'usuarios', etiqueta: 'Usuarios', icono: <IconoUsuarios /> },
  { clave: 'listas', etiqueta: 'Listas', icono: <IconoLista /> },
  { clave: 'auditoria', etiqueta: 'Auditoría', icono: <IconoEscudo /> },
] as const

type Pestana = (typeof PESTANAS)[number]['clave']

export function AdministracionPage() {
  const [pestana, setPestana] = useState<Pestana>('usuarios')

  return (
    <div>
      <EncabezadoPagina
        icono={<IconoEngranaje className="h-5 w-5" />}
        titulo="Administración"
        subtitulo="Usuarios y roles, listas desplegables y el historial de auditoría."
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setPestana(p.clave)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none ${
              pestana === p.clave ? 'bg-white text-[var(--pabon-azul-oscuro)] shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {p.icono}
            {p.etiqueta}
          </button>
        ))}
      </div>

      <Tarjeta>
        <div className="p-5">
          {pestana === 'usuarios' && <UsuariosTab />}
          {pestana === 'listas' && <ListasTab />}
          {pestana === 'auditoria' && <AuditoriaTab />}
        </div>
      </Tarjeta>
    </div>
  )
}
