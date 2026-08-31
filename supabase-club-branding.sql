-- Fulbito · identidad visual por club
-- Ejecutar una vez DESPUÉS de supabase-security.sql y supabase-platform-admin.sql.
-- No abre tablas al navegador: solamente agrega dos RPC protegidas.

begin;

alter table public.fulbito_clubs
  add column if not exists crest text;

create or replace function public.fulbito_valid_club_crest(p_crest text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_crest is null or (
    char_length(p_crest) <= 250000
    and p_crest ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$'
  );
$$;

-- Un integrante puede leer la identidad de SU club; no se exponen clubes ajenos.
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
  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'crest', v_club.crest);
end;
$$;

-- Sólo admins del club (o la cuenta maestra) pueden modificar su identidad.
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
  update public.fulbito_clubs
     set name = v_name,
         crest = nullif(p_crest, '')
   where id = p_club_id
   returning * into v_club;
  if not found then
    raise exception 'Club no encontrado' using errcode = '22023';
  end if;
  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'crest', v_club.crest);
end;
$$;

-- El ingreso por código puede mostrar la nueva identidad antes del login.
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
  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'crest', v_club.crest);
end;
$$;

revoke all on function public.fulbito_valid_club_crest(text) from public;
revoke all on function public.fulbito_get_club_brand(text) from public;
revoke all on function public.fulbito_update_club_brand(text, text, text) from public;
grant execute on function public.fulbito_get_club_brand(text) to authenticated;
grant execute on function public.fulbito_update_club_brand(text, text, text) to authenticated;

commit;
