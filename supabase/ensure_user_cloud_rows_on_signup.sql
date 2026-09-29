-- v0.0.17: guarantee cloud rows exist for every Supabase Auth user.
create or replace function public.handle_new_user_cloud_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar, created_at, last_login, role, plan, is_onboarded)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'Trader'), '@', 1), 'Trader'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    coalesce(new.created_at, now()), now(),
    coalesce(new.raw_user_meta_data->>'role', 'trader'),
    coalesce(new.raw_user_meta_data->>'plan', 'Starter OS'),
    coalesce((new.raw_user_meta_data->>'is_onboarded')::boolean, true)
  ) on conflict (id) do update set email = excluded.email, last_login = now();

  insert into public.user_settings (user_id, settings, updated_at)
  values (new.id, '{}'::jsonb, now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cloud_rows on auth.users;
create trigger on_auth_user_created_cloud_rows
after insert on auth.users
for each row execute function public.handle_new_user_cloud_rows();
