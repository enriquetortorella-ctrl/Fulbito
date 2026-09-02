-- El Fulbito · Crest Studio editable por club
-- Ejecutar después de supabase-club-match-address.sql.

begin;

alter table public.fulbito_clubs
  add column if not exists crest_design jsonb;

alter table public.fulbito_clubs
  drop constraint if exists fulbito_clubs_crest_design_valid;

create or replace function public.fulbito_valid_crest_design(p_design jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_design is null or coalesce((
    jsonb_typeof(p_design) = 'object'
    and octet_length(p_design::text) <= 4000
    and coalesce(p_design->>'shape', '') in ('heritage','english','spanish','italian','royal','roundel','diamond','hexagon','pennant','fortress')
    and coalesce(p_design->>'pattern', '') in ('solid','center','stripes','pinstripes','split','quarters','diagonal','sash','chevron','hoops','horizon','rays')
    and coalesce(p_design->>'border', '') in ('clean','double','champion','silver','neon')
    and coalesce(p_design->>'finish', '') in ('flat','metal','carbon')
    and coalesce(p_design->>'emblem', '') in ('monogram','ball','star','crown','bolt','wings','flame','trophy','tower','anchor','diamond','laurel')
    and coalesce(p_design->>'primary', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(p_design->>'secondary', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(p_design->>'accent', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(p_design->>'initials', '') ~ '^[A-Z0-9]{1,3}$'
    and coalesce(p_design->>'year', '') ~ '^(|[0-9]{4})$'
    and coalesce(p_design->>'stars', '') ~ '^[0-3]$'
    and coalesce(p_design->>'emblemScale', '') ~ '^(7[2-9]|[89][0-9]|1[01][0-9]|12[0-8])$'
    and coalesce(p_design->>'emblemY', '') ~ '^(-([1-2]?[0-9]|3[0-8])|[0-9]|[12][0-9]|3[0-8])$'
    and jsonb_typeof(p_design->'plate') = 'boolean'
  ), false);
$$;

alter table public.fulbito_clubs
  add constraint fulbito_clubs_crest_design_valid
  check (public.fulbito_valid_crest_design(crest_design));

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
    'crest_design', v_club.crest_design,
    'invite_code', case when public.fulbito_is_admin(p_club_id) then v_club.invite_code else null end,
    'match_weekday', v_club.match_weekday,
    'match_time', to_char(v_club.match_time, 'HH24:MI'),
    'match_venue', v_club.match_venue,
    'match_address', v_club.match_address
  );
end;
$$;

create or replace function public.fulbito_update_club_brand(
  p_club_id text,
  p_name text,
  p_crest text,
  p_crest_design jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.fulbito_clubs%rowtype;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede modificar la identidad del club' using errcode = '42501';
  end if;
  if char_length(v_name) not between 3 and 50 or v_name ~ '[[:cntrl:]<>]' then
    raise exception 'El nombre del club debe tener entre 3 y 50 caracteres válidos' using errcode = '22023';
  end if;
  if not public.fulbito_valid_club_crest(nullif(p_crest, '')) then
    raise exception 'El escudo debe ser una imagen PNG, JPG o WEBP de hasta 250 KB' using errcode = '22023';
  end if;
  if not public.fulbito_valid_crest_design(p_crest_design) then
    raise exception 'El diseño editable del escudo no es válido' using errcode = '22023';
  end if;
  update public.fulbito_clubs
     set name = v_name,
         crest = nullif(p_crest, ''),
         crest_design = p_crest_design
   where id = p_club_id
   returning * into v_club;
  if not found then
    raise exception 'Club no encontrado' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'id', v_club.id, 'name', v_club.name, 'crest', v_club.crest, 'crest_design', v_club.crest_design,
    'invite_code', v_club.invite_code,
    'match_weekday', v_club.match_weekday, 'match_time', to_char(v_club.match_time, 'HH24:MI'),
    'match_venue', v_club.match_venue, 'match_address', v_club.match_address
  );
end;
$$;

-- Compatibilidad con versiones anteriores de la app. Conserva el diseño sólo
-- cuando el raster no cambia; una imagen nueva no debe quedar asociada a capas
-- editables antiguas.
create or replace function public.fulbito_update_club_brand(
  p_club_id text,
  p_name text,
  p_crest text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_design jsonb;
  v_current_crest text;
begin
  select crest_design, crest into v_design, v_current_crest
  from public.fulbito_clubs
  where id = p_club_id
  for update;
  if p_crest is distinct from v_current_crest then
    v_design := null;
  end if;
  return public.fulbito_update_club_brand(p_club_id, p_name, p_crest, v_design);
end;
$$;

revoke all on function public.fulbito_valid_crest_design(jsonb) from public;
revoke all on function public.fulbito_update_club_brand(text, text, text, jsonb) from public;
revoke all on function public.fulbito_update_club_brand(text, text, text) from public;
grant execute on function public.fulbito_update_club_brand(text, text, text, jsonb) to authenticated;
grant execute on function public.fulbito_update_club_brand(text, text, text) to authenticated;

commit;
