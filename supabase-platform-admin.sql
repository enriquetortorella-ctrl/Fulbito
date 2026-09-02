-- Fulbito · cuenta maestra de soporte
-- Ejecutar DESPUÉS de supabase-security.sql. No abre tablas al navegador ni
-- entrega códigos de invitación: el acceso maestro se valida por auth.uid().

begin;

create table if not exists public.fulbito_platform_admins (
  player_id text primary key references public.fulbito_players(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.fulbito_platform_admins enable row level security;
revoke all on table public.fulbito_platform_admins from public, anon, authenticated;

-- La cuenta maestra inicial queda ligada a la cuenta histórica de Enrique.
-- Se activa recién cuando @titi inicia sesión y queda vinculada a auth.uid().
insert into public.fulbito_platform_admins (player_id)
values ('p1775657682650')
on conflict (player_id) do nothing;

create or replace function public.fulbito_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.fulbito_platform_admins pa
      join public.fulbito_players p on p.id = pa.player_id
     where p.auth_user_id = auth.uid()
  );
$$;

-- El maestro puede abrir clubes para soporte; los jugadores normales conservan
-- exactamente el acceso limitado a su propio club.
create or replace function public.fulbito_is_member(p_club_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.fulbito_is_platform_admin()
    or exists (
      select 1
        from public.fulbito_players p
       where p.club_id = p_club_id
         and p.auth_user_id = auth.uid()
    )
  );
$$;

create or replace function public.fulbito_is_admin(p_club_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.fulbito_is_platform_admin()
    or exists (
      select 1
        from public.fulbito_players p
       where p.club_id = p_club_id
         and p.auth_user_id = auth.uid()
         and p.is_admin
    )
  );
$$;

-- La asistencia puede ser corregida por un admin maestro, sin inventar una
-- asistencia propia dentro del club asistido.
create or replace function public.fulbito_set_attendance(
  p_club_id text,
  p_player_id text,
  p_attendance text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.fulbito_players%rowtype;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if not public.fulbito_is_platform_admin() then
    select * into v_actor from public.fulbito_players
     where club_id = p_club_id and auth_user_id = auth.uid();
    if not found then
      raise exception 'No tenés acceso a este club' using errcode = '42501';
    end if;
    if v_actor.id <> p_player_id and not v_actor.is_admin then
      raise exception 'Solo podés modificar tu asistencia' using errcode = '42501';
    end if;
  end if;
  if p_attendance is not null and p_attendance not in ('going', 'notgoing') then
    raise exception 'Estado de asistencia inválido' using errcode = '22023';
  end if;
  update public.fulbito_players
     set attendance = p_attendance
   where id = p_player_id and club_id = p_club_id;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
end;
$$;

-- En un partido guardado desde soporte, el creador queda auditado como la
-- cuenta maestra real, aunque no integre el plantel del club asistido.
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
    select * into v_actor from public.fulbito_players where auth_user_id = auth.uid() limit 1;
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

  for v_player_id in
    select item ->> 'id'
      from jsonb_array_elements(p_match -> 'teams') team,
           lateral jsonb_array_elements(coalesce(team -> 'players', '[]'::jsonb)) item
     where coalesce(item ->> 'isGuest', 'false') <> 'true'
  loop
    if v_player_id is null or not exists (
      select 1 from public.fulbito_players where id = v_player_id and club_id = p_club_id
    ) then
      raise exception 'Un jugador del partido no pertenece a este club' using errcode = '22023';
    end if;
  end loop;

  v_replace_goal_data := coalesce(
    (v_incoming_result -> 'goalDataReplace') = 'true'::jsonb,
    false
  );
  v_incoming_result := v_incoming_result - 'goalDataReplace';

  -- Goles y asistencias permanecen bajo control del servidor. El reset puede
  -- limpiar sus datos, pero conserva los IDs usados contra reintentos tardíos.
  select result into v_existing_result
    from public.fulbito_matches
   where id = v_id and club_id = p_club_id
   for update;
  v_existing_found := found;

  if v_existing_found then
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

-- Catálogo de soporte: solo la cuenta maestra lo puede solicitar. No expone
-- invitation_code ni campos de autenticación.
create or replace function public.fulbito_platform_list_clubs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_platform_admin() then
    raise exception 'Acceso maestro requerido' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'players_count', (select count(*) from public.fulbito_players p where p.club_id = c.id),
      'admins_count', (select count(*) from public.fulbito_players p where p.club_id = c.id and p.is_admin)
    ) order by lower(c.name))
      from public.fulbito_clubs c
  ), '[]'::jsonb);
end;
$$;

-- La respuesta de la propia sesión indica si puede abrir el Centro de soporte.
create or replace function public.fulbito_get_my_player(p_club_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.fulbito_players%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  select * into v_player from public.fulbito_players
   where club_id = p_club_id and auth_user_id = auth.uid();
  if not found then
    return null;
  end if;
  return public.fulbito_player_payload(v_player, public.fulbito_is_admin(p_club_id))
    || jsonb_build_object('is_platform_admin', public.fulbito_is_platform_admin());
end;
$$;

create or replace function public.fulbito_login_player(
  p_club_id text,
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_player public.fulbito_players%rowtype;
  v_uid uuid := auth.uid();
  v_stored text;
  v_matches boolean;
begin
  if v_uid is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if char_length(p_password) > 128 then
    raise exception 'Usuario o contraseña incorrectos' using errcode = '28000';
  end if;
  select * into v_player
    from public.fulbito_players
   where club_id = p_club_id
     and lower(username) = lower(trim(p_username));
  if not found then
    raise exception 'Usuario o contraseña incorrectos' using errcode = '28000';
  end if;
  v_stored := coalesce(v_player.password, '');
  v_matches := case
    when v_stored like '$2%' then v_stored = crypt(p_password, v_stored)
    else v_stored = encode(convert_to(p_password, 'UTF8'), 'base64')
      or v_stored = p_password
      or v_stored = encode(convert_to(encode(convert_to(p_password, 'UTF8'), 'base64'), 'UTF8'), 'base64')
  end;
  if not v_matches then
    raise exception 'Usuario o contraseña incorrectos' using errcode = '28000';
  end if;
  update public.fulbito_players
     set auth_user_id = v_uid,
         password = crypt(p_password, gen_salt('bf', 10)),
         _reset_requested = false
   where id = v_player.id
   returning * into v_player;
  return public.fulbito_player_payload(v_player, public.fulbito_is_admin(p_club_id))
    || jsonb_build_object('is_platform_admin', public.fulbito_is_platform_admin());
end;
$$;

revoke all on function public.fulbito_is_platform_admin() from public;
revoke all on function public.fulbito_platform_list_clubs() from public;
grant execute on function public.fulbito_get_my_player(text) to authenticated;
grant execute on function public.fulbito_login_player(text, text, text) to authenticated;
grant execute on function public.fulbito_set_attendance(text, text, text) to authenticated;
grant execute on function public.fulbito_upsert_match(text, jsonb) to authenticated;
grant execute on function public.fulbito_platform_list_clubs() to authenticated;

commit;
