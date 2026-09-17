-- Vistas de solo lectura para calculados (edad, días UCI/hospitalización) y funciones RPC
-- para el tablero de indicadores y la pantalla de alertas de seguimiento.
--
-- No se implementan como columnas generadas: Postgres no permite GENERATED que dependa de
-- otra tabla (días UCI necesita cirugias+postoperatorio) ni de CURRENT_DATE (no es inmutable).

create view v_pacientes_resumen as
select
  p.id as paciente_id,
  p.numero_paciente,
  p.nombre_completo,
  p.identificacion,
  p.fecha_nacimiento,
  (current_date - p.fecha_nacimiento) as edad_dias,
  c.fecha_cirugia,
  (c.fecha_cirugia - p.fecha_nacimiento) as edad_cirugia_dias,
  case
    when po.fecha_traslado_intermedio is not null then (po.fecha_traslado_intermedio - c.fecha_cirugia)
    when po.fecha_salida is not null then (po.fecha_salida - c.fecha_cirugia)
    else null
  end as dias_uci,
  case
    when po.fecha_salida is not null then (po.fecha_salida - c.fecha_cirugia)
    else null
  end as dias_hospitalizacion_posqx,
  p.estado_modulo as estado_m1,
  -- coalesce a 'pendiente': un módulo cuya tabla todavía no tiene fila (paciente recién
  -- creado) está pendiente, no en un estado "vacío" sin representar en el enum.
  coalesce(d.estado_modulo, 'pendiente') as estado_m2,
  coalesce(c.estado_modulo, 'pendiente') as estado_m3,
  coalesce(po.estado_modulo, 'pendiente') as estado_m4,
  coalesce(s.estado_modulo, 'pendiente') as estado_m5,
  dg.valor as diagnostico_valor,
  rc.valor as rachs_valor,
  eps.valor as eps_valor,
  proc.valor as procedencia_valor,
  cs.valor as condicion_salida_valor,
  p.eliminado
from pacientes p
left join diagnosticos d on d.paciente_id = p.id
left join cirugias c on c.paciente_id = p.id
left join postoperatorio po on po.paciente_id = p.id
left join seguimientos s on s.paciente_id = p.id
left join opciones_lista dg on dg.id = d.diagnostico_id
left join opciones_lista rc on rc.id = d.rachs_id
left join opciones_lista eps on eps.id = p.eps_id
left join opciones_lista proc on proc.id = p.procedencia_id
left join opciones_lista cs on cs.id = po.condicion_salida_id;

comment on view v_pacientes_resumen is 'Base para la pantalla de Listado de pacientes: incluye eliminado como columna pasante (la política RLS de cada rol decide qué filas ve).';

-- Solo pacientes que ya llegaron a cirugía y no están eliminados: población correcta para
-- tasas quirúrgicas (un paciente eliminado, ej. registro duplicado, no debe distorsionar
-- estadísticas aunque un Administrador pueda verlo en el listado).
create view v_indicadores_cirugias as
select
  v.*,
  (cs2.codigo is not distinct from 'MUERTE') as es_muerte_hospitalaria,
  c.tiempo_cec_min,
  c.tiempo_clamp_min,
  po.horas_ventilacion_mecanica,
  (c.complicacion_intraqx_id is not null and ci.codigo is distinct from 'NINGUNA') as tuvo_complicacion_intraqx,
  (po.complicacion_pop_id is not null and cp.codigo is distinct from 'NO') as tuvo_complicacion_pop,
  (s.reingreso_30_dias = 'SI') as reingreso_30d,
  extract(month from c.fecha_cirugia)::int as mes_cirugia,
  extract(year from c.fecha_cirugia)::int as anio_cirugia
