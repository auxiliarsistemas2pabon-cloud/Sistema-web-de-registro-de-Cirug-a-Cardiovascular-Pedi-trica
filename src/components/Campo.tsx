import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  error?: string
  children: ReactNode
  className?: string
}

export function Campo({ etiqueta, error, children, className }: CampoProps) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {etiqueta}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export const claseInput =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800'
