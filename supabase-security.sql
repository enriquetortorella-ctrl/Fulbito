-- Fulbito · migración de seguridad v6
-- Ejecutar completa en Supabase SQL Editor. Conserva clubes, jugadores y partidos.
-- La app web usa únicamente la clave anónima pública; no incluye service_role.

begin;

create extension if not exists pgcrypto;

alter table public.fulbito_clubs
  add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;

alter table public.fulbito_players
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists _reset_requested boolean not null default false,
  add column if not exists rating_mode text not null default 'field' check (rating_mode in ('field', 'goalkeeper'));

-- Existe un único acceso maestro para toda la plataforma. Se vincula al ID
-- estable del jugador histórico TITI, no al nombre ni a una sesión temporal.
create table if not exists public.fulbito_platform_master (
  singleton boolean primary key default true check (singleton),
  player_id text not null references public.fulbito_players(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.fulbito_platform_master (singleton, player_id)
select true, p.id
  from public.fulbito_players p
 where p.club_id = 'club-fulbito-sabado'
   and lower(p.username) = 'titi'
limit 1
on conflict (singleton) do update
  set player_id = excluded.player_id,
      updated_at = now();

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
alter table public.fulbito_platform_master enable row level security;

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
revoke all on table public.fulbito_platform_master from public, anon, authenticated;
revoke all on table public.attendance from public, anon, authenticated;
revoke all on table public.players from public, anon, authenticated;
revoke all on table public.votes from public, anon, authenticated;

-- Utilidades privadas: las funciones RPC son la única puerta de acceso.
create or replace function public.fulbito_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.fulbito_platform_master pm
      join public.fulbito_players p on p.id = pm.player_id
     where p.auth_user_id = auth.uid()
  );
$$;

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
    'rating_mode', p_player.rating_mode,
    'is_admin', p_player.is_admin,
    'attendance', p_player.attendance,
    'ratings', coalesce(p_player.ratings, '{}'::jsonb),
    '_reset_requested', case when p_include_reset then p_player._reset_requested else false end,
    'is_platform_admin', public.fulbito_is_platform_admin(),
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

  v_include_reset := public.fulbito_is_admin(p_club_id) or public.fulbito_is_platform_admin();
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
   where upper(invite_code) = upper(trim(p_invite_code));

  if not found then
    return null;
  end if;

  return jsonb_build_object('id', v_club.id, 'name', v_club.name);
end;
$$;

create or replace function public.fulbito_list_clubs()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'crest', c.crest
  ) order by lower(c.name)), '[]'::jsonb)
  from public.fulbito_clubs c;
$$;

create or replace function public.fulbito_platform_list_clubs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_platform_admin() then
    raise exception 'Solo el administrador maestro puede ver todos los clubes' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'crest', c.crest,
      'invite_code', c.invite_code,
      'players_count', (select count(*) from public.fulbito_players p where p.club_id = c.id),
      'admins_count', (select count(*) from public.fulbito_players p where p.club_id = c.id and p.is_admin)
    ) order by lower(c.name))
    from public.fulbito_clubs c
  ), '[]'::jsonb);
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

drop function if exists public.fulbito_register_player(text, text, text, text, text, text, text);
drop function if exists public.fulbito_register_player(text, text, text, text, text, text, text, text);

