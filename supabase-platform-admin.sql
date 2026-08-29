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
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede guardar partidos' using errcode = '42501';
  end if;

  if public.fulbito_is_platform_admin() then
    select * into v_actor from public.fulbito_players where auth_user_id = auth.uid() limit 1;
  else
    select * into v_actor from public.fulbito_players
     where club_id = p_club_id and auth_user_id = auth.uid() and is_admin;
  end if;
  if not found then
    raise exception 'No se pudo identificar al administrador' using errcode = '42501';
  end if;

  if p_match is null or jsonb_typeof(p_match) <> 'object' or v_id !~ '^m[a-zA-Z0-9-]{4,80}$'
     or jsonb_typeof(p_match -> 'teams') <> 'array' or jsonb_array_length(p_match -> 'teams') not between 2 and 3
     or pg_column_size(p_match) > 200000 then
    raise exception 'El partido no tiene un formato válido' using errcode = '22023';
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

  insert into public.fulbito_matches (id, match_date, teams, result, created_by, club_id)
  values (v_id, v_date, p_match -> 'teams', p_match -> 'result', v_actor.id, p_club_id)
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
set search_path = public, pg_temp
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
