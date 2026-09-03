-- EL FULBITO · goles con asistencia
-- Ejecutar en Supabase SQL Editor después de supabase-security.sql y de las
-- migraciones de administración vigentes. Mantiene fulbito_record_goal para
-- clientes anteriores y para los goles "sin autor / en contra".

begin;

-- Algunas filas históricas guardaron NULL de SQL o el literal JSON null. La
-- normalización es idempotente y no toca ningún resultado que tenga datos.
update public.fulbito_matches
   set result = '{}'::jsonb
 where result is null or result = 'null'::jsonb;

-- Mantiene ganador y margen alineados con la planilla autoritativa. Se usa
-- dentro de las operaciones que ya bloquean la fila, de modo que un gol cargado
-- desde otro celular nunca pueda dejar un resultado cerrado desactualizado.
create or replace function public.fulbito_recalculate_score_result(
  p_result jsonb,
  p_teams jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := coalesce(nullif(p_result, 'null'::jsonb), '{}'::jsonb);
  v_goals jsonb;
  v_scores bigint[] := array[]::bigint[];
  v_team_count integer;
  v_team_index integer;
  v_team jsonb;
  v_player jsonb;
  v_goal_key text;
  v_goal_value text;
  v_score bigint;
  v_max bigint;
  v_second bigint;
  v_winner_count integer;
  v_winner integer;
  v_margin integer;
  v_winners jsonb;
begin
  if jsonb_typeof(v_result) <> 'object'
     or jsonb_typeof(p_teams) <> 'array'
     or jsonb_array_length(p_teams) < 2
     or (v_result -> 'goalsTracked') <> 'true'::jsonb
     or not (v_result ? 'winner')
     or v_result -> 'winner' = 'null'::jsonb then
    return v_result;
  end if;

  v_goals := coalesce(v_result -> 'goals', '{}'::jsonb);
  if jsonb_typeof(v_goals) <> 'object' then
    return v_result;
  end if;

  v_team_count := jsonb_array_length(p_teams);
  for v_team_index in 0..v_team_count - 1 loop
    v_team := p_teams -> v_team_index;
    v_score := 0;

    for v_player in
      select player_data
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_team -> 'players') = 'array' then v_team -> 'players'
            else '[]'::jsonb
          end
        ) as player(player_data)
    loop
      v_goal_key := v_player ->> 'id';
      v_goal_value := case when v_goal_key is null then null else v_goals ->> v_goal_key end;
      if v_goal_value ~ '^[0-9]{1,9}$' then
        v_score := v_score + v_goal_value::bigint;
      end if;
    end loop;

    v_goal_value := v_goals ->> ('__t' || v_team_index::text);
    if v_goal_value ~ '^[0-9]{1,9}$' then
      v_score := v_score + v_goal_value::bigint;
    end if;
    v_scores := array_append(v_scores, v_score);
  end loop;

  select max(score), count(*) filter (where score = maximum_score)
    into v_max, v_winner_count
    from unnest(v_scores) as scores(score)
    cross join lateral (select max(value) as maximum_score from unnest(v_scores) as all_scores(value)) maximum;

  select coalesce(jsonb_agg((score_row.ordinality - 1)::integer order by score_row.ordinality), '[]'::jsonb)
    into v_winners
    from unnest(v_scores) with ordinality as score_row(value, ordinality)
   where value = v_max;
  v_result := jsonb_set(v_result, '{winners}', v_winners, true);

  if v_winner_count > 1 then
    v_result := jsonb_set(v_result, '{winner}', to_jsonb('draw'::text), true);
    v_result := jsonb_set(v_result, '{margin}', 'null'::jsonb, true);
    return v_result;
  end if;

  select ordinality::integer - 1
    into v_winner
    from unnest(v_scores) with ordinality as score(value, ordinality)
   where value = v_max
   order by ordinality
   limit 1;
  select value into v_second
    from unnest(v_scores) as score(value)
   order by value desc
   offset 1 limit 1;
  v_margin := least(3, greatest(1, (v_max - coalesce(v_second, 0))::integer));
  v_result := jsonb_set(v_result, '{winner}', to_jsonb(v_winner), true);
  v_result := jsonb_set(v_result, '{margin}', to_jsonb(v_margin), true);
  return v_result;
