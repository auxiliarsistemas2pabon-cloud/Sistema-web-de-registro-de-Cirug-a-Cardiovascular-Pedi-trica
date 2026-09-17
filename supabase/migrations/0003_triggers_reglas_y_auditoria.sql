-- Reglas condicionales (autocorrección silenciosa o rechazo duro) y auditoría genérica.
-- Ver la tabla "Reglas condicionales" del plan aprobado para el porqué de cada mecanismo.

-- ---------------------------------------------------------------------------
-- Auditoría genérica
-- ---------------------------------------------------------------------------

create table auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id uuid not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id uuid references perfiles(id),
  fecha timestamptz not null default now(),
  valores_anteriores jsonb,
  valores_nuevos jsonb
);

create index idx_auditoria_tabla_registro on auditoria(tabla, registro_id);
create index idx_auditoria_fecha on auditoria(fecha);

create or replace function fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into auditoria (tabla, registro_id, operacion, usuario_id, valores_anteriores, valores_nuevos)
    values (tg_table_name, new.id, tg_op, v_usuario_id, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into auditoria (tabla, registro_id, operacion, usuario_id, valores_anteriores, valores_nuevos)
    values (tg_table_name, new.id, tg_op, v_usuario_id, to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    insert into auditoria (tabla, registro_id, operacion, usuario_id, valores_anteriores, valores_nuevos)
    values (tg_table_name, old.id, tg_op, v_usuario_id, to_jsonb(old), null);
  end if;
  return coalesce(new, old);
end;
$$;

comment on function fn_auditoria() is 'SECURITY DEFINER para poder escribir en auditoria aunque el rol autenticado no tenga INSERT otorgado ahí directamente.';

-- ---------------------------------------------------------------------------
-- Módulo 1 · pacientes
-- ---------------------------------------------------------------------------

create or replace function fn_pacientes_normalizar()
returns trigger language plpgsql as $$
declare
  v_codigo text;
begin
  if new.procedencia_id is null then
    new.municipio_narino_id := null;
  else
    select codigo into v_codigo from opciones_lista where id = new.procedencia_id;
    if v_codigo is distinct from 'NARINO' then
      new.municipio_narino_id := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_pacientes_normalizar
  before insert or update on pacientes
  for each row execute function fn_pacientes_normalizar();

create trigger trg_auditoria_pacientes
  after insert or update or delete on pacientes
  for each row execute function fn_auditoria();

-- ---------------------------------------------------------------------------
-- Módulo 2 · diagnosticos / diagnosticos_riesgos
-- ---------------------------------------------------------------------------

create or replace function fn_diagnosticos_normalizar()
returns trigger language plpgsql as $$
declare
  v_codigo text;
  v_na_id uuid;
begin
  if new.diagnostico_id is null then
    v_codigo := null;
  else
    select codigo into v_codigo from opciones_lista where id = new.diagnostico_id;
  end if;

  if v_codigo is distinct from 'VALVULOPATIAS' then
    select o.id into v_na_id
    from opciones_lista o
    join categorias_lista c on c.id = o.categoria_id
    where c.codigo = 'VALVULOPATIA' and o.codigo = 'NA';
    new.valvulopatia_id := v_na_id;
  end if;

  return new;
end;
$$;

create trigger trg_diagnosticos_normalizar
  before insert or update on diagnosticos
  for each row execute function fn_diagnosticos_normalizar();

create trigger trg_auditoria_diagnosticos
  after insert or update or delete on diagnosticos
  for each row execute function fn_auditoria();

create or replace function fn_diagnosticos_riesgos_validar()
returns trigger language plpgsql as $$
declare
  v_ninguno_id uuid;
  v_es_ninguno boolean;
  v_conflicto boolean;
begin
  select o.id into v_ninguno_id
  from opciones_lista o
  join categorias_lista c on c.id = o.categoria_id
  where c.codigo = 'RIESGOS' and o.codigo = 'NINGUNO';

  v_es_ninguno := (new.riesgo_id = v_ninguno_id);

  if v_es_ninguno then
    select exists (
      select 1 from diagnosticos_riesgos
      where diagnostico_id = new.diagnostico_id and id <> new.id
    ) into v_conflicto;
    if v_conflicto then
      raise exception 'No se puede seleccionar "Ninguno" junto con otros factores de riesgo.';
    end if;
  else
    select exists (
      select 1 from diagnosticos_riesgos
      where diagnostico_id = new.diagnostico_id and riesgo_id = v_ninguno_id and id <> new.id
    ) into v_conflicto;
    if v_conflicto then
      raise exception 'No se puede seleccionar otro factor de riesgo junto con "Ninguno".';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_diagnosticos_riesgos_validar
  before insert or update on diagnosticos_riesgos
  for each row execute function fn_diagnosticos_riesgos_validar();

create trigger trg_auditoria_diagnosticos_riesgos
  after insert or update or delete on diagnosticos_riesgos
  for each row execute function fn_auditoria();

-- ---------------------------------------------------------------------------
-- Módulo 3 · cirugias / cirugias_procedimientos
-- ---------------------------------------------------------------------------

create or replace function fn_cirugias_normalizar_validar()
returns trigger language plpgsql as $$
declare
  v_fecha_nacimiento date;
begin
  if new.uso_cec is distinct from 'SI' then
    new.tiempo_cec_min := null;
    new.tiempo_clamp_min := null;
  end if;

  if new.fecha_cirugia is not null then
    select fecha_nacimiento into v_fecha_nacimiento from pacientes where id = new.paciente_id;
    if v_fecha_nacimiento is not null and new.fecha_cirugia < v_fecha_nacimiento then
      raise exception 'La fecha de cirugía no puede ser anterior a la fecha de nacimiento del paciente.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_cirugias_normalizar_validar
  before insert or update on cirugias
  for each row execute function fn_cirugias_normalizar_validar();

create trigger trg_auditoria_cirugias
  after insert or update or delete on cirugias
  for each row execute function fn_auditoria();

create trigger trg_auditoria_cirugias_procedimientos
  after insert or update or delete on cirugias_procedimientos
  for each row execute function fn_auditoria();

-- ---------------------------------------------------------------------------
-- Módulo 4 · postoperatorio
-- ---------------------------------------------------------------------------

create or replace function fn_postoperatorio_validar()
returns trigger language plpgsql as $$
declare
  v_fecha_cirugia date;
begin
  select fecha_cirugia into v_fecha_cirugia from cirugias where paciente_id = new.paciente_id;

  if v_fecha_cirugia is not null then
    if new.fecha_traslado_intermedio is not null and new.fecha_traslado_intermedio < v_fecha_cirugia then
      raise exception 'La fecha de traslado a intermedio no puede ser anterior a la fecha de cirugía.';
    end if;
    if new.fecha_salida is not null and new.fecha_salida < v_fecha_cirugia then
      raise exception 'La fecha de salida no puede ser anterior a la fecha de cirugía.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_postoperatorio_validar
  before insert or update on postoperatorio
  for each row execute function fn_postoperatorio_validar();

create or replace function fn_postoperatorio_sync_seguimiento()
returns trigger language plpgsql as $$
declare
  v_es_muerte boolean;
begin
  if new.condicion_salida_id is null then
    v_es_muerte := false;
  else
    -- "codigo = 'MUERTE'" daría NULL (no false) cuando la opción elegida tiene codigo NULL
    -- (cualquier condición distinta de Muerte), por la lógica de tres valores de SQL.
    select (codigo is not distinct from 'MUERTE') into v_es_muerte from opciones_lista where id = new.condicion_salida_id;
  end if;

  insert into seguimientos (paciente_id, no_aplica, estado_modulo, creado_por, actualizado_por)
  values (
    new.paciente_id,
    v_es_muerte,
    case when v_es_muerte then 'no_aplica'::estado_modulo_enum else 'pendiente'::estado_modulo_enum end,
    new.creado_por,
    new.creado_por
  )
  on conflict (paciente_id) do update
    set no_aplica = v_es_muerte,
        estado_modulo = case when v_es_muerte then 'no_aplica'::estado_modulo_enum else 'pendiente'::estado_modulo_enum end
    where seguimientos.no_aplica is distinct from v_es_muerte;

  return new;
end;
$$;

comment on function fn_postoperatorio_sync_seguimiento() is 'Si Condición de salida=Muerte, crea/marca Módulo 5 como no_aplica; si se corrige, lo revierte a pendiente.';

create trigger trg_postoperatorio_sync_seguimiento
  after insert or update on postoperatorio
  for each row execute function fn_postoperatorio_sync_seguimiento();

create trigger trg_auditoria_postoperatorio
  after insert or update or delete on postoperatorio
  for each row execute function fn_auditoria();

-- ---------------------------------------------------------------------------
-- Módulo 5 · seguimientos
-- ---------------------------------------------------------------------------

create or replace function fn_seguimientos_bloquear_no_aplica()
returns trigger language plpgsql as $$
begin
  if old.no_aplica and (
    new.fecha_control_cirugia is distinct from old.fecha_control_cirugia or
    new.rehabilitacion_cardiaca is distinct from old.rehabilitacion_cardiaca or
    new.estado_herida_id is distinct from old.estado_herida_id or
    new.fecha_llamada_15_dias is distinct from old.fecha_llamada_15_dias or
    new.persona_recibe_llamada is distinct from old.persona_recibe_llamada or
    new.reingreso_30_dias is distinct from old.reingreso_30_dias or
    new.fecha_reingreso is distinct from old.fecha_reingreso or
    new.causa_reingreso_id is distinct from old.causa_reingreso_id or
    new.observaciones is distinct from old.observaciones
  ) then
    raise exception 'El Módulo 5 no aplica (condición de salida: Muerte) y no puede editarse.';
  end if;

  return new;
end;
$$;

create trigger trg_seguimientos_bloquear_no_aplica
  before update on seguimientos
  for each row execute function fn_seguimientos_bloquear_no_aplica();

create or replace function fn_seguimientos_validar_reingreso()
returns trigger language plpgsql as $$
declare
  v_fecha_salida date;
begin
  if new.reingreso_30_dias = 'SI' and new.fecha_reingreso is not null then
    select fecha_salida into v_fecha_salida from postoperatorio where paciente_id = new.paciente_id;
    if v_fecha_salida is not null
       and (new.fecha_reingreso < v_fecha_salida or new.fecha_reingreso > v_fecha_salida + 30) then
      raise exception 'La fecha de reingreso debe estar dentro de los 30 días posteriores a la fecha de salida.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_seguimientos_validar_reingreso
  before insert or update on seguimientos
  for each row execute function fn_seguimientos_validar_reingreso();

create trigger trg_auditoria_seguimientos
  after insert or update or delete on seguimientos
  for each row execute function fn_auditoria();
