-- Fulbito · migración de seguridad v6
-- Ejecutar completa en Supabase SQL Editor. Conserva clubes, jugadores y partidos.
-- La app web usa únicamente la clave anónima pública; no incluye service_role.

begin;

create extension if not exists pgcrypto;

alter table public.fulbito_clubs
  add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;

alter table public.fulbito_players
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists _reset_requested boolean not null default false;

create unique index if not exists fulbito_players_auth_club_key
  on public.fulbito_players (auth_user_id, club_id)
  where auth_user_id is not null;

-- Se conserva el administrador histórico en el club original, pero ya no existe
-- ninguna excepción de admin en el navegador.
update public.fulbito_players
   set is_admin = true
 where club_id = 'club-fulbito-sabado'
   and lower(username) = 'titi';

-- RLS se mantiene activa y se eliminan las políticas públicas permisivas.
alter table public.fulbito_clubs enable row level security;
alter table public.fulbito_players enable row level security;
alter table public.fulbito_matches enable row level security;

drop policy if exists "public_all_clubs" on public.fulbito_clubs;
drop policy if exists "public_all" on public.fulbito_players;
drop policy if exists "public_all_matches" on public.fulbito_matches;

-- Estas tablas son residuos de la versión anterior del proyecto. Se cierran para
-- que no queden rutas públicas olvidadas en el mismo proyecto Supabase.
alter table if exists public.attendance enable row level security;
alter table if exists public.players enable row level security;
alter table if exists public.votes enable row level security;
drop policy if exists "public" on public.attendance;
drop policy if exists "public" on public.players;
drop policy if exists "public" on public.votes;

revoke all on table public.fulbito_clubs from public, anon, authenticated;
revoke all on table public.fulbito_players from public, anon, authenticated;
revoke all on table public.fulbito_matches from public, anon, authenticated;
revoke all on table public.attendance from public, anon, authenticated;
revoke all on table public.players from public, anon, authenticated;
revoke all on table public.votes from public, anon, authenticated;

