-- Fulbito · planilla de goles colaborativa
-- Ejecutar en Supabase SQL Editor después de supabase-security.sql.
-- Después ejecutar supabase-goal-assists.sql para habilitar la carga atómica
-- de asistencias. Esta función legacy se conserva para clientes anteriores y
-- para los goles cargados como "sin autor / en contra".
-- Permite a un miembro autenticado del club sumar/restar goles de un partido
-- existente, sin habilitar la edición de equipos, resultados, jugadores ni fecha.

begin;

create or replace function public.fulbito_record_goal(
  p_club_id text,
  p_match_id text,
  p_goal_key text,
  p_delta integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.fulbito_matches%rowtype;
  v_result jsonb;
  v_goals jsonb;
  v_events jsonb;
  v_event_id text;
  v_current integer;
  v_next integer;
  v_team_index integer;
  v_remove_index integer;
  v_is_player boolean := false;
  v_valid_key boolean := false;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if p_match_id is null or p_match_id !~ '^m[a-zA-Z0-9-]{4,80}$'
     or p_delta is null or p_delta not in (-1, 1)
     or p_goal_key is null or char_length(p_goal_key) not between 2 and 96 then
    raise exception 'La carga de gol no es válida' using errcode = '22023';
  end if;

  select * into v_match
    from public.fulbito_matches
   where id = p_match_id and club_id = p_club_id
   for update;
  if not found then
    raise exception 'Partido no encontrado' using errcode = '22023';
  end if;
  if coalesce(v_match.result ->> 'winner', '') <> ''
     and not public.fulbito_is_admin(p_club_id)
     and not public.fulbito_is_platform_admin() then
    raise exception 'El partido ya fue cerrado. Solo un administrador puede corregir la planilla' using errcode = '42501';
  end if;

  select exists (
    select 1
      from jsonb_array_elements(v_match.teams) team,
           lateral jsonb_array_elements(coalesce(team -> 'players', '[]'::jsonb)) player
     where player ->> 'id' = p_goal_key
  ) into v_is_player;
  v_valid_key := v_is_player;

  if not v_valid_key and p_goal_key ~ '^__t[0-2]$' then
    v_team_index := substring(p_goal_key from 4)::integer;
    v_valid_key := v_team_index < jsonb_array_length(v_match.teams);
  end if;
  if not v_valid_key then
    raise exception 'El goleador no pertenece a este partido' using errcode = '22023';
  end if;

  v_result := coalesce(nullif(v_match.result, 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(v_result) <> 'object' then
    raise exception 'El resultado guardado no tiene un formato válido' using errcode = '22023';
  end if;
  if v_result ? 'goals' and jsonb_typeof(v_result -> 'goals') <> 'object' then
    raise exception 'La planilla de goles guardada no tiene un formato válido' using errcode = '22023';
  end if;
  if v_result ? 'goalEvents' and jsonb_typeof(v_result -> 'goalEvents') <> 'array' then
    raise exception 'El detalle de goles guardado no tiene un formato válido' using errcode = '22023';
  end if;

  v_goals := coalesce(v_result -> 'goals', '{}'::jsonb);
  if v_goals ? p_goal_key then
    if coalesce(v_goals ->> p_goal_key, '') !~ '^[0-9]{1,9}$' then
      raise exception 'La cantidad de goles guardada no es válida' using errcode = '22023';
    end if;
    v_current := (v_goals ->> p_goal_key)::integer;
  else
    v_current := 0;
  end if;
  v_next := greatest(0, v_current + p_delta);

  -- Si el partido ya usa el detalle nuevo, un cliente anterior también debe
  -- mantenerlo sincronizado. Como no informa asistidor, una suma deja el
  -- detalle marcado como incompleto; una resta conserva la marca existente.
  if v_is_player and v_result ? 'goalEvents' then
    v_events := v_result -> 'goalEvents';
    if p_delta = 1 then
      if jsonb_array_length(v_events) >= 1000 then
        raise exception 'El partido alcanzó el límite de eventos de gol' using errcode = '22023';
      end if;
      v_event_id := 'legacy-' || md5(
        clock_timestamp()::text || ':' || txid_current()::text || ':' ||
        p_match_id || ':' || p_goal_key || ':' || random()::text
      );
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'id', v_event_id,
        'scorerId', p_goal_key,
        'assistType', 'unrecorded',
        'assistPlayerId', null
      ));
    else
      select (max(event_number)::integer - 1)
        into v_remove_index
        from jsonb_array_elements(v_events) with ordinality as event_item(event_data, event_number)
       where event_data ->> 'scorerId' = p_goal_key;
      if v_remove_index is not null then
        v_events := v_events - v_remove_index;
      end if;
    end if;
    v_result := jsonb_set(v_result, '{goalEvents}', v_events, true);
    if p_delta = 1 then
      v_result := jsonb_set(v_result, '{assistsTracked}', 'false'::jsonb, true);
    end if;
  end if;

  if v_next = 0 then
    v_goals := v_goals - p_goal_key;
  else
    v_goals := jsonb_set(v_goals, array[p_goal_key], to_jsonb(v_next), true);
  end if;
  v_result := jsonb_set(v_result, '{goals}', v_goals, true);
  v_result := jsonb_set(v_result, '{goalsTracked}', 'true'::jsonb, true);
  v_result := public.fulbito_recalculate_score_result(v_result, v_match.teams);

  update public.fulbito_matches
     set result = v_result
   where id = v_match.id and club_id = p_club_id;

  return jsonb_build_object('id', v_match.id, 'result', v_result);
end;
$$;

revoke all on function public.fulbito_record_goal(text, text, text, integer) from public;
grant execute on function public.fulbito_record_goal(text, text, text, integer) to authenticated;

commit;
