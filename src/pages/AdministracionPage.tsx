import { useState } from 'react'
import { AuditoriaTab } from './administracion/AuditoriaTab'
import { ListasTab } from './administracion/ListasTab'
import { UsuariosTab } from './administracion/UsuariosTab'

const PESTANAS = [
  { clave: 'usuarios', etiqueta: 'Usuarios' },
  { clave: 'listas', etiqueta: 'Listas' },
  { clave: 'auditoria', etiqueta: 'Auditoría' },
] as const

type Pestana = (typeof PESTANAS)[number]['clave']

export function AdministracionPage() {
  const [pestana, setPestana] = useState<Pestana>('usuarios')

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Administración</h1>

      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setPestana(p.clave)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              pestana === p.clave
                ? 'border-sky-600 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' && <UsuariosTab />}
      {pestana === 'listas' && <ListasTab />}
      {pestana === 'auditoria' && <AuditoriaTab />}
    </div>
  )
}
