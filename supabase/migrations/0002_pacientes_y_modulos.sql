-- Perfiles de usuario y las 5 tablas de módulos del paciente.

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  rol rol_usuario not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table perfiles is 'Un perfil por usuario de auth.users, con su rol en la aplicación.';

-- ---------------------------------------------------------------------------
-- Módulo 1 · Datos del paciente
-- ---------------------------------------------------------------------------

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  numero_paciente bigint generated always as identity unique,
  nombre_completo text not null check (btrim(nombre_completo) <> ''),
  identificacion text not null unique check (identificacion ~ '^[0-9]+$'),
  sexo_id uuid references opciones_lista(id) on delete restrict,
  fecha_nacimiento date not null check (fecha_nacimiento <= current_date),
  peso_kg numeric(5, 2) check (peso_kg is null or peso_kg between 0.5 and 150),
  talla_cm integer check (talla_cm is null or talla_cm between 30 and 220),
  procedencia_id uuid references opciones_lista(id) on delete restrict,
  municipio_narino_id uuid references opciones_lista(id) on delete restrict,
  telefonos text[],
  sin_telefono boolean not null default false,
  eps_id uuid references opciones_lista(id) on delete restrict,
  estado_modulo estado_modulo_enum not null default 'pendiente',
  origen text not null default 'manual' check (origen in ('manual', 'importado')),
  lote_importacion_id uuid,
  eliminado boolean not null default false,
  eliminado_en timestamptz,
  eliminado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfiles(id),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id),
  check (not (sin_telefono and telefonos is not null and array_length(telefonos, 1) > 0))
);

comment on column pacientes.estado_modulo is 'Estado del Módulo 1, escrito por la aplicación tras validar sus campos obligatorios.';
comment on column pacientes.lote_importacion_id is 'FK a importaciones_lote, se añade en la migración de importaciones.';

create index idx_pacientes_busqueda on pacientes using gin (fn_unaccent_inmutable(nombre_completo) gin_trgm_ops);
create index idx_pacientes_eliminado on pacientes(eliminado);

-- ---------------------------------------------------------------------------
-- Módulo 2 · Diagnóstico y riesgo prequirúrgico
-- ---------------------------------------------------------------------------

create table diagnosticos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete cascade,
  diagnostico_id uuid references opciones_lista(id) on delete restrict,
  valvulopatia_id uuid references opciones_lista(id) on delete restrict,
  rachs_id uuid references opciones_lista(id) on delete restrict,
  estado_modulo estado_modulo_enum not null default 'pendiente',
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfiles(id),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id)
);

create table diagnosticos_riesgos (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references diagnosticos(id) on delete cascade,
  riesgo_id uuid not null references opciones_lista(id) on delete restrict,
  unique (diagnostico_id, riesgo_id)
);

-- ---------------------------------------------------------------------------
-- Módulo 3 · Procedimiento quirúrgico (intraoperatorio)
-- ---------------------------------------------------------------------------

create table cirugias (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete cascade,
  fecha_cirugia date,
  implante_id uuid references opciones_lista(id) on delete restrict,
  uso_cec si_no,
  tiempo_cec_min integer check (tiempo_cec_min is null or tiempo_cec_min >= 0),
  tiempo_clamp_min integer check (tiempo_clamp_min is null or tiempo_clamp_min >= 0),
  complicacion_intraqx_id uuid references opciones_lista(id) on delete restrict,
  cierre_esternal_diferido si_no,
  extubacion_quirofano si_no,
  estado_modulo estado_modulo_enum not null default 'pendiente',
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfiles(id),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id),
  check (tiempo_clamp_min is null or (tiempo_cec_min is not null and tiempo_clamp_min <= tiempo_cec_min))
);

create table cirugias_procedimientos (
  id uuid primary key default gen_random_uuid(),
  cirugia_id uuid not null references cirugias(id) on delete cascade,
  procedimiento_id uuid not null references opciones_lista(id) on delete restrict,
  orden smallint not null check (orden in (1, 2, 3)),
  unique (cirugia_id, orden),
  unique (cirugia_id, procedimiento_id)
);

comment on table cirugias_procedimientos is 'Los 3 procedimientos quirúrgicos (orden 1 obligatorio, 2 y 3 opcionales) viven aquí en vez de columnas repetidas.';

-- ---------------------------------------------------------------------------
-- Módulo 4 · Postoperatorio, UCI y egreso
-- ---------------------------------------------------------------------------

create table postoperatorio (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete cascade,
  unidad_pop_id uuid references opciones_lista(id) on delete restrict,
  horas_ventilacion_mecanica integer check (horas_ventilacion_mecanica is null or horas_ventilacion_mecanica >= 0),
  complicacion_pop_id uuid references opciones_lista(id) on delete restrict,
  fecha_traslado_intermedio date,
  fecha_salida date,
  condicion_salida_id uuid references opciones_lista(id) on delete restrict,
  estado_modulo estado_modulo_enum not null default 'pendiente',
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfiles(id),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id),
  check (fecha_traslado_intermedio is null or fecha_salida is null or fecha_salida >= fecha_traslado_intermedio)
);

-- ---------------------------------------------------------------------------
-- Módulo 5 · Seguimiento post-egreso (30 días)
-- ---------------------------------------------------------------------------

create table seguimientos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete cascade,
  no_aplica boolean not null default false,
  fecha_control_cirugia date,
  rehabilitacion_cardiaca si_no_na,
  estado_herida_id uuid references opciones_lista(id) on delete restrict,
  fecha_llamada_15_dias date,
  persona_recibe_llamada text,
  reingreso_30_dias si_no_na,
  fecha_reingreso date,
  causa_reingreso_id uuid references opciones_lista(id) on delete restrict,
  observaciones text,
  estado_modulo estado_modulo_enum not null default 'pendiente',
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfiles(id),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id),
  check (reingreso_30_dias is distinct from 'SI' or (fecha_reingreso is not null and causa_reingreso_id is not null))
);

comment on column seguimientos.persona_recibe_llamada is 'Se usa también como marca de "llamada realizada" (is not null) en la pantalla de alertas.';
