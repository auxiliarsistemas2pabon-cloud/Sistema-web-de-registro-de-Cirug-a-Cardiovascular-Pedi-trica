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
  // Diagnósticos además del principal, de la misma lista y sin límite. Antes era uno solo
  // (diagnostico_adicional_id, ver migrarDiagnosticoAdicionalSiExisteColumna). Un diagnóstico se puede
  // repetir (p. ej. dos valvulopatías), cada uno con su propio tipo de valvulopatía; `orden` es el orden
  // en que se agregaron en la ficha.
  `CREATE TABLE IF NOT EXISTS diagnosticos_adicionales (
    id CHAR(36) PRIMARY KEY,
    diagnostico_id CHAR(36) NOT NULL,
    adicional_id CHAR(36) NOT NULL,
    especificacion VARCHAR(255) NULL,
    valvulopatia_id CHAR(36) NULL,
    orden SMALLINT NOT NULL,
    FOREIGN KEY (diagnostico_id) REFERENCES diagnosticos(id),
    ${opcion('adicional_id')}, ${opcion('valvulopatia_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    fecha_cirugia DATE NULL,
    fecha_procedimiento_2 DATE NULL,
    fecha_procedimiento_3 DATE NULL,
    implante_id CHAR(36) NULL,
    uso_cec ENUM('SI','NO') NULL,
    tiempo_cec_min INT NULL,
    tiempo_clamp_min INT NULL,
    cierre_esternal_diferido ENUM('SI','NO') NULL,
    extubacion_quirofano ENUM('SI','NO') NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_cir_tiempos CHECK (tiempo_cec_min IS NULL OR tiempo_cec_min >= 0),
    CONSTRAINT ck_cir_clamp CHECK (tiempo_clamp_min IS NULL OR (tiempo_cec_min IS NOT NULL AND tiempo_clamp_min >= 0 AND tiempo_clamp_min <= tiempo_cec_min)),
    -- Cada procedimiento adicional necesita su propia fecha y no puede compartir día con el anterior:
    -- son intervenciones distintas, no procedimientos simultáneos de una misma cirugía.
    CONSTRAINT ck_cir_fecha2_posterior CHECK (fecha_procedimiento_2 IS NULL OR (fecha_cirugia IS NOT NULL AND fecha_procedimiento_2 > fecha_cirugia)),
    CONSTRAINT ck_cir_fecha3_posterior CHECK (fecha_procedimiento_3 IS NULL OR (fecha_procedimiento_2 IS NOT NULL AND fecha_procedimiento_3 > fecha_procedimiento_2)),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('implante_id')}
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
  // Complicación intraquirúrgica/postoperatoria dejaron de ser una sola opción (complicacion_*_id en
  // cirugias/postoperatorio, más abajo en `columnasRetiradas`) para permitir una o varias, igual que
  // ya funcionaba `diagnosticos_riesgos`. Mismo patrón: tabla puente sin `orden` (no hay un "primer"
  // o "segundo" complicación clínicamente, a diferencia de los procedimientos quirúrgicos).
  `CREATE TABLE IF NOT EXISTS cirugias_complicaciones_intraqx (
    id CHAR(36) PRIMARY KEY,
    cirugia_id CHAR(36) NOT NULL,
    complicacion_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_cir_complicacion (cirugia_id, complicacion_id),
    FOREIGN KEY (cirugia_id) REFERENCES cirugias(id),
    ${opcion('complicacion_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS postoperatorio (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    unidad_pop_id CHAR(36) NULL,
    horas_ventilacion_mecanica INT NULL,
    fecha_traslado_intermedio DATE NULL,
    fecha_salida DATE NULL,
    condicion_salida_id CHAR(36) NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_pop_horas CHECK (horas_ventilacion_mecanica IS NULL OR horas_ventilacion_mecanica >= 0),
    CONSTRAINT ck_pop_fechas CHECK (fecha_traslado_intermedio IS NULL OR fecha_salida IS NULL OR fecha_salida >= fecha_traslado_intermedio),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    ${opcion('unidad_pop_id')}, ${opcion('condicion_salida_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS postoperatorio_complicaciones_pop (
    id CHAR(36) PRIMARY KEY,
    postoperatorio_id CHAR(36) NOT NULL,
    complicacion_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_pop_complicacion (postoperatorio_id, complicacion_id),
    FOREIGN KEY (postoperatorio_id) REFERENCES postoperatorio(id),
    ${opcion('complicacion_id')}
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

  // -----------------------------------------------------------------------------------------
  // Módulo de adultos: mismos 5 módulos y el mismo patrón 1:1 por paciente que el módulo
  // pediátrico de arriba, en tablas propias (no una columna "tipo_paciente" sobre `pacientes`)
  // porque los rangos válidos (peso, talla), las listas de diagnóstico/riesgo/procedimientos y
  // algunas reglas (edad mínima, sin RACHS-1, EuroSCORE en vez de RACHS-1) son distintos.
  // -----------------------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS pacientes_adultos (
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
    telefono VARCHAR(50) NULL,
    eps_id CHAR(36) NULL,
    estado_modulo ${ESTADO},
    origen ENUM('manual','importado') NOT NULL DEFAULT 'manual',
    eliminado BOOLEAN NOT NULL DEFAULT false,
    eliminado_en DATETIME NULL,
    eliminado_por CHAR(36) NULL,${AUDITORIA_COLS},
    CONSTRAINT ck_pacad_identificacion CHECK (identificacion REGEXP '^[0-9]+$'),
    CONSTRAINT ck_pacad_peso CHECK (peso_kg IS NULL OR peso_kg BETWEEN 30 AND 300),
    CONSTRAINT ck_pacad_talla CHECK (talla_cm IS NULL OR talla_cm BETWEEN 120 AND 230),
    KEY ix_pacad_eliminado (eliminado),
    KEY ix_pacad_nombre (nombre_completo),
    ${opcion('sexo_id')}, ${opcion('procedencia_id')}, ${opcion('municipio_narino_id')}, ${opcion('eps_id')},
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (eliminado_por) REFERENCES usuarios(id)
  )`,
  // Un paciente adulto puede tener varias intervenciones (p. ej. una cirugía y luego una
  // reintervención meses después); cada una agrupa su propio diagnóstico, cirugía, postoperatorio
  // y seguimiento (ver diagnosticos_adultos/cirugias_adultos/postoperatorio_adultos/
  // seguimientos_adultos más abajo, que referencian episodio_id en vez de paciente_id). El episodio
  // 1 se crea junto con el paciente (crearPacienteAdulto en servicios-adultos.mjs); los siguientes
  // se agregan desde la ficha ("+ Agregar intervención").
  `CREATE TABLE IF NOT EXISTS episodios_adultos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL,
    numero_episodio TINYINT UNSIGNED NOT NULL,${AUDITORIA_COLS},
    CONSTRAINT ck_epiad_numero CHECK (numero_episodio >= 1),
    UNIQUE KEY uq_epiad_numero (paciente_id, numero_episodio),
    FOREIGN KEY (paciente_id) REFERENCES pacientes_adultos(id)
  )`,
  `CREATE TABLE IF NOT EXISTS diagnosticos_adultos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    diagnostico_id CHAR(36) NULL,
    valvulopatia_id CHAR(36) NULL,
    euroscore DECIMAL(5,2) NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_diagad_euroscore CHECK (euroscore IS NULL OR euroscore BETWEEN 0 AND 100),
    FOREIGN KEY (paciente_id) REFERENCES pacientes_adultos(id),
    ${opcion('diagnostico_id')}, ${opcion('valvulopatia_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS diagnosticos_adultos_riesgos (
    id CHAR(36) PRIMARY KEY,
    diagnostico_id CHAR(36) NOT NULL,
    riesgo_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_diagad_riesgo (diagnostico_id, riesgo_id),
    FOREIGN KEY (diagnostico_id) REFERENCES diagnosticos_adultos(id),
    ${opcion('riesgo_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS diagnosticos_adultos_adicionales (
    id CHAR(36) PRIMARY KEY,
    diagnostico_id CHAR(36) NOT NULL,
    adicional_id CHAR(36) NOT NULL,
    especificacion VARCHAR(255) NULL,
    valvulopatia_id CHAR(36) NULL,
    orden SMALLINT NOT NULL,
    FOREIGN KEY (diagnostico_id) REFERENCES diagnosticos_adultos(id),
    ${opcion('adicional_id')}, ${opcion('valvulopatia_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias_adultos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    fecha_cirugia DATE NULL,
    implante_id CHAR(36) NULL,
    uso_cec ENUM('SI','NO') NULL,
    tiempo_cec_min INT NULL,
    tiempo_clamp_min INT NULL,
    cierre_esternal_diferido ENUM('SI','NO') NULL,
    extubacion_quirofano ENUM('SI','NO') NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_cirad_tiempos CHECK (tiempo_cec_min IS NULL OR tiempo_cec_min >= 0),
    CONSTRAINT ck_cirad_clamp CHECK (tiempo_clamp_min IS NULL OR (tiempo_cec_min IS NOT NULL AND tiempo_clamp_min >= 0 AND tiempo_clamp_min <= tiempo_cec_min)),
    FOREIGN KEY (paciente_id) REFERENCES pacientes_adultos(id),
    ${opcion('implante_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias_adultos_procedimientos (
    id CHAR(36) PRIMARY KEY,
    cirugia_id CHAR(36) NOT NULL,
    procedimiento_id CHAR(36) NOT NULL,
    orden TINYINT NOT NULL,
    CONSTRAINT ck_cpad_orden CHECK (orden IN (1,2,3)),
    UNIQUE KEY uq_cirugiaad_orden (cirugia_id, orden),
    UNIQUE KEY uq_cirugiaad_procedimiento (cirugia_id, procedimiento_id),
    FOREIGN KEY (cirugia_id) REFERENCES cirugias_adultos(id),
    ${opcion('procedimiento_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS cirugias_adultos_complicaciones_intraqx (
    id CHAR(36) PRIMARY KEY,
    cirugia_id CHAR(36) NOT NULL,
    complicacion_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_cirad_complicacion (cirugia_id, complicacion_id),
    FOREIGN KEY (cirugia_id) REFERENCES cirugias_adultos(id),
    ${opcion('complicacion_id')}
  )`,
  // dias_estancia_uci y dias_hospitalizacion_total se escribían a mano; desde el pedido del 23-oct se
  // calculan de las fechas (ver sqlDiasUci en servicios.mjs) y estas columnas quedan en desuso.
  `CREATE TABLE IF NOT EXISTS postoperatorio_adultos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    unidad_pop_id CHAR(36) NULL,
    horas_ventilacion_mecanica INT NULL,
    fecha_traslado_intermedio DATE NULL,
    dias_estancia_uci INT NULL,
    fecha_salida DATE NULL,
    dias_hospitalizacion_total INT NULL,
    condicion_salida_id CHAR(36) NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_popad_horas CHECK (horas_ventilacion_mecanica IS NULL OR horas_ventilacion_mecanica >= 0),
    CONSTRAINT ck_popad_dias_uci CHECK (dias_estancia_uci IS NULL OR dias_estancia_uci >= 0),
    CONSTRAINT ck_popad_dias_hosp CHECK (dias_hospitalizacion_total IS NULL OR dias_hospitalizacion_total >= 0),
    CONSTRAINT ck_popad_fechas CHECK (fecha_traslado_intermedio IS NULL OR fecha_salida IS NULL OR fecha_salida >= fecha_traslado_intermedio),
    FOREIGN KEY (paciente_id) REFERENCES pacientes_adultos(id),
    ${opcion('unidad_pop_id')}, ${opcion('condicion_salida_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS postoperatorio_adultos_complicaciones_pop (
    id CHAR(36) PRIMARY KEY,
    postoperatorio_id CHAR(36) NOT NULL,
    complicacion_id CHAR(36) NOT NULL,
    UNIQUE KEY uq_popad_complicacion (postoperatorio_id, complicacion_id),
    FOREIGN KEY (postoperatorio_id) REFERENCES postoperatorio_adultos(id),
    ${opcion('complicacion_id')}
  )`,
  `CREATE TABLE IF NOT EXISTS seguimientos_adultos (
    id CHAR(36) PRIMARY KEY,
    paciente_id CHAR(36) NOT NULL UNIQUE,
    no_aplica BOOLEAN NOT NULL DEFAULT false,
    fecha_control_cirugia DATE NULL,
    rehabilitacion_cardiaca ENUM('SI','NO','NA') NULL,
    estado_herida_id CHAR(36) NULL,
    llamado_15_dias ENUM('SI','NO') NULL,
    persona_recibe_llamada VARCHAR(255) NULL,
    reingreso_30_dias ENUM('SI','NO') NULL,
    fecha_reingreso DATE NULL,
    causa_reingreso_id CHAR(36) NULL,
    observaciones TEXT NULL,
    estado_modulo ${ESTADO},${AUDITORIA_COLS},
    CONSTRAINT ck_segad_reingreso CHECK (reingreso_30_dias IS NULL OR reingreso_30_dias <> 'SI' OR (fecha_reingreso IS NOT NULL AND causa_reingreso_id IS NOT NULL)),
    FOREIGN KEY (paciente_id) REFERENCES pacientes_adultos(id),
    ${opcion('estado_herida_id')}, ${opcion('causa_reingreso_id')}
  )`,
  // Migraciones de datos que deben correr una sola vez por base (ver migrarUnaVez más abajo).
  `CREATE TABLE IF NOT EXISTS migraciones_datos (
    nombre VARCHAR(100) PRIMARY KEY,
    aplicada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
]

// Columnas y restricciones que se agregaron después de la creación inicial de las tablas: `CREATE TABLE
// IF NOT EXISTS` no las añade a una base ya existente, así que se aplican aparte y de forma idempotente.
// MySQL (a diferencia de MariaDB) no soporta "ADD COLUMN/CONSTRAINT IF NOT EXISTS", así que cada
// alteración se intenta y se ignora si ya fue aplicada en una ejecución anterior.
const alteraciones = [
  ['cirugias', 'fecha_procedimiento_2', `ALTER TABLE cirugias ADD COLUMN fecha_procedimiento_2 DATE NULL AFTER fecha_cirugia`],
  ['cirugias', 'fecha_procedimiento_3', `ALTER TABLE cirugias ADD COLUMN fecha_procedimiento_3 DATE NULL AFTER fecha_procedimiento_2`],
  ['cirugias', 'numero_implante', `ALTER TABLE cirugias ADD COLUMN numero_implante VARCHAR(100) NULL AFTER implante_id`],
  ['cirugias_adultos', 'numero_implante', `ALTER TABLE cirugias_adultos ADD COLUMN numero_implante VARCHAR(100) NULL AFTER implante_id`],
  // Columnas del formato original del hospital (FR-GCC-21) que no tenían campo propio: se agregaron
  // como texto libre. En desuso desde el pedido del 23-oct, que las quitó de la ficha, del detalle y
  // de la exportación: las columnas se conservan con lo que el servicio ya había registrado.
  ['diagnosticos_adultos', 'estado_preoperatorio', `ALTER TABLE diagnosticos_adultos ADD COLUMN estado_preoperatorio TEXT NULL`],
  ['diagnosticos_adultos', 'antecedentes_quirurgicos', `ALTER TABLE diagnosticos_adultos ADD COLUMN antecedentes_quirurgicos TEXT NULL AFTER estado_preoperatorio`],
  ['diagnosticos_adultos', 'comorbilidades', `ALTER TABLE diagnosticos_adultos ADD COLUMN comorbilidades TEXT NULL AFTER antecedentes_quirurgicos`],
  ['cirugias_adultos', 'transfusion_intraoperatoria', `ALTER TABLE cirugias_adultos ADD COLUMN transfusion_intraoperatoria TEXT NULL`],
  // Paso 1 de la migración a episodios (ver EPISODIO_ADULTO_TABLAS más abajo): columna nueva,
  // nullable, para poder backfillear antes de quitar paciente_id. Sin "AFTER paciente_id": una vez
  // que un arranque anterior ya quitó esa columna, esa cláusula fallaría (MySQL valida la columna
  // de referencia antes de notar que episodio_id ya existe) y este ALTER debe poder reintentarse
  // en cada arranque sin error.
  ['diagnosticos_adultos', 'episodio_id', `ALTER TABLE diagnosticos_adultos ADD COLUMN episodio_id CHAR(36) NULL`],
  ['cirugias_adultos', 'episodio_id', `ALTER TABLE cirugias_adultos ADD COLUMN episodio_id CHAR(36) NULL`],
  ['postoperatorio_adultos', 'episodio_id', `ALTER TABLE postoperatorio_adultos ADD COLUMN episodio_id CHAR(36) NULL`],
  ['seguimientos_adultos', 'episodio_id', `ALTER TABLE seguimientos_adultos ADD COLUMN episodio_id CHAR(36) NULL`],

  // Pedido del 23-oct. Al elegir una opción "Otro…" se escribe cuál: una columna de texto por campo de
  // selección única y, en los de selección múltiple y en los procedimientos, en la fila de la tabla
  // puente (puede haber más de una opción "otro" elegida a la vez).
  ['pacientes', 'sexo_otro', `ALTER TABLE pacientes ADD COLUMN sexo_otro VARCHAR(255) NULL AFTER sexo_id`],
  ['pacientes', 'procedencia_otro', `ALTER TABLE pacientes ADD COLUMN procedencia_otro VARCHAR(255) NULL AFTER procedencia_id`],
  ['pacientes', 'eps_otro', `ALTER TABLE pacientes ADD COLUMN eps_otro VARCHAR(255) NULL AFTER eps_id`],
  ['pacientes_adultos', 'sexo_otro', `ALTER TABLE pacientes_adultos ADD COLUMN sexo_otro VARCHAR(255) NULL AFTER sexo_id`],
  ['pacientes_adultos', 'procedencia_otro', `ALTER TABLE pacientes_adultos ADD COLUMN procedencia_otro VARCHAR(255) NULL AFTER procedencia_id`],
  ['pacientes_adultos', 'eps_otro', `ALTER TABLE pacientes_adultos ADD COLUMN eps_otro VARCHAR(255) NULL AFTER eps_id`],
  ['diagnosticos', 'diagnostico_otro', `ALTER TABLE diagnosticos ADD COLUMN diagnostico_otro VARCHAR(255) NULL AFTER diagnostico_id`],
  ['diagnosticos_adultos', 'diagnostico_otro', `ALTER TABLE diagnosticos_adultos ADD COLUMN diagnostico_otro VARCHAR(255) NULL AFTER diagnostico_id`],
  ['diagnosticos_riesgos', 'especificacion', `ALTER TABLE diagnosticos_riesgos ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['diagnosticos_adultos_riesgos', 'especificacion', `ALTER TABLE diagnosticos_adultos_riesgos ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['cirugias_procedimientos', 'especificacion', `ALTER TABLE cirugias_procedimientos ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['cirugias_adultos_procedimientos', 'especificacion', `ALTER TABLE cirugias_adultos_procedimientos ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['cirugias_complicaciones_intraqx', 'especificacion', `ALTER TABLE cirugias_complicaciones_intraqx ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['cirugias_adultos_complicaciones_intraqx', 'especificacion', `ALTER TABLE cirugias_adultos_complicaciones_intraqx ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['postoperatorio', 'condicion_salida_otro', `ALTER TABLE postoperatorio ADD COLUMN condicion_salida_otro VARCHAR(255) NULL AFTER condicion_salida_id`],
  ['postoperatorio_adultos', 'condicion_salida_otro', `ALTER TABLE postoperatorio_adultos ADD COLUMN condicion_salida_otro VARCHAR(255) NULL AFTER condicion_salida_id`],
  ['postoperatorio_complicaciones_pop', 'especificacion', `ALTER TABLE postoperatorio_complicaciones_pop ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['postoperatorio_adultos_complicaciones_pop', 'especificacion', `ALTER TABLE postoperatorio_adultos_complicaciones_pop ADD COLUMN especificacion VARCHAR(255) NULL`],
  ['seguimientos', 'estado_herida_otro', `ALTER TABLE seguimientos ADD COLUMN estado_herida_otro VARCHAR(255) NULL AFTER estado_herida_id`],
  ['seguimientos', 'causa_reingreso_otro', `ALTER TABLE seguimientos ADD COLUMN causa_reingreso_otro VARCHAR(255) NULL AFTER causa_reingreso_id`],
  ['seguimientos_adultos', 'estado_herida_otro', `ALTER TABLE seguimientos_adultos ADD COLUMN estado_herida_otro VARCHAR(255) NULL AFTER estado_herida_id`],
  ['seguimientos_adultos', 'causa_reingreso_otro', `ALTER TABLE seguimientos_adultos ADD COLUMN causa_reingreso_otro VARCHAR(255) NULL AFTER causa_reingreso_id`],
  // El implante pasa de uno por cirugía a uno por procedimiento: "¿lleva implante?" (Sí / No / No
  // aplica) y, solo si lleva, su tipo. cirugias(_adultos).implante_id y numero_implante quedan en
  // desuso (ver migrarImplantePorProcedimiento).
  ['cirugias_procedimientos', 'implante', `ALTER TABLE cirugias_procedimientos ADD COLUMN implante ENUM('SI','NO','NA') NULL`],
  ['cirugias_procedimientos', 'tipo_implante_id', `ALTER TABLE cirugias_procedimientos ADD COLUMN tipo_implante_id CHAR(36) NULL AFTER implante`],
  ['cirugias_adultos_procedimientos', 'implante', `ALTER TABLE cirugias_adultos_procedimientos ADD COLUMN implante ENUM('SI','NO','NA') NULL`],
  ['cirugias_adultos_procedimientos', 'tipo_implante_id', `ALTER TABLE cirugias_adultos_procedimientos ADD COLUMN tipo_implante_id CHAR(36) NULL AFTER implante`],
  // Adultos solo guardaban si se hizo la llamada (Sí/No); ahora también el día en que se hizo.
  ['seguimientos_adultos', 'fecha_llamada_15_dias', `ALTER TABLE seguimientos_adultos ADD COLUMN fecha_llamada_15_dias DATE NULL AFTER llamado_15_dias`],
]

// Llaves foráneas de las columnas de lista agregadas arriba (las de las tablas originales van en su CREATE TABLE).
const llavesForaneas = [
  ['fk_cp_tipo_implante', 'cirugias_procedimientos', 'FOREIGN KEY (tipo_implante_id) REFERENCES opciones_lista(id)'],
  ['fk_cpad_tipo_implante', 'cirugias_adultos_procedimientos', 'FOREIGN KEY (tipo_implante_id) REFERENCES opciones_lista(id)'],
]

const restricciones = [
  ['ck_cir_fecha2_posterior', 'cirugias', 'CHECK (fecha_procedimiento_2 IS NULL OR (fecha_cirugia IS NOT NULL AND fecha_procedimiento_2 > fecha_cirugia))'],
  ['ck_cir_fecha3_posterior', 'cirugias', 'CHECK (fecha_procedimiento_3 IS NULL OR (fecha_procedimiento_2 IS NOT NULL AND fecha_procedimiento_3 > fecha_procedimiento_2))'],
]

// Columnas que dejaron de usarse. `usuarios.rol` distinguía Administrador, Registrador y Consulta; ya no
// hay roles (todo usuario es administrador), y como era NOT NULL sin valor por defecto hay que quitarla
// de las bases que ya existían para poder crear usuarios. Las 4 de complicaciones se retiran porque esa
// relación pasó de "una sola opción" a la tabla puente correspondiente (ver `tablas` arriba) — antes de
// quitarlas, `migrarComplicaciones` copia cualquier valor existente a la tabla puente para no perderlo.
const columnasRetiradas = [
  ['usuarios', 'rol'],
  ['cirugias', 'complicacion_intraqx_id'],
  ['postoperatorio', 'complicacion_pop_id'],
  ['cirugias_adultos', 'complicacion_intraqx_id'],
  ['postoperatorio_adultos', 'complicacion_pop_id'],
  // El diagnóstico adicional único pasó a la tabla puente diagnosticos(_adultos)_adicionales.
  ['diagnosticos', 'diagnostico_adicional_id'],
  ['diagnosticos', 'diagnostico_adicional_otro'],
  ['diagnosticos_adultos', 'diagnostico_adicional_id'],
  ['diagnosticos_adultos', 'diagnostico_adicional_otro'],
]

// Migra el valor único de complicación (si la columna todavía existe) a la tabla puente, una sola vez
// por fila: INSERT IGNORE + la UNIQUE KEY de la tabla puente evitan duplicar si se ejecuta de nuevo antes
// de que la columna vieja se haya quitado. Errno 1054 (ER_BAD_FIELD_ERROR) = la columna ya no existe
// (se quitó en un arranque anterior), así que no hay nada que migrar.
async function migrarComplicacionesSiExisteColumna(pool, tablaOrigen, columnaOrigen, tablaPuente, columnaFk) {
  try {
    await pool.query(`
      INSERT IGNORE INTO ${tablaPuente} (id, ${columnaFk}, complicacion_id)
      SELECT UUID(), id, ${columnaOrigen} FROM ${tablaOrigen} WHERE ${columnaOrigen} IS NOT NULL`)
  } catch (err) {
    if (err?.errno !== 1054) throw err
  }
}

/** Mismo patrón que migrarComplicacionesSiExisteColumna, para el diagnóstico adicional único: pasa a
 * ser el primero de la lista, con su especificación. El tipo de valvulopatía era uno solo para los dos
 * diagnósticos, así que se copia también al adicional (el próximo guardado de la ficha lo quita del que
 * no sea valvulopatía). NOT EXISTS: la tabla puente admite repetidos, así que no hay UNIQUE que evite
 * duplicar si un arranque se interrumpe antes de quitar la columna vieja. */
async function migrarDiagnosticoAdicionalSiExisteColumna(pool, tablaOrigen, tablaPuente) {
  try {
    await pool.query(`
      INSERT INTO ${tablaPuente} (id, diagnostico_id, adicional_id, especificacion, valvulopatia_id, orden)
      SELECT UUID(), d.id, d.diagnostico_adicional_id, d.diagnostico_adicional_otro, d.valvulopatia_id, 1 FROM ${tablaOrigen} d
      WHERE d.diagnostico_adicional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${tablaPuente} t WHERE t.diagnostico_id = d.id)`)
  } catch (err) {
    if (err?.errno !== 1054) throw err
  }
}

/** Quita una columna si todavía existe (errno 1091 = ER_CANT_DROP_FIELD_OR_KEY, ya se quitó antes).
 * Si la columna tiene su propia FOREIGN KEY (como complicacion_intraqx_id/complicacion_pop_id, que la
 * tenían hacia opciones_lista), MySQL no deja quitarla sin antes quitar esa restricción — su nombre es
 * autogenerado (`tabla_ibfkN`) y no es predecible, así que se busca en information_schema en vez de
 * asumirlo. */
async function quitarColumnaSiExiste(pool, tabla, columna) {
  const restricciones = await pool.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tabla, columna])
  for (const { CONSTRAINT_NAME } of restricciones[0]) {
    await pool.query(`ALTER TABLE ${tabla} DROP FOREIGN KEY ${CONSTRAINT_NAME}`)
  }
  try {
    await pool.query(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`)
  } catch (err) {
    if (err?.errno !== 1091) throw err
  }
}

/** Agrega una columna si no existe (errno 1060 = ER_DUP_FIELDNAME, ya fue creada antes). */
async function agregarColumnaSiNoExiste(pool, tabla, columna, sentencia) {
  try {
    await pool.query(sentencia)
  } catch (err) {
    if (err?.errno !== 1060) throw err
  }
}

/** Agrega una restricción CHECK si no existe. MySQL no soporta "ADD CONSTRAINT IF NOT EXISTS", así que se
 * ignora el error de nombre duplicado (errno 3822) cuando ya fue creada en una ejecución anterior. */
async function agregarRestriccionSiNoExiste(pool, nombre, tabla, definicion) {
  try {
    await pool.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} ${definicion}`)
  } catch (err) {
    if (err?.errno !== 3822) throw err
  }
}

/** Pone una columna en NOT NULL solo si todavía admite NULL (evita reescribir la tabla en cada
 * arranque una vez aplicado: MODIFY COLUMN no es gratis, aunque sea un no-op lógico). */
async function asegurarNotNull(pool, tabla, columna, tipo) {
  const [[fila]] = await pool.query(`
    SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tabla, columna])
  if (fila?.IS_NULLABLE === 'YES') await pool.query(`ALTER TABLE ${tabla} MODIFY COLUMN ${columna} ${tipo} NOT NULL`)
}

/** Agrega una restricción nombrada (UNIQUE KEY o FOREIGN KEY) si no existe, comprobando el catálogo
 * en vez de atrapar un código de error: a diferencia de agregarRestriccionSiNoExiste (solo CHECK),
 * el errno de "ya existe" para UNIQUE/FOREIGN KEY no es uniforme entre versiones de MySQL. */
async function agregarRestriccionNombradaSiNoExiste(pool, nombre, tabla, definicion) {
  const [[existente]] = await pool.query(`
    SELECT 1 AS x FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`, [tabla, nombre])
  if (!existente) await pool.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} ${definicion}`)
}

async function columnaSinNulos(pool, tabla, columna) {
  const [[{ pendientes }]] = await pool.query(`SELECT COUNT(*) AS pendientes FROM ${tabla} WHERE ${columna} IS NULL`)
  return pendientes === 0
}

// ---------------------------------------------------------------------------------------------
// Migración a episodios (adultos): diagnosticos_adultos/cirugias_adultos/postoperatorio_adultos/
// seguimientos_adultos pasan de "1 por paciente" (paciente_id UNIQUE) a "1 por episodio"
// (episodio_id UNIQUE), para permitir varias intervenciones por paciente. Se hace en tres pasos
// seguros de re-ejecutar y de interrumpir a mitad de camino (inicializarBase corre en cada
// arranque): (1) crear el episodio 1 de cada paciente que aún no tenga uno, (2) copiar paciente_id
// → episodio_id fila por fila, (3) solo cuando TODAS las filas de una tabla ya tienen episodio_id,
// apretar a NOT NULL, agregar la UNIQUE+FK nueva y recién ahí quitar paciente_id. Nunca se quita
// paciente_id si queda alguna fila sin episodio_id: sin paciente_id ni episodio_id esa fila sería
// irrecuperable (no hay forma de saber de quién era).
// ---------------------------------------------------------------------------------------------

/** Crea el episodio 1 de cada paciente adulto que todavía no tenga uno — cubre tanto los 71+
 * pacientes ya existentes como cualquier paciente nuevo creado antes de que esta versión del
 * servidor arrancara por primera vez. */
async function crearEpisodiosAdultosFaltantes(pool) {
  await pool.query(`
    INSERT INTO episodios_adultos (id, paciente_id, numero_episodio, creado_por)
    SELECT UUID(), p.id, 1, p.creado_por
    FROM pacientes_adultos p
    WHERE NOT EXISTS (SELECT 1 FROM episodios_adultos e WHERE e.paciente_id = p.id AND e.numero_episodio = 1)`)
}

/** Enlaza las filas existentes de un módulo de adultos (todavía con paciente_id) a su episodio 1.
 * Errno 1054 = ER_BAD_FIELD_ERROR: paciente_id ya no existe en esta tabla (ya migrada antes). */
async function migrarEpisodioAdultoSiExisteColumna(pool, tabla) {
  try {
    await pool.query(`
      UPDATE ${tabla} t
      JOIN episodios_adultos e ON e.paciente_id = t.paciente_id AND e.numero_episodio = 1
      SET t.episodio_id = e.id
      WHERE t.episodio_id IS NULL`)
  } catch (err) {
    if (err?.errno !== 1054) throw err
  }
}

/** Solo cuando el backfill de episodio_id terminó para TODAS las filas (si no, se reintenta en el
 * próximo arranque): aprieta a NOT NULL, agrega la UNIQUE+FK nuevas y recién ahí quita paciente_id
 * (quitarColumnaSiExiste ya sabe encontrar y quitar su FK vieja por information_schema). */
async function finalizarEpisodioAdultoSiListo(pool, tabla, nombreUnico, nombreFk) {
  if (!(await columnaSinNulos(pool, tabla, 'episodio_id'))) return
  await asegurarNotNull(pool, tabla, 'episodio_id', 'CHAR(36)')
  await agregarRestriccionNombradaSiNoExiste(pool, nombreUnico, tabla, `UNIQUE KEY (episodio_id)`)
  await agregarRestriccionNombradaSiNoExiste(pool, nombreFk, tabla, `FOREIGN KEY (episodio_id) REFERENCES episodios_adultos(id)`)
  await quitarColumnaSiExiste(pool, tabla, 'paciente_id')
}

/** Corre una migración de datos una sola vez por base. A diferencia de las de arriba (seguras de repetir
 * por construcción), estas copian datos a campos que luego se editan o se dejan vacíos a propósito en la
 * ficha: repetirlas en cada arranque pisaría esos cambios. La marca y los cambios van en la misma
 * transacción (solo DML: un ALTER haría commit implícito), así que si algo falla no queda marcada y se
 * reintenta en el próximo arranque. */
async function migrarUnaVez(pool, nombre, migrar) {
  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()
    const [resultado] = await conexion.query('INSERT IGNORE INTO migraciones_datos (nombre) VALUES (?)', [nombre])
    if (resultado.affectedRows === 1) await migrar(conexion)
    await conexion.commit()
  } catch (err) {
    await conexion.rollback()
    throw err
  } finally {
    conexion.release()
  }
}

/** El implante era uno por cirugía (cirugias(_adultos).implante_id) y pasa a ser uno por procedimiento.
 * "N/A" quería decir que la cirugía no llevó implante: todos sus procedimientos quedan en "No aplica".
 * Un tipo real va al procedimiento 1, el único seguro cuando hubo más de uno (los demás quedan vacíos,
 * para revisarlos en la ficha). Una cirugía con implante y sin procedimientos conserva el dato viejo. */
async function migrarImplantePorProcedimiento(conexion, tablaCirugias, tablaProcedimientos) {
  await conexion.query(`
    UPDATE ${tablaProcedimientos} cp
    JOIN ${tablaCirugias} c ON c.id = cp.cirugia_id
    JOIN opciones_lista o ON o.id = c.implante_id
    SET cp.implante = IF(o.valor = 'N/A', 'NA', 'SI'),
        cp.tipo_implante_id = IF(o.valor = 'N/A', NULL, c.implante_id)
    WHERE cp.implante IS NULL AND (o.valor = 'N/A' OR cp.orden = 1)`)
}

const EPISODIO_ADULTO_TABLAS = [
  ['diagnosticos_adultos', 'uq_diagad_episodio', 'fk_diagad_episodio'],
  ['cirugias_adultos', 'uq_cirad_episodio', 'fk_cirad_episodio'],
  ['postoperatorio_adultos', 'uq_popad_episodio', 'fk_popad_episodio'],
  ['seguimientos_adultos', 'uq_segad_episodio', 'fk_segad_episodio'],
]

/** Crea las tablas si no existen, siembra las listas y, si no hay usuarios, el primer administrador. */
export async function inicializarBase(pool, admin) {
  for (const sentencia of tablas) await pool.query(sentencia)
  for (const [tabla, columna, sentencia] of alteraciones) await agregarColumnaSiNoExiste(pool, tabla, columna, sentencia)
  for (const [nombre, tabla, definicion] of restricciones) await agregarRestriccionSiNoExiste(pool, nombre, tabla, definicion)
  for (const [nombre, tabla, definicion] of llavesForaneas) await agregarRestriccionNombradaSiNoExiste(pool, nombre, tabla, definicion)
  await migrarComplicacionesSiExisteColumna(pool, 'cirugias', 'complicacion_intraqx_id', 'cirugias_complicaciones_intraqx', 'cirugia_id')
  await migrarComplicacionesSiExisteColumna(pool, 'postoperatorio', 'complicacion_pop_id', 'postoperatorio_complicaciones_pop', 'postoperatorio_id')
  await migrarComplicacionesSiExisteColumna(pool, 'cirugias_adultos', 'complicacion_intraqx_id', 'cirugias_adultos_complicaciones_intraqx', 'cirugia_id')
  await migrarComplicacionesSiExisteColumna(pool, 'postoperatorio_adultos', 'complicacion_pop_id', 'postoperatorio_adultos_complicaciones_pop', 'postoperatorio_id')
  await migrarDiagnosticoAdicionalSiExisteColumna(pool, 'diagnosticos', 'diagnosticos_adicionales')
  await migrarDiagnosticoAdicionalSiExisteColumna(pool, 'diagnosticos_adultos', 'diagnosticos_adultos_adicionales')

  await crearEpisodiosAdultosFaltantes(pool)
  for (const tabla of ['diagnosticos_adultos', 'cirugias_adultos', 'postoperatorio_adultos', 'seguimientos_adultos']) {
    await migrarEpisodioAdultoSiExisteColumna(pool, tabla)
  }
  for (const [tabla, nombreUnico, nombreFk] of EPISODIO_ADULTO_TABLAS) {
    await finalizarEpisodioAdultoSiListo(pool, tabla, nombreUnico, nombreFk)
  }

  await migrarUnaVez(pool, 'implante_por_procedimiento', async (conexion) => {
    await migrarImplantePorProcedimiento(conexion, 'cirugias', 'cirugias_procedimientos')
    await migrarImplantePorProcedimiento(conexion, 'cirugias_adultos', 'cirugias_adultos_procedimientos')
    // "No aplica" ahora es una respuesta de "¿lleva implante?": como tipo de implante ya no tiene sentido.
    await conexion.query(`
      UPDATE opciones_lista o JOIN categorias_lista c ON c.id = o.categoria_id
      SET o.activo = 0 WHERE c.codigo = 'IMPLANTE' AND o.valor = 'N/A'`)
  })

  for (const [tabla, columna] of columnasRetiradas) await quitarColumnaSiExiste(pool, tabla, columna)

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
    await pool.query('INSERT INTO usuarios (id, email, password_hash, nombre_completo) VALUES (?, ?, ?, ?)', [
      nuevoId(), admin.email.toLowerCase(), await bcrypt.hash(admin.password, 12), admin.nombre,
    ])
    console.log(`Primer administrador creado: ${admin.email}`)
  }
}
