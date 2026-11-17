export async function concederPrivilegiosAplicacion(conexion, base, usuario, host = '%') {
  const db = conexion.escapeId(base)
  const cuenta = `${conexion.escape(usuario)}@${conexion.escape(host)}`
  const [tablas] = await conexion.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [base])
  for (const { TABLE_NAME: tabla } of tablas) {
    const privilegios = ['eventos_seguridad', 'auditoria'].includes(tabla) ? 'SELECT, INSERT'
      : tabla === 'migraciones_datos' ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE'
    await conexion.query(`GRANT ${privilegios} ON ${db}.${conexion.escapeId(tabla)} TO ${cuenta}`)
  }
}

export async function verificarPrivilegiosAplicacion(conexion) {
  const [filas] = await conexion.query('SHOW GRANTS FOR CURRENT_USER')
  const permisos = filas.map((fila) => String(Object.values(fila)[0]))
  if (permisos.some((p) => /\b(ALL PRIVILEGES|CREATE|ALTER|DROP|FILE|PROCESS|SUPER|GRANT OPTION|SYSTEM_USER)\b/.test(p)
    || (!p.startsWith('GRANT USAGE ') && / ON (?:`[^`]+`|\*)\.\*/.test(p))
    || (/ ON `[^`]+`\.`(?:eventos_seguridad|auditoria)`/.test(p) && /\b(UPDATE|DELETE)\b/.test(p)))) {
    throw new Error('La cuenta de aplicación tiene privilegios excesivos. Use una cuenta separada de las migraciones y proteja la auditoría.')
  }
}
