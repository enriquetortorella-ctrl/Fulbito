-- EL FULBITO · compatibilidad para el administrador maestro único
-- Ejecutar DESPUÉS de supabase-security.sql. La lógica completa de permisos,
-- partidos y asistencias vive en esa migración canónica; este archivo solo
-- asegura que instalaciones anteriores adopten el registro singleton de TITI.

begin;

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

alter table public.fulbito_platform_master enable row level security;
revoke all on table public.fulbito_platform_master from public, anon, authenticated;

-- La tabla plural pertenecía a una versión que admitía más de un maestro.
-- Puede seguir existiendo por compatibilidad, pero ya no otorga permisos.
do $$
begin
  if to_regclass('public.fulbito_platform_admins') is not null then
    execute 'revoke all on table public.fulbito_platform_admins from public, anon, authenticated';
  end if;
end;
$$;

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

revoke all on function public.fulbito_is_platform_admin() from public, anon;
grant execute on function public.fulbito_is_platform_admin() to authenticated;

commit;
