-- Fulbito · planilla de goles colaborativa
-- Ejecutar en Supabase SQL Editor después de supabase-security.sql.
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
  v_current integer;
  v_next integer;
  v_team_index integer;
  v_valid_key boolean := false;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if p_match_id !~ '^m[a-zA-Z0-9-]{4,80}$' or p_delta not in (-1, 1)
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

  select exists (
    select 1
      from jsonb_array_elements(v_match.teams) team,
           lateral jsonb_array_elements(coalesce(team -> 'players', '[]'::jsonb)) player
     where player ->> 'id' = p_goal_key
  ) into v_valid_key;

  if not v_valid_key and p_goal_key ~ '^__t[0-2]$' then
    v_team_index := substring(p_goal_key from 4)::integer;
    v_valid_key := v_team_index < jsonb_array_length(v_match.teams);
  end if;
  if not v_valid_key then
    raise exception 'El goleador no pertenece a este partido' using errcode = '22023';
  end if;

  v_result := coalesce(v_match.result, '{}'::jsonb);
  v_goals := coalesce(v_result -> 'goals', '{}'::jsonb);
  v_current := coalesce(nullif(v_goals ->> p_goal_key, '')::integer, 0);
  v_next := greatest(0, v_current + p_delta);
  if v_next = 0 then
    v_goals := v_goals - p_goal_key;
  else
    v_goals := jsonb_set(v_goals, array[p_goal_key], to_jsonb(v_next), true);
  end if;
  v_result := jsonb_set(v_result, '{goals}', v_goals, true);
  v_result := jsonb_set(v_result, '{goalsTracked}', 'true'::jsonb, true);

  update public.fulbito_matches
     set result = v_result
   where id = v_match.id and club_id = p_club_id;

  return jsonb_build_object('id', v_match.id, 'result', v_result);
end;
$$;

revoke all on function public.fulbito_record_goal(text, text, text, integer) from public;
grant execute on function public.fulbito_record_goal(text, text, text, integer) to authenticated;

commit;
