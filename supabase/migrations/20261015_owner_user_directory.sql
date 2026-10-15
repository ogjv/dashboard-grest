create or replace function public.list_users_for_global_owner()
returns table (
  user_id uuid,
  email text,
  full_name text,
  photo_url text,
  global_role text,
  email_confirmed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_global_owner() then
    raise exception 'Apenas owner pode consultar os usuários.' using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.email::text,
    coalesce(profile.full_name, account.raw_user_meta_data ->> 'full_name', account.raw_user_meta_data ->> 'name'),
    profile.photo_url,
    coalesce(profile.global_role, 'user'),
    account.email_confirmed_at,
    account.created_at
  from auth.users account
  left join public.user_profiles profile on profile.user_id = account.id
  where account.email is not null
  order by account.created_at desc, account.id;
end;
$$;

revoke all on function public.list_users_for_global_owner() from public, anon;
grant execute on function public.list_users_for_global_owner() to authenticated;

