import bcrypt from 'bcryptjs'
import { categorias, opciones } from './catalogos.mjs'
import { nuevoId } from './db.mjs'
import { validarClave } from './auth.mjs'

const ESTADO = "ENUM('pendiente','completo','no_aplica') NOT NULL DEFAULT 'pendiente'"
const AUDITORIA_COLS = `
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creado_por CHAR(36) NOT NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    actualizado_por CHAR(36) NULL`

const opcion = (columna) => `FOREIGN KEY (${columna}) REFERENCES opciones_lista(id)`

const tablas = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol ENUM('administrador','registrador','consulta') NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categorias_lista (
    id CHAR(36) PRIMARY KEY,
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Las opciones nunca se borran: solo se desactivan. `codigo` es el identificador estable que usan las
  // reglas de negocio y no se puede modificar.
  `CREATE TABLE IF NOT EXISTS opciones_lista (
    id CHAR(36) PRIMARY KEY,
    categoria_id CHAR(36) NOT NULL,
    codigo VARCHAR(80) NULL,
    valor VARCHAR(500) NOT NULL,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_opcion_valor (categoria_id, valor),
    UNIQUE KEY uq_opcion_codigo (categoria_id, codigo),
    FOREIGN KEY (categoria_id) REFERENCES categorias_lista(id)
  )`,
  `CREATE TABLE IF NOT EXISTS importaciones_lote (
    id CHAR(36) PRIMARY KEY,
    archivo_nombre VARCHAR(255) NOT NULL,
    cargado_por CHAR(36) NOT NULL,
    cargado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('en_revision','aplicado','descartado') NOT NULL DEFAULT 'en_revision',
    FOREIGN KEY (cargado_por) REFERENCES usuarios(id)
  )`,
  `CREATE TABLE IF NOT EXISTS pacientes (
    id CHAR(36) PRIMARY KEY,
    numero_paciente BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
    nombre_completo VARCHAR(255) NOT NULL,
    identificacion VARCHAR(50) NOT NULL UNIQUE,
    sexo_id CHAR(36) NULL,
    fecha_nacimiento DATE NOT NULL,
    peso_kg DECIMAL(5,2) NULL,
    talla_cm INT NULL,
    procedencia_id CHAR(36) NULL,
    municipio_narino_id CHAR(36) NULL,
    telefonos JSON NULL,
    sin_telefono BOOLEAN NOT NULL DEFAULT false,
    eps_id CHAR(36) NULL,
    estado_modulo ${ESTADO},
    origen ENUM('manual','importado') NOT NULL DEFAULT 'manual',
    lote_importacion_id CHAR(36) NULL,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    eliminado_en DATETIME NULL,
    eliminado_por CHAR(36) NULL,${AUDITORIA_COLS},
    CONSTRAINT ck_pac_identificacion CHECK (identificacion REGEXP '^[0-9]+$'),
    CONSTRAINT ck_pac_peso CHECK (peso_kg IS NULL OR peso_kg BETWEEN 0.5 AND 150),
    CONSTRAINT ck_pac_talla CHECK (talla_cm IS NULL OR talla_cm BETWEEN 30 AND 220),
    KEY ix_pac_eliminado (eliminado),
    KEY ix_pac_nombre (nombre_completo),
    ${opcion('sexo_id')}, ${opcion('procedencia_id')}, ${opcion('municipio_narino_id')}, ${opcion('eps_id')},
    FOREIGN KEY (lote_importacion_id) REFERENCES importaciones_lote(id),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (eliminado_por) REFERENCES usuarios(id)
  )`,
  `CREATE TABLE IF NOT EXISTS diagnosticos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    diagnostico_id CHAR(36) NULL,
    valvulopatia_id CHAR(36) NULL,
    rachs_id CHAR(36) NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('diagnostico_id')}, ${opcion('valvulopatia_id')}, ${opcion('rachs_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS diagnosticos_riesgos (
    id CHAR(36) PRIMARY KEY,
    diagnostico_id CHAR(36) NOT NULL,
    riesgo_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_diagnostico_riesgo (diagnostico_id, riesgo_id),
    FOREIGN KEY (diagnostico_id) REFERENCES diagnosticos(id),
    ${opcion('riesgo_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    fecha_cirugia DATE NULL,
    implante_id CHAR(36) NULL,
    uso_cec ENUM('SI','NO') NULL,
    tiempo_cec_min INT NULL,
    tiempo_clamp_min INT NULL,
    complicacion_intraqx_id CHAR(36) NULL,
    cierre_esternal_diferido ENUM('SI','NO') NULL,
    extubacion_quirofano ENUM('SI','NO') NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_cir_tiempos CHECK (tiempo_cec_min IS NULL OR tiempo_cec_min >= 0),
    CONSTRAINT ck_cir_clamp CHECK (tiempo_clamp_min IS NULL OR (tiempo_cec_min IS NOT NULL AND tiempo_clamp_min >= 0 AND tiempo_clamp_min <= tiempo_cec_min)),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('implante_id')}, ${opcion('complicacion_intraqx_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias_procedimientos (
    id CHAR(36) PRIMARY KEY,
    cirugia_id CHAR(36) NOT NULL,
    procedimiento_id CHAR(36) NOT NULL,
    orden TINYINT NOT NULL,
    CONSTRAINT ck_cp_orden CHECK (orden IN (1,2,3)),
    UNIQUE KEY uq_cirugia_orden (cirugia_id, orden),
    UNIQUE KEY uq_cirugia_procedimiento (cirugia_id, procedimiento_id),
    FOREIGN KEY (cirugia_id) REFERENCES cirugias(id),
    ${opcion('procedimiento_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS postoperatorio (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    unidad_pop_id CHAR(36) NULL,
    horas_ventilacion_mecanica INT NULL,
    complicacion_pop_id CHAR(36) NULL,
    fecha_traslado_intermedio DATE NULL,
    fecha_salida DATE NULL,
    condicion_salida_id CHAR(36) NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_pop_horas CHECK (horas_ventilacion_mecanica IS NULL OR horas_ventilacion_mecanica >= 0),
    CONSTRAINT ck_pop_fechas CHECK (fecha_traslado_intermedio IS NULL OR fecha_salida IS NULL OR fecha_salida >= fecha_traslado_intermedio),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('unidad_pop_id')}, ${opcion('complicacion_pop_id')}, ${opcion('condicion_salida_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS seguimientos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    no_aplica BOOLEAN NOT NULL DEFAULT false,
    fecha_control_cirugia DATE NULL,
    rehabilitacion_cardiaca ENUM('SI','NO','NA') NULL,
    estado_herida_id CHAR(36) NULL,
    fecha_llamada_15_dias DATE NULL,
    persona_recibe_llamada VARCHAR(255) NULL,
    reingreso_30_dias ENUM('SI','NO','NA') NULL,
    fecha_reingreso DATE NULL,
    causa_reingreso_id CHAR(36) NULL,
    observaciones TEXT NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_seg_reingreso CHECK (reingreso_30_dias IS NULL OR reingreso_30_dias <> 'SI' OR (fecha_reingreso IS NOT NULL AND causa_reingreso_id IS NOT NULL)),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('estado_herida_id')}, ${opcion('causa_reingreso_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tabla VARCHAR(100) NOT NULL,
    registro_id CHAR(36) NOT NULL,
    operacion ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    usuario_id CHAR(36) NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valores_anteriores JSON NULL,
    valores_nuevos JSON NULL,
    KEY ix_aud_tabla_registro (tabla, registro_id),
    KEY ix_aud_fecha (fecha),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`,
  `CREATE TABLE IF NOT EXISTS importaciones_filas (
    id CHAR(36) PRIMARY KEY,
    lote_id CHAR(36) NOT NULL,
    numero_fila INT NOT NULL,
    datos_originales JSON NOT NULL,
    datos_normalizados JSON NULL,
    errores JSON NULL,
    estado ENUM('pendiente','valido','con_errores','importado','descartado') NOT NULL DEFAULT 'pendiente',
    paciente_id CHAR(36) NULL,
    UNIQUE KEY uq_lote_fila (lote_id, numero_fila),
    FOREIGN KEY (lote_id) REFERENCES importaciones_lote(id),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  )`,
]

