-- Acceso privado por invitación.
-- Ejecutar una vez en Supabase SQL Editor para desactivar la excepción
-- histórica que permitía entrar al club original sin su código real.

begin;

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

  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'crest', v_club.crest);
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

commit;