from v_pacientes_resumen v
join cirugias c on c.paciente_id = v.paciente_id
left join postoperatorio po on po.paciente_id = v.paciente_id
left join seguimientos s on s.paciente_id = v.paciente_id
left join opciones_lista cs2 on cs2.id = po.condicion_salida_id
left join opciones_lista ci on ci.id = c.complicacion_intraqx_id
left join opciones_lista cp on cp.id = po.complicacion_pop_id
where c.fecha_cirugia is not null
  and v.eliminado = false;

comment on view v_indicadores_cirugias is 'Base del tablero de indicadores (pantalla 5). Excluye pacientes eliminados sin importar el rol, porque son agregados estadísticos, no un listado de datos.';

-- Pantalla 4 · Alertas de seguimiento: llamadas de 15 días (pendientes o vencidas) y altas
-- recientes (<30 días) sin Módulo 5 completo.
create view v_alertas_seguimiento as
select
  p.id as paciente_id,
  p.numero_paciente,
  p.nombre_completo,
  p.identificacion,
  'llamada_15_dias'::text as tipo_alerta,
  s.fecha_llamada_15_dias as fecha_referencia,
  (current_date - s.fecha_llamada_15_dias) as dias_desde_referencia
from pacientes p
join seguimientos s on s.paciente_id = p.id
where p.eliminado = false
  and s.no_aplica = false
  and s.persona_recibe_llamada is null
  and s.fecha_llamada_15_dias is not null

union all

select
  p.id as paciente_id,
  p.numero_paciente,
  p.nombre_completo,
  p.identificacion,
  'seguimiento_pendiente_alta'::text as tipo_alerta,
  po.fecha_salida as fecha_referencia,
  (current_date - po.fecha_salida) as dias_desde_referencia
from pacientes p
join postoperatorio po on po.paciente_id = p.id
join seguimientos s on s.paciente_id = p.id
where p.eliminado = false
  and s.no_aplica = false
  and s.estado_modulo <> 'completo'
  and po.fecha_salida is not null
  and po.fecha_salida >= current_date - 30;

comment on view v_alertas_seguimiento is 'dias_desde_referencia positivo = vencida, negativo = aún pendiente (no vencida).';

-- ---------------------------------------------------------------------------
-- Funciones RPC del tablero de indicadores (PostgREST no soporta GROUP BY
-- arbitrario desde el cliente; el frontend las invoca vía supabase.rpc(...)).
-- SECURITY INVOKER (por defecto): respetan el RLS del usuario que las llama.
-- ---------------------------------------------------------------------------

create or replace function fn_indicador_resumen(fecha_desde date, fecha_hasta date)
returns table (
  total_cirugias bigint,
  mortalidad_hospitalaria_pct numeric,
  dias_uci_promedio numeric,
  dias_uci_mediana numeric,
  dias_hospitalizacion_promedio numeric,
  dias_hospitalizacion_mediana numeric,
  horas_ventilacion_promedio numeric,
  horas_ventilacion_mediana numeric,
  tasa_complicacion_intraqx_pct numeric,
  tasa_complicacion_pop_pct numeric,
  tasa_reingreso_30d_pct numeric,
  tiempo_cec_promedio numeric,
  tiempo_clamp_promedio numeric
)
language sql stable as $$
  select
    count(*) as total_cirugias,
    round(100.0 * count(*) filter (where es_muerte_hospitalaria) / greatest(count(*), 1), 1),
    round(avg(dias_uci), 1),
    round((percentile_cont(0.5) within group (order by dias_uci))::numeric, 1),
    round(avg(dias_hospitalizacion_posqx), 1),
    round((percentile_cont(0.5) within group (order by dias_hospitalizacion_posqx))::numeric, 1),
    round(avg(horas_ventilacion_mecanica), 1),
    round((percentile_cont(0.5) within group (order by horas_ventilacion_mecanica))::numeric, 1),
    round(100.0 * count(*) filter (where tuvo_complicacion_intraqx) / greatest(count(*), 1), 1),
    round(100.0 * count(*) filter (where tuvo_complicacion_pop) / greatest(count(*), 1), 1),
    round(100.0 * count(*) filter (where reingreso_30d) / greatest(count(*), 1), 1),
    round(avg(tiempo_cec_min), 1),
    round(avg(tiempo_clamp_min), 1)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta;
