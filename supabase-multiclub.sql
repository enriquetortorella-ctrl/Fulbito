-- Fulbito · migración multiclub
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Conserva todos los datos existentes dentro de "Fulbito del Sábado".

create table if not exists fulbito_clubs (
  id text primary key,
  name text not null,
  invite_code text unique not null,
  created_by text,
  created_at timestamptz default now()
);

alter table fulbito_players add column if not exists club_id text;
alter table fulbito_matches add column if not exists club_id text;

insert into fulbito_clubs (id, name, invite_code, created_by)
values ('club-fulbito-sabado', 'Fulbito del Sábado', 'SABADO', 'legacy')
on conflict (id) do nothing;

update fulbito_players set club_id = 'club-fulbito-sabado' where club_id is null;
update fulbito_matches set club_id = 'club-fulbito-sabado' where club_id is null;

alter table fulbito_players alter column club_id set not null;
alter table fulbito_matches alter column club_id set not null;

alter table fulbito_players drop constraint if exists fulbito_players_username_key;
create unique index if not exists fulbito_players_club_username_unique
  on fulbito_players (club_id, lower(username));
create index if not exists fulbito_players_club_id_idx on fulbito_players (club_id);
create index if not exists fulbito_matches_club_id_idx on fulbito_matches (club_id);

alter table fulbito_clubs enable row level security;
drop policy if exists "public_all_clubs" on fulbito_clubs;
create policy "public_all_clubs" on fulbito_clubs for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_rel r
    join pg_publication p on p.oid = r.prpubid
    where p.pubname = 'supabase_realtime'
      and r.prrelid = 'public.fulbito_clubs'::regclass
  ) then
    alter publication supabase_realtime add table fulbito_clubs;
  end if;
end $$;
