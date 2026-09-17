-- Row Level Security por rol.
--
-- Nota importante verificada en local: Supabase otorga privilegios SQL amplios (incluido
-- DELETE) a `anon` y `authenticated` por defecto en cada tabla nueva (ALTER DEFAULT
-- PRIVILEGES a nivel de esquema, fuera de estas migraciones). Por eso la barrera real
-- aquí es RLS, no el GRANT: con RLS habilitado, cualquier comando (select/insert/update/
-- delete) para el que una tabla NO tenga una política permisiva queda denegado por
-- defecto para TODOS los roles, sin importar qué privilegio SQL tengan. Así, por ejemplo,
-- no crear ninguna política de DELETE en pacientes/diagnosticos/cirugias/postoperatorio/
-- seguimientos basta para que nadie —ni siquiera administrador— pueda borrar físicamente
-- vía la API, aunque el rol tenga el privilegio SQL. Verificado con pruebas manuales:
-- anon no ve ninguna fila, registrador no puede marcar eliminado=true ni leer auditoria,
-- consulta no puede escribir, administrador puede todo lo permitido.

create or replace function fn_rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as
$$ select rol from perfiles where id = auth.uid() and activo $$;

comment on function fn_rol_actual() is 'SECURITY DEFINER para leer perfiles sin recursión de políticas RLS.';

create or replace function fn_paciente_eliminado(p_paciente_id uuid) returns boolean
language sql stable as
$$ select coalesce((select eliminado from pacientes where id = p_paciente_id), false) $$;

-- Postgres otorga EXECUTE a PUBLIC por defecto en funciones nuevas; se revoca y se
-- otorga explícitamente solo a `authenticated` (las políticas RLS de abajo invocan
-- estas funciones con los privilegios del rol que hace la consulta).
revoke execute on function fn_rol_actual() from public;
revoke execute on function fn_paciente_eliminado(uuid) from public;
grant execute on function fn_rol_actual() to authenticated;
grant execute on function fn_paciente_eliminado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------

alter table perfiles enable row level security;
grant select, insert, update on perfiles to authenticated;

create policy perfiles_select_admin on perfiles
  for select using (fn_rol_actual() = 'administrador');

create policy perfiles_select_propio on perfiles
  for select using (id = auth.uid());

create policy perfiles_insert_admin on perfiles
  for insert with check (fn_rol_actual() = 'administrador');

create policy perfiles_update_admin on perfiles
  for update using (fn_rol_actual() = 'administrador');

-- ---------------------------------------------------------------------------
-- categorias_lista / opciones_lista
-- ---------------------------------------------------------------------------

alter table categorias_lista enable row level security;
alter table opciones_lista enable row level security;

grant select on categorias_lista to authenticated;
grant select, insert, update on opciones_lista to authenticated;

create policy categorias_lista_select on categorias_lista
  for select using (fn_rol_actual() is not null);

create policy opciones_lista_select on opciones_lista
  for select using (fn_rol_actual() is not null);

create policy opciones_lista_admin_insert on opciones_lista
  for insert with check (fn_rol_actual() = 'administrador');

create policy opciones_lista_admin_update on opciones_lista
  for update using (fn_rol_actual() = 'administrador');

-- ---------------------------------------------------------------------------
-- pacientes (Módulo 1) — único rol que puede marcar eliminado=true: administrador
-- ---------------------------------------------------------------------------

alter table pacientes enable row level security;
grant select, insert, update on pacientes to authenticated;

create policy pacientes_select_admin on pacientes
  for select using (fn_rol_actual() = 'administrador');

create policy pacientes_select_no_eliminado on pacientes
  for select using (fn_rol_actual() in ('registrador', 'consulta') and eliminado = false);

create policy pacientes_insert on pacientes
  for insert with check (fn_rol_actual() in ('administrador', 'registrador'));

create policy pacientes_update on pacientes
  for update
  using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and eliminado = false)
  )
  with check (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and eliminado = false)
  );

