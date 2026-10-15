create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  global_role text not null default 'user',
  email text,
  full_name text,
  photo_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  slug text not null unique,
  name text not null,
  photo_url text,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'restaurant_role'
  ) then
    create type public.restaurant_role as enum ('owner', 'viewer');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'account_role'
  ) then
    create type public.account_role as enum ('owner', 'user');
  end if;
end $$;

create table if not exists public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.account_role not null default 'user',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, user_id)
);

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  account_role public.account_role not null default 'user',
  restaurant_role public.restaurant_role not null default 'viewer',
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_invitation_restaurants (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.account_invitations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (invitation_id, restaurant_id)
);

create table if not exists public.restaurant_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.restaurant_role not null default 'viewer',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, user_id)
);

update public.user_profiles
set global_role = 'user',
    updated_at = timezone('utc', now())
where global_role = 'admin';

update public.account_memberships
set role = 'user',
    updated_at = timezone('utc', now())
where role::text = 'admin';

update public.account_invitations
set account_role = 'user',
    restaurant_role = 'viewer',
    updated_at = timezone('utc', now())
where account_role::text = 'admin'
   or restaurant_role::text = 'admin';

update public.restaurant_memberships
set role = 'viewer',
    updated_at = timezone('utc', now())
where role::text = 'admin';

create table if not exists public.restaurant_workspaces (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  locale text not null default 'pt',
  state jsonb not null default '{}'::jsonb,
  upload_feedback jsonb not null default '[]'::jsonb,
  selected_period text not null default '__ALL_PERIODS__',
  selected_view text not null default '__TOTAL__',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.audit_logs
add column if not exists account_id uuid references public.accounts(id) on delete cascade;

create or replace function public.is_restaurant_member(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_memberships membership
    where membership.restaurant_id = target_restaurant_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.get_my_global_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select profile.global_role
      from public.user_profiles profile
      where profile.user_id = auth.uid()
    ),
    'user'
  );
$$;

create or replace function public.is_global_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_global_role() = 'owner';
$$;