create or replace function public.fulbito_register_player(
  p_invite_code text,
  p_name text,
  p_username text,
  p_password text,
  p_pos_primary text,
  p_pos_secondary text default null,
  p_photo text default null,
  p_rating_mode text default 'field'
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
  v_rating_mode text := lower(coalesce(nullif(trim(p_rating_mode), ''), 'field'));
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
  if v_rating_mode not in ('field', 'goalkeeper') or (v_rating_mode = 'goalkeeper' and v_primary <> 'POR') then
    raise exception 'El tipo de estadísticas no es válido para la posición elegida' using errcode = '22023';
  end if;
  if not public.fulbito_valid_photo(p_photo) then
    raise exception 'La foto no es válida o es demasiado grande' using errcode = '22023';
  end if;

  select * into v_club
    from public.fulbito_clubs
   where upper(invite_code) = upper(trim(p_invite_code));
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
    id, username, name, password, photo, pos_primary, pos_secondary, rating_mode,
    is_admin, attendance, ratings, club_id, auth_user_id
  ) values (
    'p-' || encode(gen_random_bytes(12), 'hex'), v_username, v_name,
    crypt(p_password, gen_salt('bf', 10)), p_photo, v_primary, v_secondary, v_rating_mode,
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

drop function if exists public.fulbito_update_my_profile(text, text, text, text, text, text, text, text);
drop function if exists public.fulbito_update_my_profile(text, text, text, text, text, text, text, text, text);

create or replace function public.fulbito_update_my_profile(
  p_club_id text,
  p_name text default null,
  p_username text default null,
  p_pos_primary text default null,
  p_pos_secondary text default null,
  p_photo text default null,
  p_current_password text default null,
  p_new_password text default null,
  p_rating_mode text default null
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
  v_rating_mode text;
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
  v_rating_mode := lower(coalesce(nullif(trim(p_rating_mode), ''), v_player.rating_mode, 'field'));
  v_credentials_changed := v_username <> v_player.username or coalesce(p_new_password, '') <> '';

  if v_username !~ '^[a-z0-9._-]{3,32}$' or char_length(v_name) not between 2 and 48 or v_name ~ '[[:cntrl:]<>]'
     or v_primary not in ('POR','DEF','MED','DEL') or v_secondary not in ('POR','DEF','MED','DEL')
     or v_rating_mode not in ('field', 'goalkeeper') or (v_rating_mode = 'goalkeeper' and v_primary <> 'POR') then
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
         rating_mode = v_rating_mode,
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
  v_is_platform boolean := public.fulbito_is_platform_admin();
begin
  select * into v_actor from public.fulbito_players
   where club_id = p_club_id and auth_user_id = auth.uid();
  if not found and not v_is_platform then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  if not v_is_platform and v_actor.id <> p_player_id and not v_actor.is_admin then
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
  if not public.fulbito_is_admin(p_club_id) and not public.fulbito_is_platform_admin() then
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
  if p_stat not in ('ritmo','tiro','pase','defensa','fisico','atajadas','estirada','manos','saque','reflejos','posicion','uno_contra_uno')
     or p_value not between 1 and 5 then
    raise exception 'Calificación inválida' using errcode = '22023';
  end if;
  if v_rater.id = p_player_id then
    raise exception 'No podés calificarte a vos mismo' using errcode = '22023';
  end if;
  select * into v_target from public.fulbito_players where id = p_player_id and club_id = p_club_id for update;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
  if (v_target.rating_mode = 'goalkeeper' and p_stat not in ('estirada','manos','saque','reflejos','posicion','uno_contra_uno'))
     or (coalesce(v_target.rating_mode, 'field') <> 'goalkeeper' and p_stat not in ('ritmo','tiro','pase','defensa','fisico','atajadas')) then
    raise exception 'Ese atributo no corresponde al tipo de estadísticas del jugador' using errcode = '22023';
  end if;

  -- jsonb_set no crea niveles intermedios: con un JSON vacío, intentar
  -- escribir {id-del-votante, estadística} devolvía {} y la primera estrella
  -- nunca persistía. Inicializamos primero el objeto del votante.
  update public.fulbito_players
     set ratings = jsonb_set(
       coalesce(ratings, '{}'::jsonb) || jsonb_build_object(
         v_rater.id,
         case
           when jsonb_typeof(coalesce(ratings, '{}'::jsonb) -> v_rater.id) = 'object'
             then coalesce(ratings, '{}'::jsonb) -> v_rater.id
           else '{}'::jsonb
         end
       ),
       array[v_rater.id, p_stat],
       to_jsonb(p_value),
       true
     )
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
  if not public.fulbito_is_platform_admin() and not public.fulbito_is_admin(p_club_id) then
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
  if not public.fulbito_is_admin(p_club_id) and not public.fulbito_is_platform_admin() then
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

-- Retira el reseteo heredado que imponía la contraseña fija `1234`. RESTRICT
-- es deliberado (valor por defecto): si apareciera una dependencia inesperada,
-- la migración falla de forma segura en lugar de borrarla en cascada.
drop function if exists public.fulbito_admin_reset_player(text, text);

create or replace function public.fulbito_admin_set_player_password(
  p_club_id text,
  p_player_id text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor public.fulbito_players%rowtype;
  v_is_platform boolean := public.fulbito_is_platform_admin();
begin
  select * into v_actor from public.fulbito_players
   where auth_user_id = auth.uid()
     and (v_is_platform or club_id = p_club_id)
   order by (club_id = p_club_id) desc
   limit 1;
  if not found or (not v_is_platform and not v_actor.is_admin) then
    raise exception 'Solo un administrador puede cambiar contraseñas' using errcode = '42501';
  end if;
  if v_actor.id = p_player_id then
    raise exception 'Usá Mi perfil para cambiar tu propia contraseña' using errcode = '22023';
  end if;
  if char_length(coalesce(p_new_password, '')) not between 6 and 128 then
    raise exception 'La contraseña debe tener entre 6 y 128 caracteres' using errcode = '22023';
  end if;
  update public.fulbito_players
     set password = crypt(p_new_password, gen_salt('bf', 10)),
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
  v_actor public.fulbito_players%rowtype;
  v_target public.fulbito_players%rowtype;
  v_is_platform boolean := public.fulbito_is_platform_admin();
begin
  select * into v_actor from public.fulbito_players
   where auth_user_id = auth.uid()
     and (v_is_platform or club_id = p_club_id)
   order by (club_id = p_club_id) desc
   limit 1;
  if not found or (not v_is_platform and not v_actor.is_admin) then
    raise exception 'Solo un administrador puede eliminar jugadores' using errcode = '42501';
  end if;
  select * into v_target from public.fulbito_players where id = p_player_id and club_id = p_club_id for update;
  if not found then
    raise exception 'Jugador no encontrado' using errcode = '22023';
  end if;
  if v_actor.id = v_target.id then
    raise exception 'No podés eliminar tu propia cuenta desde administración' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.fulbito_platform_master where player_id = p_player_id
  ) then
    raise exception 'No se puede eliminar la cuenta del administrador maestro' using errcode = '22023';
  end if;
  if v_target.is_admin and not exists (
    select 1 from public.fulbito_players where club_id = p_club_id and is_admin and id <> p_player_id
  ) then
    raise exception 'El club debe conservar al menos un administrador' using errcode = '22023';
  end if;
  delete from public.fulbito_players where id = p_player_id and club_id = p_club_id;

  -- Al borrar una cuenta también se quitan sus votos de las demás tarjetas.
  -- Si quedaran, un usuario inexistente seguiría alterando OVR y promedios.
  update public.fulbito_players
     set ratings = coalesce(ratings, '{}'::jsonb) - p_player_id
   where club_id = p_club_id
     and coalesce(ratings, '{}'::jsonb) ? p_player_id;
end;
$$;

-- Limpieza única e idempotente para instalaciones que borraron usuarios con
-- una versión anterior: conserva sólo votos de cuentas que todavía pertenecen
-- al mismo club. Así un perfil eliminado no sigue alterando los promedios.
update public.fulbito_players target
   set ratings = coalesce((
     select jsonb_object_agg(entry.key, entry.value)
       from jsonb_each(coalesce(target.ratings, '{}'::jsonb)) entry
      where exists (
        select 1 from public.fulbito_players voter
         where voter.club_id = target.club_id and voter.id = entry.key
      )
   ), '{}'::jsonb)
 where exists (
   select 1
     from jsonb_object_keys(coalesce(target.ratings, '{}'::jsonb)) orphan(voter_id)
    where not exists (
      select 1 from public.fulbito_players voter
       where voter.club_id = target.club_id and voter.id = orphan.voter_id
    )
 );

-- Borrado total reservado exclusivamente al administrador maestro. Protege el
-- club que sostiene su propio acceso para no dejar a la plataforma sin soporte.
create or replace function public.fulbito_platform_delete_club(p_club_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
  v_players_deleted integer := 0;
  v_matches_deleted integer := 0;
begin
  if not public.fulbito_is_platform_admin() then
    raise exception 'Solo el administrador maestro puede eliminar clubes' using errcode = '42501';
  end if;

  select * into v_club from public.fulbito_clubs where id = p_club_id;
  if not found then
    raise exception 'Club no encontrado' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.fulbito_platform_master pm
      join public.fulbito_players p on p.id = pm.player_id
     where p.club_id = p_club_id
  ) then
    raise exception 'No se puede eliminar el club que contiene al administrador maestro' using errcode = '22023';
  end if;

  delete from public.fulbito_matches where club_id = p_club_id;
  get diagnostics v_matches_deleted = row_count;

  delete from public.fulbito_players where club_id = p_club_id;
  get diagnostics v_players_deleted = row_count;

  delete from public.fulbito_clubs where id = p_club_id;

  return jsonb_build_object(
    'club_id', p_club_id,
    'club_name', v_club.name,
    'players_deleted', v_players_deleted,
    'matches_deleted', v_matches_deleted
  );
end;
$$;

-- Planilla colaborativa: cualquier integrante autenticado puede sumar o restar
-- un gol de un partido existente. No puede alterar planteles, fecha, ganador,
-- MVP ni crear/eliminar partidos. El bloqueo de fila vuelve atómico cada toque
-- cuando varios celulares cargan goles a la vez.
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

  select ordinality::integer - 1 into v_winner
    from unnest(v_scores) with ordinality as score(value, ordinality)
   where value = v_max order by ordinality limit 1;
  select value into v_second
    from unnest(v_scores) as score(value)
   order by value desc offset 1 limit 1;
  v_margin := least(3, greatest(1, (v_max - coalesce(v_second, 0))::integer));
  v_result := jsonb_set(v_result, '{winner}', to_jsonb(v_winner), true);
  v_result := jsonb_set(v_result, '{margin}', to_jsonb(v_margin), true);
  return v_result;
end;
$$;

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

-- Cada gol nuevo registra también cómo se originó. El ID de mutación hace
-- idempotentes tanto la suma como la resta ante reintentos de red.
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
    -- Registrar al soporte maestro real como creador, aunque esté trabajando
    -- sobre un club del que no forma parte.
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

  -- Los RPC de la planilla son la única fuente ordinaria para goles y
  -- asistencias. El reset no elimina los IDs usados contra reintentos tardíos.
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

create or replace function public.fulbito_delete_match(p_club_id text, p_match_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fulbito_is_admin(p_club_id) and not public.fulbito_is_platform_admin() then
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
revoke all on function public.fulbito_is_platform_admin() from public;
revoke all on function public.fulbito_is_member(text) from public;
revoke all on function public.fulbito_is_admin(text) from public;
revoke all on function public.fulbito_get_my_player(text) from public;
revoke all on function public.fulbito_get_players(text) from public;
revoke all on function public.fulbito_get_matches(text) from public;
revoke all on function public.fulbito_lookup_club(text) from public;
revoke all on function public.fulbito_list_clubs() from public;
revoke all on function public.fulbito_platform_list_clubs() from public;
revoke all on function public.fulbito_create_club(text) from public;
revoke all on function public.fulbito_register_player(text, text, text, text, text, text, text, text) from public;
revoke all on function public.fulbito_login_player(text, text, text) from public;
revoke all on function public.fulbito_update_my_profile(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.fulbito_set_attendance(text, text, text) from public;
revoke all on function public.fulbito_clear_attendance(text) from public;
revoke all on function public.fulbito_rate_player(text, text, text, integer) from public;
revoke all on function public.fulbito_clear_ratings(text) from public;
revoke all on function public.fulbito_request_reset(text, text) from public;
revoke all on function public.fulbito_set_admin(text, text, boolean) from public;
revoke all on function public.fulbito_admin_set_player_password(text, text, text) from public;
revoke all on function public.fulbito_delete_player(text, text) from public;
revoke all on function public.fulbito_platform_delete_club(text) from public;
revoke all on function public.fulbito_record_goal(text, text, text, integer) from public;
revoke all on function public.fulbito_record_goal_event(text, text, text, integer, text, text, text) from public;
revoke all on function public.fulbito_upsert_match(text, jsonb) from public;
revoke all on function public.fulbito_recalculate_score_result(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fulbito_delete_match(text, text) from public;

grant execute on function public.fulbito_get_my_player(text) to authenticated;
grant execute on function public.fulbito_is_platform_admin() to authenticated;
grant execute on function public.fulbito_get_players(text) to authenticated;
grant execute on function public.fulbito_get_matches(text) to authenticated;
grant execute on function public.fulbito_lookup_club(text) to authenticated;
grant execute on function public.fulbito_list_clubs() to authenticated;
grant execute on function public.fulbito_platform_list_clubs() to authenticated;
grant execute on function public.fulbito_create_club(text) to authenticated;
grant execute on function public.fulbito_register_player(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fulbito_login_player(text, text, text) to authenticated;
grant execute on function public.fulbito_update_my_profile(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fulbito_set_attendance(text, text, text) to authenticated;
grant execute on function public.fulbito_clear_attendance(text) to authenticated;
grant execute on function public.fulbito_rate_player(text, text, text, integer) to authenticated;
grant execute on function public.fulbito_clear_ratings(text) to authenticated;
grant execute on function public.fulbito_request_reset(text, text) to authenticated;
grant execute on function public.fulbito_set_admin(text, text, boolean) to authenticated;
grant execute on function public.fulbito_admin_set_player_password(text, text, text) to authenticated;
grant execute on function public.fulbito_delete_player(text, text) to authenticated;
grant execute on function public.fulbito_platform_delete_club(text) to authenticated;
grant execute on function public.fulbito_record_goal(text, text, text, integer) to authenticated;
grant execute on function public.fulbito_record_goal_event(text, text, text, integer, text, text, text) to authenticated;
grant execute on function public.fulbito_upsert_match(text, jsonb) to authenticated;
grant execute on function public.fulbito_delete_match(text, text) to authenticated;

commit;
