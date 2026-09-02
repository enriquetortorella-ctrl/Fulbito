-- El Fulbito · día, hora y sede fija por club
-- Ejecutar una vez después de supabase-club-branding.sql.
-- La configuración es del club; no expone datos entre grupos.

begin;

alter table public.fulbito_clubs
  add column if not exists match_weekday smallint,
  add column if not exists match_time time without time zone,
  add column if not exists match_venue text;

alter table public.fulbito_clubs
  drop constraint if exists fulbito_clubs_match_schedule_valid;

alter table public.fulbito_clubs
  add constraint fulbito_clubs_match_schedule_valid check (
    (match_weekday is null and match_time is null and match_venue is null)
    or (
      match_weekday between 0 and 6
      and match_time is not null
      and char_length(trim(match_venue)) between 2 and 80
    )
  );

-- Preconfiguración solicitada. No pisa una configuración que el admin ya haya guardado.
update public.fulbito_clubs
   set match_weekday = 6,
       match_time = time '20:00',
       match_venue = 'Stallion Adrogué'
 where lower(trim(name)) in ('club atletico marmol', 'club atlético marmol')
   and match_weekday is null
   and match_time is null
   and match_venue is null;

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
    'match_venue', v_club.match_venue
  );
end;
$$;

create or replace function public.fulbito_update_club_match_schedule(
  p_club_id text,
  p_match_weekday smallint default null,
  p_match_time time without time zone default null,
  p_match_venue text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
  v_venue text := nullif(trim(coalesce(p_match_venue, '')), '');
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede configurar el próximo partido' using errcode = '42501';
  end if;

  if p_match_weekday is null and p_match_time is null and v_venue is null then
    update public.fulbito_clubs
       set match_weekday = null, match_time = null, match_venue = null
     where id = p_club_id
     returning * into v_club;
  else
    if p_match_weekday is null
       or p_match_weekday not between 0 and 6
       or p_match_time is null
       or v_venue is null
       or char_length(v_venue) not between 2 and 80
       or v_venue ~ '[[:cntrl:]<>]' then
      raise exception 'Completá un día, hora y sede válidos' using errcode = '22023';
    end if;
    update public.fulbito_clubs
       set match_weekday = p_match_weekday,
           match_time = p_match_time,
           match_venue = v_venue
     where id = p_club_id
     returning * into v_club;
  end if;

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
    'match_venue', v_club.match_venue
  );
end;
$$;

revoke all on function public.fulbito_update_club_match_schedule(text, smallint, time without time zone, text) from public;
grant execute on function public.fulbito_update_club_match_schedule(text, smallint, time without time zone, text) to authenticated;

commit;