end;
$$;

-- Compatibilidad con celulares que todavía usan la carga anterior. En un
-- partido que ya tiene goalEvents, la planilla legacy agrega o quita también
-- el evento correspondiente para no separar marcador y detalle.
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

-- Registra una mutación de gol y su procedencia en una sola operación.
-- p_event_id identifica la mutación completa: el mismo ID nunca se aplica dos
-- veces, incluso si el celular reintenta una solicitud por falta de conexión.
create or replace function public.fulbito_record_goal_event(
  p_club_id text,
  p_match_id text,
  p_scorer_id text,
  p_delta integer,
  p_event_id text,
  p_assist_type text,
  p_assist_player_id text
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
  v_mutation_ids jsonb;
  v_event jsonb;
  v_current integer;
  v_next integer;
  v_scorer_count integer;
  v_scorer_team integer;
  v_assister_count integer;
  v_assister_team integer;
  v_remove_index integer;
  v_had_goal_events boolean := false;
  v_assists_complete boolean := true;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if p_match_id is null or p_match_id !~ '^m[a-zA-Z0-9-]{4,80}$'
     or p_delta is null or p_delta not in (-1, 1)
     or p_scorer_id is null or char_length(p_scorer_id) not between 2 and 96
     or p_scorer_id ~ '^__t[0-2]$'
     or p_event_id is null
     or p_event_id !~ '^[a-zA-Z0-9._:-]{8,128}$' then
    raise exception 'La carga de gol y asistencia no es válida' using errcode = '22023';
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

  -- El goleador debe aparecer exactamente una vez en un único equipo. Esto
  -- también evita adjudicar un gol si el partido guardado quedó inconsistente.
  select count(*)::integer, (min(team_number)::integer - 1)
    into v_scorer_count, v_scorer_team
    from jsonb_array_elements(v_match.teams) with ordinality as team_item(team_data, team_number)
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(team_data -> 'players') = 'array' then team_data -> 'players'
        else '[]'::jsonb
      end
    ) as player_item(player_data)
   where player_data ->> 'id' = p_scorer_id;

  if v_scorer_count <> 1 then
    raise exception 'El goleador no pertenece a un único equipo de este partido' using errcode = '22023';
  end if;

  if p_delta = 1 then
    if p_assist_type is null or p_assist_type not in ('player', 'individual', 'rebound') then
      raise exception 'Elegí quién dio la asistencia, jugada individual o rebote' using errcode = '22023';
    end if;

    if p_assist_type = 'player' then
      if p_assist_player_id is null
         or char_length(p_assist_player_id) not between 2 and 96
         or p_assist_player_id = p_scorer_id then
        raise exception 'El asistidor no es válido' using errcode = '22023';
      end if;

      select count(*)::integer, (min(team_number)::integer - 1)
        into v_assister_count, v_assister_team
        from jsonb_array_elements(v_match.teams) with ordinality as team_item(team_data, team_number)
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(team_data -> 'players') = 'array' then team_data -> 'players'
            else '[]'::jsonb
          end
        ) as player_item(player_data)
       where player_data ->> 'id' = p_assist_player_id;

      if v_assister_count <> 1 or v_assister_team <> v_scorer_team then
        raise exception 'El asistidor debe pertenecer al mismo equipo del goleador' using errcode = '22023';
      end if;
    elsif p_assist_player_id is not null then
      raise exception 'Una jugada individual o un rebote no lleva asistidor' using errcode = '22023';
    end if;
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
  if v_result ? 'goalEventMutationIds'
     and jsonb_typeof(v_result -> 'goalEventMutationIds') <> 'array' then
    raise exception 'El control de carga de goles no tiene un formato válido' using errcode = '22023';
  end if;

  v_had_goal_events := v_result ? 'goalEvents';
  v_goals := coalesce(v_result -> 'goals', '{}'::jsonb);
  v_events := coalesce(v_result -> 'goalEvents', '[]'::jsonb);
  v_mutation_ids := coalesce(v_result -> 'goalEventMutationIds', '[]'::jsonb);

  -- La incompletitud es acumulativa: un partido ya incompleto no se vuelve
  -- completo por sumar un evento nuevo. Tampoco se asume detalle completo si
  -- ya había goles históricos antes de crear el primer goalEvent.
  if coalesce((v_result -> 'assistsTracked') = 'false'::jsonb, false)
     or (not v_had_goal_events and exists (
       select 1
         from jsonb_each_text(v_goals) as historical_goal(goal_key, goal_value)
        where goal_key !~ '^__t[0-2]$'
          and case
                when goal_value ~ '^[0-9]{1,9}$' then goal_value::integer
                else 0
              end > 0
     )) then
    v_assists_complete := false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_mutation_ids) as mutation(mutation_id)
     where jsonb_typeof(mutation_id) <> 'string'
        or mutation_id #>> '{}' !~ '^[a-zA-Z0-9._:-]{8,128}$'
  ) then
    raise exception 'El control de carga de goles contiene un identificador inválido' using errcode = '22023';
  end if;

  -- Una misma mutación no puede afectar dos veces el marcador. Además se
  -- consulta goalEvents para soportar filas creadas antes del registro interno.
  if exists (
    select 1
      from jsonb_array_elements(v_mutation_ids) as mutation(mutation_id)
     where mutation_id #>> '{}' = p_event_id
  ) or exists (
    select 1
      from jsonb_array_elements(v_events) as prior_event(event_data)
     where event_data ->> 'id' = p_event_id
  ) then
    return jsonb_build_object('id', v_match.id, 'result', v_result);
  end if;

  if v_goals ? p_scorer_id then
    if coalesce(v_goals ->> p_scorer_id, '') !~ '^[0-9]{1,9}$' then
      raise exception 'La cantidad de goles guardada no es válida' using errcode = '22023';
    end if;
    v_current := (v_goals ->> p_scorer_id)::integer;
  else
    v_current := 0;
  end if;

  if p_delta = 1 then
    if jsonb_array_length(v_events) >= 1000 then
      raise exception 'El partido alcanzó el límite de eventos de gol' using errcode = '22023';
    end if;
    if v_current >= 2147483646 then
      raise exception 'La cantidad de goles alcanzó el límite permitido' using errcode = '22023';
    end if;

    v_event := jsonb_build_object(
      'id', p_event_id,
      'scorerId', p_scorer_id,
      'assistType', p_assist_type,
      'assistPlayerId', case when p_assist_type = 'player' then p_assist_player_id else null end
    );
    v_events := v_events || jsonb_build_array(v_event);
  else
    -- En partidos anteriores puede haber goles agregados sin goalEvents. En ese
    -- caso igual se descuenta del mapa legacy para que la corrección funcione.
    select (max(event_number)::integer - 1)
      into v_remove_index
      from jsonb_array_elements(v_events) with ordinality as event_item(event_data, event_number)
     where event_data ->> 'scorerId' = p_scorer_id;

    if v_remove_index is not null then
      v_events := v_events - v_remove_index;
    end if;
  end if;

  v_next := greatest(0, v_current + p_delta);
  if v_next = 0 then
    v_goals := v_goals - p_scorer_id;
  else
    v_goals := jsonb_set(v_goals, array[p_scorer_id], to_jsonb(v_next), true);
  end if;

  v_mutation_ids := v_mutation_ids || jsonb_build_array(p_event_id);
  if jsonb_array_length(v_mutation_ids) > 200 then
    select coalesce(jsonb_agg(mutation_id order by mutation_number), '[]'::jsonb)
      into v_mutation_ids
      from jsonb_array_elements(v_mutation_ids) with ordinality
        as mutation(mutation_id, mutation_number)
     where mutation_number > jsonb_array_length(v_mutation_ids) - 200;
  end if;

  v_result := jsonb_set(v_result, '{goals}', v_goals, true);
  v_result := jsonb_set(v_result, '{goalEventMutationIds}', v_mutation_ids, true);
  v_result := jsonb_set(v_result, '{goalsTracked}', 'true'::jsonb, true);
  if p_delta = 1 or v_had_goal_events then
    v_result := jsonb_set(v_result, '{goalEvents}', v_events, true);
    v_result := jsonb_set(v_result, '{assistsTracked}', to_jsonb(v_assists_complete), true);
  end if;
  v_result := public.fulbito_recalculate_score_result(v_result, v_match.teams);

  update public.fulbito_matches
     set result = v_result
   where id = v_match.id and club_id = p_club_id;

  return jsonb_build_object('id', v_match.id, 'result', v_result);