-- ---------------------------------------------------------------------------
-- diagnosticos, cirugias, postoperatorio, seguimientos (Módulos 2, 3, 4, 5)
-- Mismo patrón en las 4: administrador ve/edita todo; registrador ve/edita solo si el
-- paciente no está eliminado; consulta solo ve (paciente no eliminado).
-- ---------------------------------------------------------------------------

alter table diagnosticos enable row level security;
grant select, insert, update on diagnosticos to authenticated;

create policy diagnosticos_select on diagnosticos
  for select using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(paciente_id))
  );

create policy diagnosticos_insert on diagnosticos
  for insert with check (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

create policy diagnosticos_update on diagnosticos
  for update using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

alter table cirugias enable row level security;
grant select, insert, update on cirugias to authenticated;

create policy cirugias_select on cirugias
  for select using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(paciente_id))
  );

create policy cirugias_insert on cirugias
  for insert with check (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

create policy cirugias_update on cirugias
  for update using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

alter table postoperatorio enable row level security;
grant select, insert, update on postoperatorio to authenticated;

create policy postoperatorio_select on postoperatorio
  for select using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(paciente_id))
  );

create policy postoperatorio_insert on postoperatorio
  for insert with check (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

create policy postoperatorio_update on postoperatorio
  for update using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

alter table seguimientos enable row level security;
grant select, insert, update on seguimientos to authenticated;

create policy seguimientos_select on seguimientos
  for select using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(paciente_id))
  );

create policy seguimientos_insert on seguimientos
  for insert with check (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

create policy seguimientos_update on seguimientos
  for update using (
    fn_rol_actual() = 'administrador'
    or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(paciente_id))
  );

-- ---------------------------------------------------------------------------
-- diagnosticos_riesgos / cirugias_procedimientos: tablas de selección normalizadas
-- (no son "el registro clínico" en sí, sino qué opciones están marcadas). Se permite
-- DELETE real aquí para poder reemplazar la selección; queda igualmente auditado.
-- ---------------------------------------------------------------------------

alter table diagnosticos_riesgos enable row level security;
grant select, insert, delete on diagnosticos_riesgos to authenticated;

create policy diagnosticos_riesgos_select on diagnosticos_riesgos
  for select using (
    exists (
      select 1 from diagnosticos d
      where d.id = diagnosticos_riesgos.diagnostico_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(d.paciente_id))
        )
    )
  );

create policy diagnosticos_riesgos_insert on diagnosticos_riesgos
  for insert with check (
    exists (
      select 1 from diagnosticos d
      where d.id = diagnosticos_riesgos.diagnostico_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(d.paciente_id))
        )
    )
  );

create policy diagnosticos_riesgos_delete on diagnosticos_riesgos
  for delete using (
    exists (
      select 1 from diagnosticos d
      where d.id = diagnosticos_riesgos.diagnostico_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(d.paciente_id))
        )
    )
  );

alter table cirugias_procedimientos enable row level security;
grant select, insert, delete on cirugias_procedimientos to authenticated;

create policy cirugias_procedimientos_select on cirugias_procedimientos
  for select using (
    exists (
      select 1 from cirugias c
      where c.id = cirugias_procedimientos.cirugia_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() in ('registrador', 'consulta') and not fn_paciente_eliminado(c.paciente_id))
        )
    )
  );

create policy cirugias_procedimientos_insert on cirugias_procedimientos
  for insert with check (
    exists (
      select 1 from cirugias c
      where c.id = cirugias_procedimientos.cirugia_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(c.paciente_id))
        )
    )
  );

create policy cirugias_procedimientos_delete on cirugias_procedimientos
  for delete using (
    exists (
      select 1 from cirugias c
      where c.id = cirugias_procedimientos.cirugia_id
        and (
          fn_rol_actual() = 'administrador'
          or (fn_rol_actual() = 'registrador' and not fn_paciente_eliminado(c.paciente_id))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- auditoria: solo lectura, solo administrador. Las escrituras solo ocurren vía el
-- trigger SECURITY DEFINER fn_auditoria(); por eso no hay GRANT de insert/update/delete.
-- ---------------------------------------------------------------------------

alter table auditoria enable row level security;
grant select on auditoria to authenticated;

create policy auditoria_select_admin on auditoria
  for select using (fn_rol_actual() = 'administrador');
