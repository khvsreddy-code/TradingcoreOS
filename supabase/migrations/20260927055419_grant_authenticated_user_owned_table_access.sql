-- PostgREST exposes public tables only when the API role has table privileges.
-- RLS policies remain the row-level authority; these grants only make the
-- browser-facing user-owned tables reachable by authenticated clients.
grant select, insert, update on table public.user_settings to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.workspace_layouts to authenticated;
grant select, insert, update, delete on table public.workspace_layout_library to authenticated;

notify pgrst, 'reload schema';
