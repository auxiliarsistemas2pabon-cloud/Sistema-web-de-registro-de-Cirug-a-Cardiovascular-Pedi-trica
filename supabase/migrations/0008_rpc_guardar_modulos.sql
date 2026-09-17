-- El patrón "reemplazar la selección" de Módulo 2 (riesgos) y Módulo 3 (procedimientos)
-- implica un DELETE + INSERT en la tabla de unión. Hacerlo como dos llamadas REST
-- separadas desde el cliente no es atómico: si la segunda falla, el paciente queda sin
-- ningún riesgo/procedimiento registrado. Estas funciones RPC hacen ambos pasos en una
-- sola transacción. Corren como SECURITY INVOKER (no DEFINER): el RLS de las tablas de
-- negocio sigue aplicando normalmente para quien llama la función.

create or replace function fn_guardar_diagnostico(
  p_paciente_id uuid,
  p_diagnostico_id uuid,
  p_rachs_id uuid,
  p_valvulopatia_id uuid,
  p_riesgo_ids uuid[],
  p_estado_modulo estado_modulo_enum,
  p_usuario_id uuid
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_diagnostico_id uuid;
begin
  insert into diagnosticos (paciente_id, diagnostico_id, valvulopatia_id, rachs_id, estado_modulo, creado_por, actualizado_por)
  values (p_paciente_id, p_diagnostico_id, p_valvulopatia_id, p_rachs_id, p_estado_modulo, p_usuario_id, p_usuario_id)
  on conflict (paciente_id) do update
    set diagnostico_id = excluded.diagnostico_id,
        valvulopatia_id = excluded.valvulopatia_id,
        rachs_id = excluded.rachs_id,
        estado_modulo = excluded.estado_modulo,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = now()
  returning id into v_diagnostico_id;

  delete from diagnosticos_riesgos where diagnostico_id = v_diagnostico_id;

  if p_riesgo_ids is not null and array_length(p_riesgo_ids, 1) > 0 then
    insert into diagnosticos_riesgos (diagnostico_id, riesgo_id)
    select v_diagnostico_id, r from unnest(p_riesgo_ids) as r;
  end if;

  return v_diagnostico_id;
end;
$$;

create or replace function fn_guardar_cirugia(
  p_paciente_id uuid,
  p_fecha_cirugia date,
  p_implante_id uuid,
  p_uso_cec si_no,
  p_tiempo_cec_min integer,
  p_tiempo_clamp_min integer,
  p_complicacion_intraqx_id uuid,
  p_cierre_esternal_diferido si_no,
  p_extubacion_quirofano si_no,
  p_procedimiento_ids uuid[],
  p_estado_modulo estado_modulo_enum,
  p_usuario_id uuid
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_cirugia_id uuid;
begin
  insert into cirugias (
    paciente_id, fecha_cirugia, implante_id, uso_cec, tiempo_cec_min, tiempo_clamp_min,
    complicacion_intraqx_id, cierre_esternal_diferido, extubacion_quirofano, estado_modulo,
    creado_por, actualizado_por
  )
  values (
    p_paciente_id, p_fecha_cirugia, p_implante_id, p_uso_cec, p_tiempo_cec_min, p_tiempo_clamp_min,
    p_complicacion_intraqx_id, p_cierre_esternal_diferido, p_extubacion_quirofano, p_estado_modulo,
    p_usuario_id, p_usuario_id
  )
  on conflict (paciente_id) do update
    set fecha_cirugia = excluded.fecha_cirugia,
        implante_id = excluded.implante_id,
        uso_cec = excluded.uso_cec,
        tiempo_cec_min = excluded.tiempo_cec_min,
        tiempo_clamp_min = excluded.tiempo_clamp_min,
        complicacion_intraqx_id = excluded.complicacion_intraqx_id,
        cierre_esternal_diferido = excluded.cierre_esternal_diferido,
        extubacion_quirofano = excluded.extubacion_quirofano,
        estado_modulo = excluded.estado_modulo,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = now()
  returning id into v_cirugia_id;

  delete from cirugias_procedimientos where cirugia_id = v_cirugia_id;

  if p_procedimiento_ids is not null and array_length(p_procedimiento_ids, 1) > 0 then
    insert into cirugias_procedimientos (cirugia_id, procedimiento_id, orden)
    select v_cirugia_id, pid, ord::smallint
    from unnest(p_procedimiento_ids) with ordinality as t(pid, ord);
  end if;

  return v_cirugia_id;
end;
$$;

revoke execute on function fn_guardar_diagnostico(uuid, uuid, uuid, uuid, uuid[], estado_modulo_enum, uuid) from public;
revoke execute on function fn_guardar_cirugia(uuid, date, uuid, si_no, integer, integer, uuid, si_no, si_no, uuid[], estado_modulo_enum, uuid) from public;

grant execute on function fn_guardar_diagnostico(uuid, uuid, uuid, uuid, uuid[], estado_modulo_enum, uuid) to authenticated;
grant execute on function fn_guardar_cirugia(uuid, date, uuid, si_no, integer, integer, uuid, si_no, si_no, uuid[], estado_modulo_enum, uuid) to authenticated;
