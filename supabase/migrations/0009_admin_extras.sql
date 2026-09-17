-- Extras para la pantalla de Administración: proteger el campo `codigo` de opciones_lista
-- (la UI de administración nunca debería poder tocarlo, pero esto lo garantiza también a
-- nivel de BD ante cualquier llamada directa a la API) y una vista de auditoría con el
-- nombre del usuario ya resuelto.

create or replace function fn_opciones_lista_proteger_codigo()
returns trigger language plpgsql as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'El código de una opción de lista no se puede modificar.';
  end if;
  return new;
end;
$$;

create trigger trg_opciones_lista_proteger_codigo
  before update on opciones_lista
  for each row execute function fn_opciones_lista_proteger_codigo();

create view v_auditoria as
select a.*, p.nombre_completo as usuario_nombre
from auditoria a
left join perfiles p on p.id = a.usuario_id;

comment on view v_auditoria is 'auditoria + nombre del usuario. Hereda el RLS de auditoria (solo administrador) y perfiles.';

grant select on v_auditoria to authenticated;
