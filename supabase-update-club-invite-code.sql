-- Permite que un administrador reemplace el código de invitación de su club.

begin;

create or replace function public.fulbito_update_club_invite_code(
  p_club_id text,
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(trim(p_invite_code));
  v_club public.fulbito_clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if not public.fulbito_is_admin(p_club_id) then
    raise exception 'Solo un administrador puede cambiar el código' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{3,15}$' then
    raise exception 'El código debe tener de 4 a 16 letras, números o guiones' using errcode = '22023';
  end if;
  update public.fulbito_clubs
     set invite_code = v_code
   where id = p_club_id
   returning * into v_club;
  if not found then
    raise exception 'Club no encontrado' using errcode = '22023';
  end if;
  return jsonb_build_object('id', v_club.id, 'name', v_club.name, 'crest', v_club.crest, 'invite_code', v_club.invite_code);
exception when unique_violation then
  raise exception 'Ese código ya está en uso por otro club' using errcode = '23505';
end;
$$;

revoke all on function public.fulbito_update_club_invite_code(text, text) from public;
grant execute on function public.fulbito_update_club_invite_code(text, text) to authenticated;

commit;