end;
$$;

-- Goles y asistencias son campos administrados por los RPC de la planilla. El
-- reset puede reemplazar goals/goalEvents/assistsTracked con la marca transitoria
-- result.goalDataReplace=true, pero nunca borra el historial anti-reintentos.
create or replace function public.fulbito_upsert_match(p_club_id text, p_match jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.fulbito_players%rowtype;
  v_match public.fulbito_matches%rowtype;
  v_id text := p_match ->> 'id';
  v_date date;
  v_player_id text;
  v_is_platform boolean := public.fulbito_is_platform_admin();
  v_existing_result jsonb;
  v_existing_teams jsonb;
  v_existing_found boolean := false;
  v_incoming_result jsonb := p_match -> 'result';
  v_trimmed_mutation_ids jsonb;
  v_replace_goal_data boolean := false;
  v_server_key text;
  v_normalized_goals jsonb := '{}'::jsonb;
begin
  if not v_is_platform and not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede guardar partidos' using errcode = '42501';
  end if;

  if v_is_platform then
    -- El soporte maestro queda auditado con su jugador real, nunca con un
    -- administrador arbitrario del club asistido.
    select * into v_actor from public.fulbito_players
     where auth_user_id = auth.uid()
     limit 1;
  else
    select * into v_actor from public.fulbito_players
     where club_id = p_club_id and auth_user_id = auth.uid() and is_admin;
  end if;
  if not found then
    raise exception 'No se pudo identificar al administrador' using errcode = '42501';
  end if;

  if p_match is null or jsonb_typeof(p_match) <> 'object'
     or v_id is null or v_id !~ '^m[a-zA-Z0-9-]{4,80}$'
     or jsonb_typeof(p_match -> 'teams') <> 'array' or jsonb_array_length(p_match -> 'teams') not between 2 and 3
     or pg_column_size(p_match) > 200000 then
    raise exception 'El partido no tiene un formato válido' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_match -> 'teams') as team(team_data)
     where jsonb_typeof(team_data) <> 'object'
        or jsonb_typeof(coalesce(team_data -> 'players', '[]'::jsonb)) <> 'array'
  ) then
    raise exception 'Los equipos del partido no tienen un formato válido' using errcode = '22023';
  end if;
  if exists (
    select 1
      from (
        select player_data ->> 'id' as player_id, count(*) as appearances
          from jsonb_array_elements(p_match -> 'teams') as team(team_data)
          cross join lateral jsonb_array_elements(coalesce(team_data -> 'players', '[]'::jsonb)) as player(player_data)
         group by player_data ->> 'id'
      ) listed
     where player_id is null or char_length(player_id) not between 2 and 96 or appearances <> 1
  ) then
    raise exception 'Cada jugador debe tener un identificador único dentro del partido' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_match -> 'teams') as team(team_data)
      cross join lateral jsonb_array_elements(coalesce(team_data -> 'players', '[]'::jsonb)) as player(player_data)
     where coalesce(player_data ->> 'isGuest', 'false') = 'true'
       and (
         coalesce(player_data ->> 'id', '') !~ '^guest_[0-9]{10,20}$'
         or char_length(btrim(coalesce(player_data ->> 'name', ''))) not between 1 and 48
         or coalesce(player_data ->> 'name', '') ~ '[<>]'
         or coalesce(player_data ->> 'name', '') ~ '[[:cntrl:]]'
         or coalesce(player_data ->> 'pos', '') not in ('POR', 'DEF', 'MED', 'DEL')
         or case
              when jsonb_typeof(player_data -> 'ovr') = 'number'
                then (player_data ->> 'ovr')::numeric not between 38 and 99
              when player_data -> 'ovr' is null or jsonb_typeof(player_data -> 'ovr') = 'null'
                then false
              else true
            end
         or coalesce(player_data ->> 'photo', '') <> ''
       )
  ) then
    raise exception 'Los datos de un invitado no tienen un formato válido' using errcode = '22023';
  end if;
  if v_incoming_result is null or v_incoming_result = 'null'::jsonb then
    v_incoming_result := '{}'::jsonb;
  elsif jsonb_typeof(v_incoming_result) <> 'object' then
    raise exception 'El resultado del partido no tiene un formato válido' using errcode = '22023';
  end if;
  v_date := nullif(p_match ->> 'match_date', '')::date;

  select teams into v_existing_teams
    from public.fulbito_matches
   where id = v_id and club_id = p_club_id;

  for v_player_id in
    select item ->> 'id'
      from jsonb_array_elements(p_match -> 'teams') team,
           lateral jsonb_array_elements(coalesce(team -> 'players', '[]'::jsonb)) item
     where coalesce(item ->> 'isGuest', 'false') <> 'true'
  loop
    if v_player_id is null or (
      not exists (select 1 from public.fulbito_players where id = v_player_id and club_id = p_club_id)
      and not exists (
        select 1
          from jsonb_array_elements(coalesce(v_existing_teams, '[]'::jsonb)) old_team,
               lateral jsonb_array_elements(coalesce(old_team -> 'players', '[]'::jsonb)) old_player
         where old_player ->> 'id' = v_player_id
           and coalesce(old_player ->> 'isGuest', 'false') <> 'true'
      )
    ) then
      raise exception 'Un jugador del partido no pertenece a este club' using errcode = '22023';
    end if;
  end loop;

  v_replace_goal_data := coalesce(
    (v_incoming_result -> 'goalDataReplace') = 'true'::jsonb,
    false
  );
  v_incoming_result := v_incoming_result - 'goalDataReplace';

  select result into v_existing_result
    from public.fulbito_matches
   where id = v_id and club_id = p_club_id
   for update;
  v_existing_found := found;

  if v_existing_found then
    -- Los IDs procesados sobreviven incluso al reset. De lo contrario, un
    -- reintento tardío podría volver a crear un gol que ya fue eliminado.
    if jsonb_typeof(v_existing_result) = 'object'
       and v_existing_result ? 'goalEventMutationIds' then
      v_incoming_result := jsonb_set(
        v_incoming_result,
        '{goalEventMutationIds}',
        v_existing_result -> 'goalEventMutationIds',
        true
      );
    else
      v_incoming_result := v_incoming_result - 'goalEventMutationIds';
    end if;
  end if;

  if v_existing_found and not v_replace_goal_data then
    foreach v_server_key in array array['goals', 'goalEvents', 'assistsTracked'] loop
      if jsonb_typeof(v_existing_result) = 'object'
         and v_existing_result ? v_server_key then
        v_incoming_result := jsonb_set(
          v_incoming_result,
          array[v_server_key],
          v_existing_result -> v_server_key,
          true
        );
      else
        v_incoming_result := v_incoming_result - v_server_key;
      end if;
    end loop;
  end if;

  -- Versiones anteriores podían persistir cantidades como strings ("2"). Las
  -- convertimos una vez a números antes de validar y conservar el resultado.
  if v_incoming_result ? 'goals'
     and jsonb_typeof(v_incoming_result -> 'goals') = 'object' then
    select coalesce(jsonb_object_agg(
      goal_key,
      case
        when jsonb_typeof(goal_value) = 'string'
         and (goal_value #>> '{}') ~ '^[0-9]{1,4}$'
          then to_jsonb((goal_value #>> '{}')::integer)
        else goal_value
      end
    ), '{}'::jsonb)
      into v_normalized_goals
      from jsonb_each(v_incoming_result -> 'goals') as goal(goal_key, goal_value);
    v_incoming_result := jsonb_set(v_incoming_result, '{goals}', v_normalized_goals, true);
  end if;

  -- Nunca conservar goles como texto libre ni para jugadores ajenos al
  -- plantel. Además de mantener el marcador consistente, evita que un payload
  -- manipulado termine renderizado como HTML en clientes antiguos.
  if v_incoming_result ? 'goals' then
    if jsonb_typeof(v_incoming_result -> 'goals') <> 'object' then
      raise exception 'La planilla de goles no tiene un formato válido' using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_each(v_incoming_result -> 'goals') as goal(goal_key, goal_value)
       where jsonb_typeof(goal_value) <> 'number'
          or (goal_value #>> '{}') !~ '^(0|[1-9][0-9]{0,3})$'
          or (
            not case
              when goal_key ~ '^__t[0-2]$'
                then substring(goal_key from 4)::integer < jsonb_array_length(p_match -> 'teams')
              else false
            end
            and not exists (
              select 1
                from jsonb_array_elements(p_match -> 'teams') as team(team_data)
                cross join lateral jsonb_array_elements(coalesce(team_data -> 'players', '[]'::jsonb)) as player(player_data)
               where player_data ->> 'id' = goal_key
            )
          )
    ) then
      raise exception 'La planilla de goles contiene valores o jugadores inválidos' using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(v_incoming_result) = 'object'
     and v_incoming_result ? 'goalEventMutationIds' then
    if jsonb_typeof(v_incoming_result -> 'goalEventMutationIds') <> 'array' then
      raise exception 'El control de carga de goles no tiene un formato válido' using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_incoming_result -> 'goalEventMutationIds')
          as mutation(mutation_id)
       where jsonb_typeof(mutation_id) <> 'string'
          or mutation_id #>> '{}' !~ '^[a-zA-Z0-9._:-]{8,128}$'
    ) then
      raise exception 'El control de carga de goles contiene un identificador inválido' using errcode = '22023';
    end if;
    if jsonb_array_length(v_incoming_result -> 'goalEventMutationIds') > 200 then
      select coalesce(jsonb_agg(mutation_id order by mutation_number), '[]'::jsonb)
        into v_trimmed_mutation_ids
        from jsonb_array_elements(v_incoming_result -> 'goalEventMutationIds') with ordinality
          as mutation(mutation_id, mutation_number)
       where mutation_number
             > jsonb_array_length(v_incoming_result -> 'goalEventMutationIds') - 200;
      v_incoming_result := jsonb_set(
        v_incoming_result, '{goalEventMutationIds}', v_trimmed_mutation_ids, true
      );
    end if;
  end if;

  v_incoming_result := public.fulbito_recalculate_score_result(
    v_incoming_result,
    p_match -> 'teams'
  );

  insert into public.fulbito_matches (id, match_date, teams, result, created_by, club_id)
  values (v_id, v_date, p_match -> 'teams', v_incoming_result, v_actor.id, p_club_id)
  on conflict (id) do update
    set match_date = excluded.match_date,
        teams = excluded.teams,
        result = excluded.result
    where public.fulbito_matches.club_id = p_club_id
  returning * into v_match;

  if not found then
    raise exception 'No se pudo guardar el partido' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'id', v_match.id, 'match_date', v_match.match_date, 'teams', v_match.teams,
    'result', v_match.result, 'created_by', v_match.created_by,
    'club_id', v_match.club_id, 'created_at', v_match.created_at
  );
end;
$$;

revoke all on function public.fulbito_record_goal(text, text, text, integer) from public;
revoke all on function public.fulbito_record_goal_event(text, text, text, integer, text, text, text) from public;
revoke all on function public.fulbito_upsert_match(text, jsonb) from public;
revoke all on function public.fulbito_recalculate_score_result(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fulbito_record_goal(text, text, text, integer) to authenticated;
grant execute on function public.fulbito_record_goal_event(text, text, text, integer, text, text, text) to authenticated;
grant execute on function public.fulbito_upsert_match(text, jsonb) to authenticated;

commit;
