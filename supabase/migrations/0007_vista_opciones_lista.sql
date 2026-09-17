-- Vista de conveniencia: opciones_lista aplanada con el código de su categoría, para que
-- el frontend pueda pedir "las opciones activas de la categoría EPS" en una sola consulta
-- sin tener que usar la sintaxis de recursos embebidos de PostgREST en cada pantalla.

create view v_opciones_lista as
select
  o.id,
  o.categoria_id,
  c.codigo as categoria_codigo,
  o.codigo,
  o.valor,
  o.orden,
  o.activo
from opciones_lista o
join categorias_lista c on c.id = o.categoria_id;

comment on view v_opciones_lista is 'opciones_lista + categoria_codigo, para consultas como: eq(categoria_codigo, "EPS") and eq(activo, true).';

grant select on v_opciones_lista to authenticated;
