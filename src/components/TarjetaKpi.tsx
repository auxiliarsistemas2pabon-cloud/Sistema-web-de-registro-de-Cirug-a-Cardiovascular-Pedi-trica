interface Props {
  etiqueta: string
  valor: string
  tono?: 'normal' | 'critico'
}

export function TarjetaKpi({ etiqueta, valor, tono = 'normal' }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ color: tono === 'critico' ? 'var(--status-critical)' : undefined }}
      >
        <span className={tono === 'normal' ? 'text-slate-900 dark:text-slate-100' : ''}>{valor}</span>
      </p>
    </div>
  )
}
