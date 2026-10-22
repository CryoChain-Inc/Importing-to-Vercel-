-- Buyers can keep several delivery addresses and mark one as the default.
-- buyers.delivery_location stays as a mirror of the default address so route plans and ops screens keep working.

create table public.buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  label text not null,
  address text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint buyer_addresses_label_len check (char_length(label) between 2 and 30),
  constraint buyer_addresses_address_len check (char_length(address) between 2 and 80)
);

create index buyer_addresses_buyer_idx on public.buyer_addresses (buyer_id);
create unique index buyer_addresses_one_default on public.buyer_addresses (buyer_id) where is_default;

alter table public.buyer_addresses enable row level security;

create policy buyer_addresses_select_own on public.buyer_addresses
  for select to authenticated using ((select auth.uid()) = buyer_id);

-- Read-only for clients; writes go through the functions below.
revoke all on table public.buyer_addresses from anon, authenticated;
grant select on table public.buyer_addresses to authenticated;

create or replace function private.sync_buyer_location(p_buyer uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.buyers b
     set delivery_location = coalesce(
       (select a.address from public.buyer_addresses a where a.buyer_id = b.id and a.is_default), '')
   where b.id = p_buyer;
$$;
revoke all on function private.sync_buyer_location(uuid) from public, anon, authenticated;

create function public.save_buyer_address(p_id uuid, p_label text, p_address text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.buyers where id = uid) then
    raise exception 'not a buyer';
  end if;
  if p_id is null then
    if (select count(*) from public.buyer_addresses where buyer_id = uid) >= 5 then
      raise exception 'address limit reached';
    end if;
    insert into public.buyer_addresses (buyer_id, label, address, is_default)
    values (uid, btrim(p_label), btrim(p_address),
            not exists (select 1 from public.buyer_addresses where buyer_id = uid));
  else
    update public.buyer_addresses set label = btrim(p_label), address = btrim(p_address)
     where id = p_id and buyer_id = uid;
    if not found then
      raise exception 'address not found';
    end if;
  end if;
  perform private.sync_buyer_location(uid);
end;
$$;

create function public.set_default_buyer_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  update public.buyer_addresses set is_default = false where buyer_id = uid and is_default;
  update public.buyer_addresses set is_default = true where id = p_id and buyer_id = uid;
  if not found then
    raise exception 'address not found';
  end if;
  perform private.sync_buyer_location(uid);
end;
$$;

create function public.delete_buyer_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  was_default boolean;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.buyer_addresses where id = p_id and buyer_id = uid returning is_default into was_default;
  if not found then
    raise exception 'address not found';
  end if;
  if was_default then
    update public.buyer_addresses set is_default = true
     where id = (select id from public.buyer_addresses where buyer_id = uid order by created_at limit 1);
  end if;
  perform private.sync_buyer_location(uid);
end;
$$;

-- The location now comes from the address book, so the details form only covers organization and name.
drop function public.update_buyer_details(text, text, text);

create function public.update_buyer_details(p_organization text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  name text := btrim(p_name);
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if char_length(name) not between 2 and 80 then
    raise exception 'name must be 2 to 80 characters';
  end if;
  update public.buyers set organization_name = btrim(p_organization) where id = uid;
  if not found then
    raise exception 'not a buyer';
  end if;
  update public.profiles set display_name = name where id = uid;
end;
$$;

revoke all on function public.save_buyer_address(uuid, text, text), public.set_default_buyer_address(uuid),
  public.delete_buyer_address(uuid), public.update_buyer_details(text, text) from public, anon;
grant execute on function public.save_buyer_address(uuid, text, text), public.set_default_buyer_address(uuid),
  public.delete_buyer_address(uuid), public.update_buyer_details(text, text) to authenticated;

-- Existing buyers keep their saved location as the first (default) address.
insert into public.buyer_addresses (buyer_id, label, address, is_default)
select id, 'Main', delivery_location, true from public.buyers where char_length(delivery_location) >= 2;