/** Crea las tablas si no existen, siembra las listas y, si no hay usuarios, el primer administrador. */
export async function inicializarBase(pool, admin) {
  for (const sentencia of tablas) await pool.query(sentencia)

  for (const [codigo, nombre] of categorias) {
    await pool.query('INSERT IGNORE INTO categorias_lista (id, codigo, nombre) VALUES (?, ?, ?)', [nuevoId(), codigo, nombre])
  }
  const [filasCategorias] = await pool.query('SELECT id, codigo FROM categorias_lista')
  const idsCategoria = new Map(filasCategorias.map((f) => [f.codigo, f.id]))

  // Solo se siembra una categoría si está vacía: así no se resucitan opciones que el Administrador desactivó
  // ni se duplican tras editar su texto.
  for (const [categoria, lista] of Object.entries(opciones)) {
    const categoriaId = idsCategoria.get(categoria)
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM opciones_lista WHERE categoria_id = ?', [categoriaId])
    if (total > 0) continue
    for (const o of lista) {
      await pool.query('INSERT INTO opciones_lista (id, categoria_id, codigo, valor, orden) VALUES (?, ?, ?, ?, ?)', [
        nuevoId(), categoriaId, o.codigo, o.valor, o.orden,
      ])
    }
  }

  const [[{ usuarios }]] = await pool.query('SELECT COUNT(*) AS usuarios FROM usuarios')
  if (usuarios === 0 && admin.email && admin.password) {
    const problema = validarClave(admin.password)
    if (problema) throw new Error(`INITIAL_ADMIN_PASSWORD no es segura: ${problema}`)
    await pool.query('INSERT INTO usuarios (id, email, password_hash, nombre_completo, rol) VALUES (?, ?, ?, ?, ?)', [
      nuevoId(), admin.email.toLowerCase(), await bcrypt.hash(admin.password, 12), admin.nombre, 'administrador',
    ])
    console.log(`Primer administrador creado: ${admin.email}`)
  }
}
