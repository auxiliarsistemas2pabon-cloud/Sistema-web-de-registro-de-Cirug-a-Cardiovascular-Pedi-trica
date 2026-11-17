/** Neutraliza fórmulas, incluso después de espacios o controles, y conserva una única celda CSV. */
export function escaparCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  // eslint-disable-next-line no-control-regex -- Los controles pueden ocultar el inicio de una fórmula.
  if (typeof valor === 'string' && (/^[\s\u0000-\u001f]*[=+\-@]/u.test(texto) || /^[\t\r\n]/.test(texto))) {
    texto = `'${texto}`
  }
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}
