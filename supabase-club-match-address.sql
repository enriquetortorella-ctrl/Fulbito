-- El Fulbito · dirección privada para Google Maps
-- Ejecutar después de supabase-club-match-schedule.sql.

begin;

alter table public.fulbito_clubs
  add column if not exists match_address text;

alter table public.fulbito_clubs
  drop constraint if exists fulbito_clubs_match_address_valid;

alter table public.fulbito_clubs
  add constraint fulbito_clubs_match_address_valid check (
    match_address is null
    or (char_length(trim(match_address)) between 5 and 140 and match_address !~ '[[:cntrl:]<>]')
  );

create or replace function public.fulbito_get_club_brand(p_club_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
begin
  if not public.fulbito_is_member(p_club_id) then
    raise exception 'No tenés acceso a este club' using errcode = '42501';
  end if;
  select * into v_club from public.fulbito_clubs where id = p_club_id;
  if not found then
    raise exception 'Club no encontrado' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'id', v_club.id,
    'name', v_club.name,
    'crest', v_club.crest,
    'invite_code', case when public.fulbito_is_admin(p_club_id) then v_club.invite_code else null end,
    'match_weekday', v_club.match_weekday,
    'match_time', to_char(v_club.match_time, 'HH24:MI'),
    'match_venue', v_club.match_venue,
    'match_address', v_club.match_address
  );
end;
$$;

drop function if exists public.fulbito_update_club_match_schedule(text, smallint, time without time zone, text);

create function public.fulbito_update_club_match_schedule(
  p_club_id text,
  p_match_weekday smallint default null,
  p_match_time time without time zone default null,
  p_match_venue text default null,
  p_match_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
  v_venue text := nullif(trim(coalesce(p_match_venue, '')), '');
  v_address text := nullif(trim(coalesce(p_match_address, '')), '');
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede configurar el próximo partido' using errcode = '42501';
  end if;
  if p_match_weekday is null and p_match_time is null and v_venue is null and v_address is null then
    update public.fulbito_clubs set match_weekday = null, match_time = null, match_venue = null, match_address = null
     where id = p_club_id returning * into v_club;
  else
    if p_match_weekday is null or p_match_weekday not between 0 and 6 or p_match_time is null
       or v_venue is null or char_length(v_venue) not between 2 and 80 or v_venue ~ '[[:cntrl:]<>]'
       or (v_address is not null and (char_length(v_address) not between 5 and 140 or v_address ~ '[[:cntrl:]<>]')) then
      raise exception 'Completá un día, hora, cancha y dirección válidos' using errcode = '22023';
    end if;
    update public.fulbito_clubs set match_weekday = p_match_weekday, match_time = p_match_time,
      match_venue = v_venue, match_address = v_address where id = p_club_id returning * into v_club;
  end if;
  if not found then raise exception 'Club no encontrado' using errcode = '22023'; end if;
  return jsonb_build_object(
    'id', v_club.id, 'name', v_club.name, 'crest', v_club.crest,
    'invite_code', case when public.fulbito_is_admin(p_club_id) then v_club.invite_code else null end,
    'match_weekday', v_club.match_weekday, 'match_time', to_char(v_club.match_time, 'HH24:MI'),
    'match_venue', v_club.match_venue, 'match_address', v_club.match_address
  );
end;
$$;

revoke all on function public.fulbito_update_club_match_schedule(text, smallint, time without time zone, text, text) from public;
grant execute on function public.fulbito_update_club_match_schedule(text, smallint, time without time zone, text, text) to authenticated;

commit;