-- Utilidades privadas: las funciones RPC son la única puerta de acceso.
create or replace function public.fulbito_valid_photo(p_photo text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_photo is null or (
    char_length(p_photo) <= 700000
    and p_photo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$'
  );
$$;

create or replace function public.fulbito_player_payload(
  p_player public.fulbito_players,
  p_include_reset boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p_player.id,
    'username', p_player.username,
    'name', p_player.name,
    'photo', p_player.photo,
    'pos_primary', p_player.pos_primary,
    'pos_secondary', p_player.pos_secondary,
    'is_admin', p_player.is_admin,
    'attendance', p_player.attendance,
    'ratings', coalesce(p_player.ratings, '{}'::jsonb),
    '_reset_requested', case when p_include_reset then p_player._reset_requested else false end,
    'club_id', p_player.club_id
  );
$$;

create or replace function public.fulbito_is_member(p_club_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.fulbito_players p
     where p.club_id = p_club_id
       and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.fulbito_is_admin(p_club_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.fulbito_players p
     where p.club_id = p_club_id
       and p.auth_user_id = auth.uid()
       and p.is_admin
  );
$$;

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

  select * into v_player
    from public.fulbito_players
   where club_id = p_club_id
     and auth_user_id = auth.uid();

  if not found then
    return null;
  end if;

  return public.fulbito_player_payload(v_player, public.fulbito_is_admin(p_club_id));
end;
$$;

create or replace function public.fulbito_get_players(p_club_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_include_reset boolean;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;

  v_include_reset := public.fulbito_is_admin(p_club_id);
  return coalesce((
    select jsonb_agg(public.fulbito_player_payload(p, v_include_reset) order by lower(p.username))
      from public.fulbito_players p
     where p.club_id = p_club_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.fulbito_get_matches(p_club_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'match_date', m.match_date,
      'teams', m.teams,
      'result', m.result,
      'created_by', m.created_by,
      'club_id', m.club_id,
      'created_at', m.created_at
    ) order by m.match_date desc nulls last, m.created_at desc)
      from public.fulbito_matches m
     where m.club_id = p_club_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.fulbito_lookup_club(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;

  select * into v_club
    from public.fulbito_clubs
   where upper(invite_code) = upper(trim(p_invite_code))
      or (id = 'club-fulbito-sabado' and p_invite_code = '__LEGACY_PUBLIC__');

  if not found then
    return null;
  end if;

  return jsonb_build_object('id', v_club.id, 'name', v_club.name);
end;
$$;

create or replace function public.fulbito_create_club(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id text;
  v_code text;
  v_club public.fulbito_clubs%rowtype;
begin
  if v_uid is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if char_length(trim(p_name)) not between 3 and 50 or trim(p_name) ~ '[[:cntrl:]]' then
    raise exception 'El nombre del club debe tener entre 3 y 50 caracteres' using errcode = '22023';
  end if;

  loop
    v_id := 'club-' || encode(gen_random_bytes(12), 'hex');
    v_code := 'FB-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
    begin
      insert into public.fulbito_clubs (id, name, invite_code, created_by, owner_auth_user_id)
      values (v_id, trim(p_name), v_code, v_uid::text, v_uid)
      returning * into v_club;
      exit;
    exception when unique_violation then
      -- Un identificador aleatorio colisionó: se reintenta sin exponer datos.
    end;
  end loop;

  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'invite_code', v_club.invite_code);
end;
$$;

create or replace function public.fulbito_register_player(
  p_invite_code text,
  p_name text,
  p_username text,
  p_password text,
  p_pos_primary text,
  p_pos_secondary text default null,
  p_photo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_club public.fulbito_clubs%rowtype;
  v_player public.fulbito_players%rowtype;
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_primary text := upper(trim(p_pos_primary));
  v_secondary text := upper(coalesce(nullif(trim(p_pos_secondary), ''), trim(p_pos_primary)));
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'El usuario debe tener 3 a 32 caracteres: letras, números, punto, guion o guion bajo' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 48 or v_name ~ '[[:cntrl:]<>]' then
    raise exception 'El nombre no es válido' using errcode = '22023';
  end if;
  if char_length(p_password) not between 6 and 128 then
    raise exception 'La contraseña debe tener entre 6 y 128 caracteres' using errcode = '22023';
  end if;
  if v_primary not in ('POR','DEF','MED','DEL') or v_secondary not in ('POR','DEF','MED','DEL') then
    raise exception 'La posición no es válida' using errcode = '22023';
  end if;
  if not public.fulbito_valid_photo(p_photo) then
    raise exception 'La foto no es válida o es demasiado grande' using errcode = '22023';
  end if;

  select * into v_club
    from public.fulbito_clubs
   where upper(invite_code) = upper(trim(p_invite_code))
      or (id = 'club-fulbito-sabado' and p_invite_code = '__LEGACY_PUBLIC__');
  if not found then
    raise exception 'Código de club inválido' using errcode = '42501';
  end if;

  if exists (select 1 from public.fulbito_players where club_id = v_club.id and lower(username) = v_username) then
    raise exception 'Ese usuario ya existe en este club' using errcode = '23505';
  end if;
  if exists (select 1 from public.fulbito_players where club_id = v_club.id and auth_user_id = v_uid) then
    raise exception 'Esta sesión ya tiene un jugador en este club' using errcode = '23505';
  end if;

  v_is_admin := v_club.owner_auth_user_id = v_uid
    or not exists (select 1 from public.fulbito_players where club_id = v_club.id and is_admin);

  insert into public.fulbito_players (
    id, username, name, password, photo, pos_primary, pos_secondary,
    is_admin, attendance, ratings, club_id, auth_user_id
  ) values (
    'p-' || encode(gen_random_bytes(12), 'hex'), v_username, v_name,
    crypt(p_password, gen_salt('bf', 10)), p_photo, v_primary, v_secondary,
    v_is_admin, null, '{}'::jsonb, v_club.id, v_uid
  ) returning * into v_player;

  return public.fulbito_player_payload(v_player, v_is_admin);
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
  v_uid uuid := auth.uid();
  v_player public.fulbito_players%rowtype;
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
     and lower(username) = lower(trim(p_username))
   for update;
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

  return public.fulbito_player_payload(v_player, public.fulbito_is_admin(p_club_id));
end;
$$;

create or replace function public.fulbito_update_my_profile(
  p_club_id text,
  p_name text default null,
  p_username text default null,
  p_pos_primary text default null,
  p_pos_secondary text default null,
  p_photo text default null,
  p_current_password text default null,
  p_new_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_player public.fulbito_players%rowtype;
  v_username text;
  v_name text;
  v_primary text;
  v_secondary text;
  v_credentials_changed boolean;
  v_password_ok boolean;
begin
  if v_uid is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  select * into v_player from public.fulbito_players
   where club_id = p_club_id and auth_user_id = v_uid for update;
  if not found then
    raise exception 'No tenés acceso a este perfil' using errcode = '42501';
  end if;

  v_username := coalesce(nullif(lower(trim(p_username)), ''), v_player.username);
  v_name := coalesce(nullif(trim(p_name), ''), v_player.name);
  v_primary := coalesce(nullif(upper(trim(p_pos_primary)), ''), v_player.pos_primary);
  v_secondary := coalesce(nullif(upper(trim(p_pos_secondary)), ''), v_player.pos_secondary, v_primary);
  v_credentials_changed := v_username <> v_player.username or coalesce(p_new_password, '') <> '';

  if v_username !~ '^[a-z0-9._-]{3,32}$' or char_length(v_name) not between 2 and 48 or v_name ~ '[[:cntrl:]<>]'
     or v_primary not in ('POR','DEF','MED','DEL') or v_secondary not in ('POR','DEF','MED','DEL') then
    raise exception 'Los datos del perfil no son válidos' using errcode = '22023';
  end if;
  if not public.fulbito_valid_photo(p_photo) then
    raise exception 'La foto no es válida o es demasiado grande' using errcode = '22023';
  end if;
  if v_credentials_changed then
    if char_length(coalesce(p_current_password, '')) = 0 then
      raise exception 'Ingresá tu contraseña actual' using errcode = '28000';
    end if;
    v_password_ok := case
      when v_player.password like '$2%' then v_player.password = crypt(p_current_password, v_player.password)
      else v_player.password = encode(convert_to(p_current_password, 'UTF8'), 'base64')
        or v_player.password = p_current_password
        or v_player.password = encode(convert_to(encode(convert_to(p_current_password, 'UTF8'), 'base64'), 'UTF8'), 'base64')
    end;
    if not v_password_ok then
      raise exception 'La contraseña actual no es correcta' using errcode = '28000';
    end if;
    if coalesce(p_new_password, '') <> '' and char_length(p_new_password) not between 6 and 128 then
      raise exception 'La nueva contraseña debe tener entre 6 y 128 caracteres' using errcode = '22023';
    end if;
  end if;
  if v_username <> v_player.username and exists (
    select 1 from public.fulbito_players p where p.club_id = p_club_id and lower(p.username) = v_username and p.id <> v_player.id
  ) then
    raise exception 'Ese usuario ya existe en este club' using errcode = '23505';
  end if;

  update public.fulbito_players
     set username = v_username,
         name = v_name,
         pos_primary = v_primary,
         pos_secondary = v_secondary,
         photo = coalesce(p_photo, v_player.photo),
         password = case when coalesce(p_new_password, '') <> '' then crypt(p_new_password, gen_salt('bf', 10)) else v_player.password end
   where id = v_player.id
   returning * into v_player;
  return public.fulbito_player_payload(v_player, public.fulbito_is_admin(p_club_id));
end;
$$;

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
  select * into v_actor from public.fulbito_players
   where club_id = p_club_id and auth_user_id = auth.uid();
  if not found then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if v_actor.id <> p_player_id and not v_actor.is_admin then
    raise exception 'Solo podés modificar tu asistencia' using errcode = '42501';
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

create or replace function public.fulbito_clear_attendance(p_club_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede borrar la asistencia' using errcode = '42501';
  end if;
  update public.fulbito_players set attendance = null where club_id = p_club_id;
end;
$$;

create or replace function public.fulbito_rate_player(
  p_club_id text,
  p_player_id text,
  p_stat text,
  p_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rater public.fulbito_players%rowtype;
  v_target public.fulbito_players%rowtype;
begin
  select * into v_rater from public.fulbito_players
   where club_id = p_club_id and auth_user_id = auth.uid();
  if not found then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if p_stat not in ('ritmo','tiro','pase','defensa','fisico','atajadas') or p_value not between 1 and 5 then
    raise exception 'Calificación inválida' using errcode = '22023';
  end if;
  select * into v_target from public.fulbito_players where id = p_player_id and club_id = p_club_id for update;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;

  update public.fulbito_players
     set ratings = jsonb_set(coalesce(ratings, '{}'::jsonb), array[v_rater.id, p_stat], to_jsonb(p_value), true)
   where id = v_target.id
   returning * into v_target;
  return public.fulbito_player_payload(v_target, public.fulbito_is_admin(p_club_id));
end;
$$;

create or replace function public.fulbito_clear_ratings(p_club_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede borrar las calificaciones' using errcode = '42501';
  end if;
  update public.fulbito_players set ratings = '{}'::jsonb where club_id = p_club_id;
end;
$$;

create or replace function public.fulbito_request_reset(p_club_id text, p_username text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  update public.fulbito_players
     set _reset_requested = true
   where club_id = p_club_id and lower(username) = lower(trim(p_username));
  -- Respuesta constante: no revela si existe una cuenta.
  return true;
end;
$$;

create or replace function public.fulbito_set_admin(p_club_id text, p_player_id text, p_is_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.fulbito_players%rowtype;
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede modificar roles' using errcode = '42501';
  end if;
  select * into v_target from public.fulbito_players where id = p_player_id and club_id = p_club_id for update;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
  if not p_is_admin and v_target.is_admin and not exists (
    select 1 from public.fulbito_players where club_id = p_club_id and is_admin and id <> p_player_id
  ) then
    raise exception 'El club debe conservar al menos un administrador' using errcode = '22023';
  end if;
  update public.fulbito_players set is_admin = p_is_admin where id = p_player_id returning * into v_target;
  return public.fulbito_player_payload(v_target, true);
end;
$$;

create or replace function public.fulbito_admin_reset_player(p_club_id text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede resetear contraseñas' using errcode = '42501';
  end if;
  update public.fulbito_players
     set password = crypt('1234', gen_salt('bf', 10)),
         auth_user_id = null,
         _reset_requested = false
   where id = p_player_id and club_id = p_club_id;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.fulbito_delete_player(p_club_id text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.fulbito_players%rowtype;
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede eliminar jugadores' using errcode = '42501';
  end if;
  select * into v_target from public.fulbito_players where id = p_player_id and club_id = p_club_id for update;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
  if v_target.is_admin and not exists (
    select 1 from public.fulbito_players where club_id = p_club_id and is_admin and id <> p_player_id
  ) then
    raise exception 'El club debe conservar al menos un administrador' using errcode = '22023';
  end if;
  delete from public.fulbito_players where id = p_player_id and club_id = p_club_id;
end;
$$;

-- Planilla colaborativa: cualquier integrante autenticado puede sumar o restar
-- un gol de un partido existente. No puede alterar planteles, fecha, ganador,
-- MVP ni crear/eliminar partidos. El bloqueo de fila vuelve atómico cada toque
-- cuando varios celulares cargan goles a la vez.
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
  select * into v_actor from public.fulbito_players
   where club_id = p_club_id and auth_user_id = auth.uid() and is_admin;
  if not found then
    raise exception 'Solo un administrador puede guardar partidos' using errcode = '42501';
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

create or replace function public.fulbito_delete_match(p_club_id text, p_match_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede eliminar partidos' using errcode = '42501';
  end if;
  delete from public.fulbito_matches where id = p_match_id and club_id = p_club_id;
  if not found then
    raise exception 'Partido no encontrado' using errcode = '22023';
  end if;
end;
$$;

-- Ninguna función se expone por defecto. Solo una sesión anónima autenticada de
-- la app puede ejecutar las RPC, y cada una valida su club y su rol.
revoke all on function public.fulbito_valid_photo(text) from public;
revoke all on function public.fulbito_player_payload(public.fulbito_players, boolean) from public;
revoke all on function public.fulbito_is_member(text) from public;
revoke all on function public.fulbito_is_admin(text) from public;
revoke all on function public.fulbito_get_my_player(text) from public;
revoke all on function public.fulbito_get_players(text) from public;
revoke all on function public.fulbito_get_matches(text) from public;
revoke all on function public.fulbito_lookup_club(text) from public;
revoke all on function public.fulbito_create_club(text) from public;
revoke all on function public.fulbito_register_player(text, text, text, text, text, text, text) from public;
revoke all on function public.fulbito_login_player(text, text, text) from public;
revoke all on function public.fulbito_update_my_profile(text, text, text, text, text, text, text, text) from public;
revoke all on function public.fulbito_set_attendance(text, text, text) from public;
revoke all on function public.fulbito_clear_attendance(text) from public;
revoke all on function public.fulbito_rate_player(text, text, text, integer) from public;
revoke all on function public.fulbito_clear_ratings(text) from public;
revoke all on function public.fulbito_request_reset(text, text) from public;
revoke all on function public.fulbito_set_admin(text, text, boolean) from public;
revoke all on function public.fulbito_admin_reset_player(text, text) from public;
revoke all on function public.fulbito_delete_player(text, text) from public;
revoke all on function public.fulbito_record_goal(text, text, text, integer) from public;
revoke all on function public.fulbito_upsert_match(text, jsonb) from public;
revoke all on function public.fulbito_delete_match(text, text) from public;

grant execute on function public.fulbito_get_my_player(text) to authenticated;
grant execute on function public.fulbito_get_players(text) to authenticated;
grant execute on function public.fulbito_get_matches(text) to authenticated;
grant execute on function public.fulbito_lookup_club(text) to authenticated;
grant execute on function public.fulbito_create_club(text) to authenticated;
grant execute on function public.fulbito_register_player(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fulbito_login_player(text, text, text) to authenticated;
grant execute on function public.fulbito_update_my_profile(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fulbito_set_attendance(text, text, text) to authenticated;
grant execute on function public.fulbito_clear_attendance(text) to authenticated;
grant execute on function public.fulbito_rate_player(text, text, text, integer) to authenticated;
grant execute on function public.fulbito_clear_ratings(text) to authenticated;
grant execute on function public.fulbito_request_reset(text, text) to authenticated;
grant execute on function public.fulbito_set_admin(text, text, boolean) to authenticated;
grant execute on function public.fulbito_admin_reset_player(text, text) to authenticated;
grant execute on function public.fulbito_delete_player(text, text) to authenticated;
grant execute on function public.fulbito_record_goal(text, text, text, integer) to authenticated;
grant execute on function public.fulbito_upsert_match(text, jsonb) to authenticated;
grant execute on function public.fulbito_delete_match(text, text) to authenticated;

commit;
