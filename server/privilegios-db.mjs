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
  if (permisos.some((p) => {
    if (/^GRANT USAGE ON \*\.\* TO /.test(p) && !p.includes('WITH GRANT OPTION')) return false
    const tabla = /^GRANT ([A-Z, ]+) ON `[^`]+`\.`([^`]+)` TO /.exec(p)
    // También se rechazan roles, privilegios dinámicos y concesiones globales no reconocidas.
    if (!tabla || p.includes('WITH GRANT OPTION')) return true
    const permitidos = ['eventos_seguridad', 'auditoria'].includes(tabla[2]) ? ['SELECT', 'INSERT']
      : tabla[2] === 'migraciones_datos' ? ['SELECT'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    return tabla[1].split(',').some((valor) => !permitidos.includes(valor.trim()))
  })) {
    throw new Error('La cuenta de aplicación tiene privilegios excesivos. Use una cuenta separada de las migraciones y proteja la auditoría.')
  }
}