create or replace function public.is_account_member(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_owner()
    or exists (
      select 1
      from public.account_memberships membership
      where membership.account_id = target_account_id
        and membership.user_id = auth.uid()
    );
$$;

create or replace function public.has_account_role(target_account_id uuid, allowed_roles public.account_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_owner()
    or exists (
      select 1
      from public.account_memberships membership
      where membership.account_id = target_account_id
        and membership.user_id = auth.uid()
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function public.can_access_account_invitation(target_invitation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_owner()
    or exists (
      select 1
      from public.account_invitations invitation
      join public.account_memberships membership
        on membership.account_id = invitation.account_id
      where invitation.id = target_invitation_id
        and membership.user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_account_invitation(target_invitation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_owner()
    or exists (
      select 1
      from public.account_invitations invitation
      join public.account_memberships membership
        on membership.account_id = invitation.account_id
      where invitation.id = target_invitation_id
        and membership.user_id = auth.uid()
        and membership.role = any(array['owner']::public.account_role[])
    );
$$;

create or replace function public.has_restaurant_role(target_restaurant_id uuid, allowed_roles public.restaurant_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_owner()
    or exists (
      select 1
      from public.restaurant_memberships membership
      where membership.restaurant_id = target_restaurant_id
        and membership.user_id = auth.uid()
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function public.log_account_audit(
  target_account_id uuid,
  audit_action text,
  audit_details jsonb default '{}'::jsonb,
  target_restaurant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (account_id, restaurant_id, user_id, action, details)
  values (
    target_account_id,
    target_restaurant_id,
    auth.uid(),
    audit_action,
    coalesce(audit_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.list_restaurants_for_global_owner()
returns table (
  id uuid,
  account_id uuid,
  name text,
  photo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select restaurant.id, restaurant.account_id, restaurant.name, restaurant.photo_url
  from public.restaurants restaurant
  where public.is_global_owner()
  order by restaurant.created_at asc;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

create or replace function public.bootstrap_restaurant_for_current_user(
  restaurant_name text,
  restaurant_slug text,
  restaurant_photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  existing_restaurant_id uuid;
  next_restaurant_id uuid;
  next_account_id uuid;
  next_account_slug text;
  next_restaurant_role public.restaurant_role;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select membership.restaurant_id
    into existing_restaurant_id
  from public.restaurant_memberships membership
  where membership.user_id = current_user_id
  order by membership.created_at asc
  limit 1;

  if existing_restaurant_id is not null then
    return existing_restaurant_id;
  end if;

  next_account_slug := restaurant_slug || '-conta';

  while exists (
    select 1
    from public.accounts account_row
    where account_row.slug = next_account_slug
  ) loop
    next_account_slug := restaurant_slug || '-conta-' || substr(gen_random_uuid()::text, 1, 6);
  end loop;

  insert into public.accounts (owner_user_id, name, slug)
  values (current_user_id, restaurant_name, next_account_slug)
  returning id into next_account_id;

  insert into public.account_memberships (account_id, user_id, role, invited_by)
  values (
    next_account_id,
    current_user_id,
    case when public.is_global_owner() then 'owner'::public.account_role else 'user'::public.account_role end,
    current_user_id
  );

  insert into public.restaurants (account_id, slug, name, photo_url, owner_user_id)
  values (next_account_id, restaurant_slug, restaurant_name, restaurant_photo_url, current_user_id)
  returning id into next_restaurant_id;

  next_restaurant_role := case
    when public.is_global_owner() then 'owner'::public.restaurant_role
    else 'viewer'::public.restaurant_role
  end;

  insert into public.restaurant_memberships (restaurant_id, user_id, role, invited_by)
  values (next_restaurant_id, current_user_id, next_restaurant_role, current_user_id);

  return next_restaurant_id;
end;
$$;

create or replace function public.create_restaurant_for_current_user(
  restaurant_name text,
  restaurant_slug text,
  restaurant_photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  next_restaurant_id uuid;
  target_account_id uuid;
  base_slug text;
  next_slug text;
  next_restaurant_role public.restaurant_role;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  base_slug := coalesce(nullif(restaurant_slug, ''), 'restaurante');
  next_slug := base_slug;

  while exists (
    select 1
    from public.restaurants restaurant
    where restaurant.slug = next_slug
  ) loop
    next_slug := base_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
  end loop;

  select membership.account_id
    into target_account_id
  from public.account_memberships membership
  where membership.user_id = current_user_id
  order by membership.created_at asc
  limit 1;

  if target_account_id is null then
    raise exception 'Nenhuma conta ativa foi encontrada para este usuário.';
  end if;

  if not public.has_account_role(target_account_id, array['owner']::public.account_role[]) then
    raise exception 'Apenas owner pode cadastrar restaurantes.';
  end if;

  insert into public.restaurants (account_id, slug, name, photo_url, owner_user_id)
  values (target_account_id, next_slug, restaurant_name, restaurant_photo_url, current_user_id)
  returning id into next_restaurant_id;

  next_restaurant_role := case
    when public.is_global_owner() then 'owner'::public.restaurant_role
    else 'viewer'::public.restaurant_role
  end;

  insert into public.restaurant_memberships (restaurant_id, user_id, role, invited_by)
  values (next_restaurant_id, current_user_id, next_restaurant_role, current_user_id);

  return next_restaurant_id;
end;
$$;

create or replace function public.delete_restaurant_for_current_user(target_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  membership_count integer;
  target_account_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select restaurant.account_id
    into target_account_id
  from public.restaurants restaurant
  where restaurant.id = target_restaurant_id;

  if target_account_id is null then
    raise exception 'Restaurante não encontrado.';
  end if;

  if not (
    public.is_global_owner()
    or public.has_account_role(target_account_id, array['owner']::public.account_role[])
  ) then
    raise exception 'Apenas owner pode excluir este restaurante.';
  end if;

  if not exists (
    select 1
    from public.restaurant_memberships membership
    where membership.restaurant_id = target_restaurant_id
      and membership.user_id = current_user_id
  ) then
    raise exception 'Você precisa estar vinculado a este restaurante para excluí-lo.';
  end if;

  select count(*)
    into membership_count
  from public.restaurant_memberships membership
  where membership.user_id = current_user_id;

  if membership_count <= 1 then
    raise exception 'A conta precisa manter ao menos um restaurante.';
  end if;

  delete from public.restaurants
  where id = target_restaurant_id
    and owner_user_id = current_user_id;

  if not found then
    raise exception 'Não foi possível excluir o restaurante.';
  end if;

  return target_restaurant_id;
end;
$$;

update public.account_memberships membership
set role = 'user',
    updated_at = timezone('utc', now())
from public.user_profiles profile
where profile.user_id = membership.user_id
  and coalesce(profile.global_role, 'user') <> 'owner'
  and membership.role = 'owner';

update public.restaurant_memberships membership
set role = 'viewer',
    updated_at = timezone('utc', now())
from public.user_profiles profile
where profile.user_id = membership.user_id
  and coalesce(profile.global_role, 'user') <> 'owner'
  and membership.role = 'owner';

create or replace function public.create_account_invitation_for_current_user(
  target_email text,
  target_account_role public.account_role,
  target_restaurant_role public.restaurant_role,
  target_restaurant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  invitation_account_id uuid;
  next_invitation_id uuid;
  first_invitation_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if coalesce(array_length(target_restaurant_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos um restaurante.';
  end if;

  target_account_role := 'user';
  target_restaurant_role := 'viewer';

  if target_account_role = 'owner' or target_restaurant_role = 'owner' then
    raise exception 'Esse acesso não pode ser alterado por esta tela.';
  end if;

  if not public.is_global_owner() then
    raise exception 'Apenas owner pode convidar pessoas.';
  end if;

  if exists (
    select 1
    from unnest(target_restaurant_ids) as requested_restaurant_id
    left join public.restaurants restaurant
      on restaurant.id = requested_restaurant_id
    where restaurant.id is null
  ) then
    raise exception 'Restaurante não encontrado.';
  end if;

  for invitation_account_id in
    select distinct restaurant.account_id
    from public.restaurants restaurant
    where restaurant.id = any(target_restaurant_ids)
      and restaurant.account_id is not null
  loop
    update public.account_invitations invitation
    set status = 'revoked',
        updated_at = timezone('utc', now())
    where invitation.account_id = invitation_account_id
      and lower(invitation.email) = lower(target_email)
      and invitation.status = 'pending';

    insert into public.account_invitations (
      account_id,
      email,
      account_role,
      restaurant_role,
      status,
      invited_by
    )
    values (
      invitation_account_id,
      lower(target_email),
      target_account_role,
      target_restaurant_role,
      'pending',
      current_user_id
    )
    returning id into next_invitation_id;

    first_invitation_id := coalesce(first_invitation_id, next_invitation_id);

    insert into public.account_invitation_restaurants (invitation_id, restaurant_id)
    select next_invitation_id, restaurant.id
    from public.restaurants restaurant
    where restaurant.id = any(target_restaurant_ids)
      and restaurant.account_id = invitation_account_id
    on conflict (invitation_id, restaurant_id) do nothing;

    perform public.log_account_audit(
      invitation_account_id,
      'account_invitation_created',
      jsonb_build_object(
        'invitation_id', next_invitation_id,
        'email', lower(target_email),
        'account_role', target_account_role,
        'restaurant_role', target_restaurant_role,
        'restaurant_ids', (
          select jsonb_agg(restaurant.id)
          from public.restaurants restaurant
          where restaurant.id = any(target_restaurant_ids)
            and restaurant.account_id = invitation_account_id
        )
      )
    );
  end loop;

  if first_invitation_id is null then
    raise exception 'Não foi possível identificar a conta deste convite.';
  end if;

  return first_invitation_id;
end;
$$;

create or replace function public.revoke_account_invitation_for_current_user(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_account_id uuid;
begin
  select invitation.account_id
    into target_account_id
  from public.account_invitations invitation
  where invitation.id = target_invitation_id;

  if target_account_id is null then
    raise exception 'Convite não encontrado.';
  end if;

  if not public.is_global_owner() then
    raise exception 'Apenas owner pode revogar convites.';
  end if;

  update public.account_invitations
  set status = 'revoked',
      updated_at = timezone('utc', now())
  where id = target_invitation_id;

  perform public.log_account_audit(
    target_account_id,
    'account_invitation_revoked',
    jsonb_build_object(
      'invitation_id', target_invitation_id
    )
  );

  return target_invitation_id;
end;
$$;

create or replace function public.accept_pending_account_invitations_for_current_user()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_email text;
  accepted_count integer := 0;
  invitation_row public.account_invitations%rowtype;
begin
  current_user_id := auth.uid();
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if current_email = '' then
    return 0;
  end if;

  for invitation_row in
    select *
    from public.account_invitations invitation
    where lower(invitation.email) = current_email
      and invitation.status = 'pending'
  loop
    insert into public.account_memberships (account_id, user_id, role, invited_by)
    values (invitation_row.account_id, current_user_id, invitation_row.account_role, invitation_row.invited_by)
    on conflict (account_id, user_id) do update
    set role = excluded.role,
        updated_at = timezone('utc', now());

    insert into public.restaurant_memberships (restaurant_id, user_id, role, invited_by)
    select invitation_restaurant.restaurant_id, current_user_id, invitation_row.restaurant_role, invitation_row.invited_by
    from public.account_invitation_restaurants invitation_restaurant
    where invitation_restaurant.invitation_id = invitation_row.id
    on conflict (restaurant_id, user_id) do update
    set role = excluded.role,
        updated_at = timezone('utc', now());

    update public.account_invitations
    set status = 'accepted',
        accepted_by_user_id = current_user_id,
        accepted_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = invitation_row.id;

    perform public.log_account_audit(
      invitation_row.account_id,
      'account_invitation_accepted',
      jsonb_build_object(
        'invitation_id', invitation_row.id,
        'accepted_by_user_id', current_user_id
      )
    );

    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

create or replace function public.update_account_member_for_current_user(
  target_account_id uuid,
  target_user_id uuid,
  target_account_role public.account_role,
  target_restaurant_role public.restaurant_role,
  target_restaurant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_account_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if auth.uid() = target_user_id then
    raise exception 'Use a área Minha conta para editar o próprio acesso.';
  end if;

  if not public.is_global_owner() then
    raise exception 'Apenas owner pode editar membros.';
  end if;

  target_account_role := 'user';
  target_restaurant_role := 'viewer';

  if coalesce(array_length(target_restaurant_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos um restaurante.';
  end if;

  if exists (
    select 1
    from unnest(target_restaurant_ids) as requested_restaurant_id
    left join public.restaurants restaurant
      on restaurant.id = requested_restaurant_id
    where restaurant.id is null
  ) then
    raise exception 'Restaurante não encontrado.';
  end if;

  if exists (
    select 1
    from public.account_memberships membership
    where membership.user_id = target_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'Esse acesso não pode ser alterado por esta tela.';
  end if;

  if exists (
    select 1
    from public.restaurant_memberships membership
    where membership.user_id = target_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'Esse acesso não pode ser alterado por esta tela.';
  end if;

  select array_agg(distinct restaurant.account_id)
    into selected_account_ids
  from public.restaurants restaurant
  where restaurant.id = any(target_restaurant_ids)
    and restaurant.account_id is not null;

  insert into public.account_memberships (account_id, user_id, role, invited_by)
  select account_id, target_user_id, target_account_role, auth.uid()
  from unnest(selected_account_ids) as account_id
  on conflict (account_id, user_id) do update
  set role = excluded.role,
      updated_at = timezone('utc', now());

  delete from public.restaurant_memberships membership
  where membership.user_id = target_user_id
    and membership.role <> 'owner'
    and membership.restaurant_id <> all(target_restaurant_ids);

  delete from public.account_memberships membership
  where membership.user_id = target_user_id
    and membership.role <> 'owner'
    and membership.account_id <> all(selected_account_ids);

  insert into public.restaurant_memberships (restaurant_id, user_id, role, invited_by)
  select distinct restaurant_id, target_user_id, target_restaurant_role, auth.uid()
  from unnest(target_restaurant_ids) as restaurant_id
  on conflict (restaurant_id, user_id) do update
  set role = excluded.role,
      updated_at = timezone('utc', now());

  delete from public.account_memberships membership
  where membership.user_id = target_user_id
    and membership.role <> 'owner'
    and not exists (
      select 1
      from public.restaurant_memberships restaurant_membership
      join public.restaurants restaurant
        on restaurant.id = restaurant_membership.restaurant_id
      where restaurant_membership.user_id = membership.user_id
        and restaurant.account_id = membership.account_id
    );

  perform public.log_account_audit(
    coalesce(target_account_id, selected_account_ids[1]),
    'account_member_updated',
    jsonb_build_object(
      'target_user_id', target_user_id,
      'account_role', target_account_role,
      'restaurant_role', target_restaurant_role,
      'restaurant_ids', target_restaurant_ids,
      'account_ids', selected_account_ids
    )
  );

  return target_user_id;
end;
$$;

create or replace function public.remove_account_member_for_current_user(
  target_account_id uuid,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if auth.uid() = target_user_id then
    raise exception 'Use a área Minha conta para encerrar o próprio acesso.';
  end if;

  if not public.is_global_owner() then
    raise exception 'Apenas owner pode remover membros.';
  end if;

  insert into public.account_memberships (account_id, user_id, role, invited_by)
  values (target_account_id, target_user_id, 'user', auth.uid())
  on conflict (account_id, user_id) do nothing;

  if not exists (
    select 1
    from public.account_memberships membership
    where membership.account_id = target_account_id
    and membership.user_id = target_user_id
  ) then
    raise exception 'Membro não encontrado nesta conta.';
  end if;

  if exists (
    select 1
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.user_id = target_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'Esse acesso não pode ser removido por esta tela.';
  end if;

  if exists (
    select 1
    from public.restaurant_memberships membership
    join public.restaurants restaurant
      on restaurant.id = membership.restaurant_id
    where membership.user_id = target_user_id
      and membership.role = 'owner'
      and restaurant.account_id = target_account_id
  ) then
    raise exception 'Esse acesso não pode ser removido por esta tela.';
  end if;

  delete from public.restaurant_memberships membership
  using public.restaurants restaurant
  where membership.restaurant_id = restaurant.id
    and membership.user_id = target_user_id
    and restaurant.account_id = target_account_id;

  delete from public.account_memberships
  where account_id = target_account_id
    and user_id = target_user_id;

  perform public.log_account_audit(
    target_account_id,
    'account_member_removed',
    jsonb_build_object(
      'target_user_id', target_user_id
    )
  );

  return target_user_id;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_memberships enable row level security;
alter table public.account_invitations enable row level security;
alter table public.account_invitation_restaurants enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_memberships enable row level security;
alter table public.restaurant_workspaces enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
using (
  auth.uid() = user_id
  or public.is_global_owner()
  or exists (
    select 1
    from public.account_memberships membership_self
    join public.account_memberships membership_target
      on membership_target.account_id = membership_self.account_id
    where membership_self.user_id = auth.uid()
      and membership_target.user_id = user_profiles.user_id
  )
);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
using (auth.uid() = user_id or public.is_global_owner())
with check (auth.uid() = user_id or public.is_global_owner());

drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member"
on public.accounts
for select
using (public.is_account_member(id));

drop policy if exists "accounts_insert_admin" on public.accounts;
create policy "accounts_insert_admin"
on public.accounts
for insert
with check (auth.uid() = owner_user_id or public.is_global_owner());

drop policy if exists "accounts_update_admin" on public.accounts;
create policy "accounts_update_admin"
on public.accounts
for update
using (public.has_account_role(id, array['owner']::public.account_role[]))
with check (public.has_account_role(id, array['owner']::public.account_role[]));

drop policy if exists "account_memberships_select_member" on public.account_memberships;
create policy "account_memberships_select_member"
on public.account_memberships
for select
using (public.is_account_member(account_id));

drop policy if exists "account_memberships_insert_admin" on public.account_memberships;
create policy "account_memberships_insert_admin"
on public.account_memberships
for insert
with check (public.has_account_role(account_id, array['owner']::public.account_role[]));

drop policy if exists "account_memberships_update_admin" on public.account_memberships;
create policy "account_memberships_update_admin"
on public.account_memberships
for update
using (public.has_account_role(account_id, array['owner']::public.account_role[]))
with check (public.has_account_role(account_id, array['owner']::public.account_role[]));

drop policy if exists "account_invitations_select_member" on public.account_invitations;
create policy "account_invitations_select_member"
on public.account_invitations
for select
using (public.is_account_member(account_id));

drop policy if exists "account_invitations_insert_admin" on public.account_invitations;
create policy "account_invitations_insert_admin"
on public.account_invitations
for insert
with check (public.has_account_role(account_id, array['owner']::public.account_role[]));

drop policy if exists "account_invitations_update_admin" on public.account_invitations;
create policy "account_invitations_update_admin"
on public.account_invitations
for update
using (public.has_account_role(account_id, array['owner']::public.account_role[]))
with check (public.has_account_role(account_id, array['owner']::public.account_role[]));

drop policy if exists "account_invitation_restaurants_select_member" on public.account_invitation_restaurants;
create policy "account_invitation_restaurants_select_member"
on public.account_invitation_restaurants
for select
using (public.can_access_account_invitation(invitation_id));

drop policy if exists "account_invitation_restaurants_insert_admin" on public.account_invitation_restaurants;
create policy "account_invitation_restaurants_insert_admin"
on public.account_invitation_restaurants
for insert
with check (public.can_manage_account_invitation(invitation_id));

drop policy if exists "account_invitation_restaurants_update_admin" on public.account_invitation_restaurants;
create policy "account_invitation_restaurants_update_admin"
on public.account_invitation_restaurants
for update
using (public.can_manage_account_invitation(invitation_id))
with check (public.can_manage_account_invitation(invitation_id));

drop policy if exists "restaurants_select_member" on public.restaurants;
create policy "restaurants_select_member"
on public.restaurants
for select
using (public.is_restaurant_member(id) or public.is_account_member(account_id));

drop policy if exists "restaurants_insert_owner" on public.restaurants;
create policy "restaurants_insert_owner"
on public.restaurants
for insert
with check (auth.uid() = owner_user_id);

drop policy if exists "restaurants_update_admin" on public.restaurants;
create policy "restaurants_update_admin"
on public.restaurants
for update
using (
  public.has_restaurant_role(id, array['owner']::public.restaurant_role[])
  or public.has_account_role(account_id, array['owner']::public.account_role[])
)
with check (
  public.has_restaurant_role(id, array['owner']::public.restaurant_role[])
  or public.has_account_role(account_id, array['owner']::public.account_role[])
);

drop policy if exists "restaurant_memberships_select_member" on public.restaurant_memberships;
create policy "restaurant_memberships_select_member"
on public.restaurant_memberships
for select
using (public.is_global_owner() or public.is_restaurant_member(restaurant_id));

drop policy if exists "restaurant_memberships_insert_admin" on public.restaurant_memberships;
create policy "restaurant_memberships_insert_admin"
on public.restaurant_memberships
for insert
with check (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]));

drop policy if exists "restaurant_memberships_update_owner" on public.restaurant_memberships;
create policy "restaurant_memberships_update_owner"
on public.restaurant_memberships
for update
using (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]))
with check (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]));

drop policy if exists "restaurant_workspaces_select_member" on public.restaurant_workspaces;
create policy "restaurant_workspaces_select_member"
on public.restaurant_workspaces
for select
using (public.is_global_owner() or public.is_restaurant_member(restaurant_id));

drop policy if exists "restaurant_workspaces_insert_admin" on public.restaurant_workspaces;
create policy "restaurant_workspaces_insert_admin"
on public.restaurant_workspaces
for insert
with check (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]));

drop policy if exists "restaurant_workspaces_update_admin" on public.restaurant_workspaces;
create policy "restaurant_workspaces_update_admin"
on public.restaurant_workspaces
for update
using (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]))
with check (public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[]));

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs
for select
using (
  public.is_global_owner()
  or (
    account_id is not null
    and public.has_account_role(account_id, array['owner']::public.account_role[])
  )
  or (
    restaurant_id is not null
    and public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[])
  )
);

drop policy if exists "audit_logs_insert_admin" on public.audit_logs;
create policy "audit_logs_insert_admin"
on public.audit_logs
for insert
with check (
  public.is_global_owner()
  or (
    account_id is not null
    and public.has_account_role(account_id, array['owner']::public.account_role[])
  )
  or (
    restaurant_id is not null
    and public.has_restaurant_role(restaurant_id, array['owner']::public.restaurant_role[])
  )
);

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.bootstrap_restaurant_for_current_user(text, text, text) from public;
grant execute on function public.bootstrap_restaurant_for_current_user(text, text, text) to authenticated;
revoke all on function public.list_restaurants_for_global_owner() from public;
grant execute on function public.list_restaurants_for_global_owner() to authenticated;
revoke all on function public.create_restaurant_for_current_user(text, text, text) from public;
grant execute on function public.create_restaurant_for_current_user(text, text, text) to authenticated;
revoke all on function public.delete_restaurant_for_current_user(uuid) from public;
grant execute on function public.delete_restaurant_for_current_user(uuid) to authenticated;
revoke all on function public.create_account_invitation_for_current_user(text, public.account_role, public.restaurant_role, uuid[]) from public;
grant execute on function public.create_account_invitation_for_current_user(text, public.account_role, public.restaurant_role, uuid[]) to authenticated;
revoke all on function public.revoke_account_invitation_for_current_user(uuid) from public;
grant execute on function public.revoke_account_invitation_for_current_user(uuid) to authenticated;
revoke all on function public.accept_pending_account_invitations_for_current_user() from public;
grant execute on function public.accept_pending_account_invitations_for_current_user() to authenticated;
revoke all on function public.update_account_member_for_current_user(uuid, uuid, public.account_role, public.restaurant_role, uuid[]) from public;
grant execute on function public.update_account_member_for_current_user(uuid, uuid, public.account_role, public.restaurant_role, uuid[]) to authenticated;
revoke all on function public.remove_account_member_for_current_user(uuid, uuid) from public;
grant execute on function public.remove_account_member_for_current_user(uuid, uuid) to authenticated;

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
