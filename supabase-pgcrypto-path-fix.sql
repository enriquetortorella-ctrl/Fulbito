-- Fulbito · corrección de pgcrypto en funciones protegidas
-- Supabase instala pgcrypto en el esquema `extensions`. Las funciones usan un
-- search_path fijo por seguridad, por eso deben incluir explícitamente ese
-- esquema confiable para crypt(), gen_salt() y gen_random_bytes().

begin;

alter function public.fulbito_create_club(text)
  set search_path = public, extensions, pg_temp;
alter function public.fulbito_register_player(text, text, text, text, text, text, text)
  set search_path = public, extensions, pg_temp;
alter function public.fulbito_login_player(text, text, text)
  set search_path = public, extensions, pg_temp;
alter function public.fulbito_update_my_profile(text, text, text, text, text, text, text, text)
  set search_path = public, extensions, pg_temp;
alter function public.fulbito_admin_reset_player(text, text)
  set search_path = public, extensions, pg_temp;

commit;