$$;

create or replace function fn_indicador_por_mes(fecha_desde date, fecha_hasta date)
returns table (anio int, mes int, total_cirugias bigint)
language sql stable as $$
  select anio_cirugia, mes_cirugia, count(*)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta
  group by anio_cirugia, mes_cirugia
  order by anio_cirugia, mes_cirugia;
$$;

create or replace function fn_indicador_por_diagnostico(fecha_desde date, fecha_hasta date)
returns table (diagnostico text, total_cirugias bigint)
language sql stable as $$
  select coalesce(diagnostico_valor, 'Sin diagnóstico'), count(*)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta
  group by diagnostico_valor
  order by count(*) desc;
$$;

create or replace function fn_indicador_por_procedimiento(fecha_desde date, fecha_hasta date)
returns table (procedimiento text, total_cirugias bigint)
language sql stable as $$
  select o.valor, count(distinct c.id)
  from cirugias c
  join cirugias_procedimientos cp on cp.cirugia_id = c.id
  join opciones_lista o on o.id = cp.procedimiento_id
  join pacientes p on p.id = c.paciente_id
  where c.fecha_cirugia between fecha_desde and fecha_hasta
    and p.eliminado = false
  group by o.valor
  order by count(distinct c.id) desc;
$$;

create or replace function fn_indicador_por_rachs(fecha_desde date, fecha_hasta date)
returns table (rachs text, total_cirugias bigint, mortalidad_pct numeric)
language sql stable as $$
  select
    coalesce(rachs_valor, 'Sin RACHS'),
    count(*),
    round(100.0 * count(*) filter (where es_muerte_hospitalaria) / greatest(count(*), 1), 1)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta
  group by rachs_valor
  order by rachs_valor;
$$;

create or replace function fn_indicador_por_eps(fecha_desde date, fecha_hasta date)
returns table (eps text, total_cirugias bigint)
language sql stable as $$
  select coalesce(eps_valor, 'Sin EPS'), count(*)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta
  group by eps_valor
  order by count(*) desc;
$$;

create or replace function fn_indicador_por_procedencia(fecha_desde date, fecha_hasta date)
returns table (procedencia text, total_cirugias bigint)
language sql stable as $$
  select coalesce(procedencia_valor, 'Sin procedencia'), count(*)
  from v_indicadores_cirugias
  where fecha_cirugia between fecha_desde and fecha_hasta
  group by procedencia_valor
  order by count(*) desc;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios: nada se otorga a `anon`. Las vistas requieren GRANT propio (no lo
-- heredan de las tablas base); las funciones son ejecutables por PUBLIC por defecto
-- en Postgres, así que se revoca explícitamente y se otorga solo a `authenticated`.
-- El RLS de las tablas base sigue aplicando a través de las vistas y funciones porque
-- ninguna de ellas es SECURITY DEFINER.
-- ---------------------------------------------------------------------------

grant select on v_pacientes_resumen, v_indicadores_cirugias, v_alertas_seguimiento to authenticated;

revoke execute on function
  fn_indicador_resumen(date, date),
  fn_indicador_por_mes(date, date),
  fn_indicador_por_diagnostico(date, date),
  fn_indicador_por_procedimiento(date, date),
  fn_indicador_por_rachs(date, date),
  fn_indicador_por_eps(date, date),
  fn_indicador_por_procedencia(date, date)
from public;

grant execute on function
  fn_indicador_resumen(date, date),
  fn_indicador_por_mes(date, date),
  fn_indicador_por_diagnostico(date, date),
  fn_indicador_por_procedimiento(date, date),
  fn_indicador_por_rachs(date, date),
  fn_indicador_por_eps(date, date),
  fn_indicador_por_procedencia(date, date)
to authenticated;
