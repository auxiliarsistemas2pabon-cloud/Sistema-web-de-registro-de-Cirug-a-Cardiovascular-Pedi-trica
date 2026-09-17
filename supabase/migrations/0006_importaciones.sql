-- Staging de importación desde Excel: el preview con errores vive en BD (no solo en el
-- navegador) para que sobreviva a un refresco/reintento y quede trazado quién importó qué.

create table importaciones_lote (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  cargado_por uuid not null references perfiles(id),
  cargado_en timestamptz not null default now(),
  estado text not null default 'en_revision' check (estado in ('en_revision', 'aplicado', 'descartado'))
);

create table importaciones_filas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references importaciones_lote(id) on delete cascade,
  numero_fila integer not null,
  -- Estructura flexible (jsonb) porque el mapeo exacto de las 44 columnas del Excel real
  -- se define al construir este módulo, cuando se tenga el archivo.
  datos_originales jsonb not null,
  datos_normalizados jsonb,
  errores jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'valido', 'con_errores', 'importado', 'descartado')),
  paciente_id uuid references pacientes(id),
  unique (lote_id, numero_fila)
);

alter table pacientes
  add constraint fk_pacientes_lote foreign key (lote_importacion_id) references importaciones_lote(id);

alter table importaciones_lote enable row level security;
alter table importaciones_filas enable row level security;

grant select, insert, update on importaciones_lote to authenticated;
grant select, insert, update on importaciones_filas to authenticated;

create policy importaciones_lote_rw on importaciones_lote
  for all
  using (fn_rol_actual() in ('administrador', 'registrador'))
  with check (fn_rol_actual() in ('administrador', 'registrador'));

create policy importaciones_filas_rw on importaciones_filas
  for all
  using (fn_rol_actual() in ('administrador', 'registrador'))
  with check (fn_rol_actual() in ('administrador', 'registrador'));
