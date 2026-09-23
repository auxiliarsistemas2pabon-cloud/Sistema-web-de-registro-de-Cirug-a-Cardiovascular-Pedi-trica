// Set de iconos de línea compartido (mismo trazo que los ya usados en AlertasPage/AppShell:
// stroke="currentColor" strokeWidth={1.8}) para que toda la app use el mismo lenguaje visual
// en vez de mezclar estilos de icono por pantalla.
import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>

const base = (children: React.ReactNode, props: Props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" {...props}>
    {children}
  </svg>
)

export const IconoPacientes = (p: Props) =>
  base(
    <>
      <circle cx="9" cy="7.5" r="3" />
      <path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" strokeLinecap="round" />
      <path d="M16 8a2.6 2.6 0 1 1 0 5.2M18.5 19.5c0-2.6-1.7-4.5-4-5.2" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoBuscar = (p: Props) =>
  base(
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M19 19l-4-4" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoFiltro = (p: Props) =>
  base(<path d="M4 5h16M7 12h10M10 19h4" strokeLinecap="round" />, p)

export const IconoGrafico = (p: Props) =>
  base(
    <>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15v2M12 11v6M16 8v9" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoEngranaje = (p: Props) =>
  base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"
        strokeLinecap="round"
      />
    </>,
    p,
  )

export const IconoUsuarios = (p: Props) =>
  base(
    <>
      <circle cx="8.5" cy="8" r="3" />
      <circle cx="16" cy="9.5" r="2.4" />
      <path d="M2.7 19c.4-3 2.7-5 5.8-5s5.4 2 5.8 5" strokeLinecap="round" />
      <path d="M14.5 14.4c2.4.3 4.1 2 4.5 4.6" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoLista = (p: Props) =>
  base(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
      <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>,
    p,
  )

export const IconoEscudo = (p: Props) =>
  base(
    <>
      <path d="M12 3.5 19 6v6c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V6l7-2.5Z" strokeLinejoin="round" />
      <path d="M9.3 12.2l1.9 1.9 3.5-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    p,
  )

export const IconoSubir = (p: Props) =>
  base(
    <>
      <path d="M12 15V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoBajar = (p: Props) =>
  base(
    <>
      <path d="M12 4v11M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoUsuarioMas = (p: Props) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.2 2.5-5.4 6-5.4s6 2.2 6 5.4" strokeLinecap="round" />
      <path d="M18 8v4M16 10h4" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoDocumento = (p: Props) =>
  base(
    <>
      <path d="M7 3.5h7l3 3v13.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3.5V7h3M9 12h6M9 15.5h6" strokeLinecap="round" />
    </>,
    p,
  )

export const IconoCorazon = (p: Props) =>
  base(
    <path
      d="M12 20s-7.5-4.5-9.5-9.5C1.3 6.7 3.2 4 6.2 4c2 0 3.4 1.1 4 2.3.6-1.2 2-2.3 4-2.3 3 0 4.9 2.7 3.7 6.5C19.5 15.5 12 20 12 20Z"
      strokeLinejoin="round"
    />,
    p,
  )
