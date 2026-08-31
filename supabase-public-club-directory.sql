-- Directorio público de clubes: expone únicamente identidad visual.
-- Los códigos de invitación y los datos de jugadores no se devuelven.

begin;

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

revoke all on function public.fulbito_list_clubs() from public;
grant execute on function public.fulbito_list_clubs() to authenticated;

commit;
