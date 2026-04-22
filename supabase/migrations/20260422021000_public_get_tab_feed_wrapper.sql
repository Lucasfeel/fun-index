create or replace function public.get_tab_feed(p_tab_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, app_public, ops
as $$
  select app_public.get_tab_feed(p_tab_code);
$$;

revoke all on function public.get_tab_feed(text) from public;
grant execute on function public.get_tab_feed(text) to anon, authenticated, service_role;
