-- Government reporting: a read-only "govt" role limited to govt@cryochain.co, and one report of farmers and their stock
-- that both ops and that account can read. The report is a function, so govt never gets table access.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('pending', 'farmer', 'buyer', 'agent', 'driver', 'ops', 'govt'));

-- Ops, or the single government account (role AND mailbox must both match).
create or replace function private.can_view_farmer_report()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.role = 'ops' or (p.role = 'govt' and lower(p.email) = 'govt@cryochain.co'))
  );
$$;

revoke all on function private.can_view_farmer_report() from public, anon;
grant execute on function private.can_view_farmer_report() to authenticated;

-- One row per farmer and listing (farmers with no listing appear once, with null listing fields).
-- Quantities are in the listing's own unit; units do not add up, so the client groups by unit.
create or replace function public.farmer_report()
returns table (
  farmer_id uuid,
  farmer_name text,
  phone text,
  locality text,
  address text,
  latitude double precision,
  longitude double precision,
  wallet_verified boolean,
  joined_at timestamptz,
  listing_id uuid,
  product text,
  unit text,
  listed numeric,
  sold numeric,
  delivered numeric,
  remaining numeric,
  listed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_farmer_report()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select f.id, p.display_name, p.phone, f.locality, f.address, f.latitude, f.longitude,
         f.wallet_verified_at is not null, f.created_at,
         l.id, l.product, l.unit, l.weight_kg, s.sold_kg, s.delivered_kg, s.remaining_kg, l.created_at
    from public.farmers f
    join public.profiles p on p.id = f.id
    left join public.produce_listings l on l.farmer_id = f.id
    left join public.listing_stock s on s.listing_id = l.id
   order by f.created_at desc, l.created_at desc
   limit 20000;
end;
$$;

revoke all on function public.farmer_report() from public, anon;
grant execute on function public.farmer_report() to authenticated;

-- If the government account already exists, give it the role. Otherwise create the user (Auth > Add user,
-- email govt@cryochain.co, a password) and run this one statement again.
update public.profiles set role = 'govt' where lower(email) = 'govt@cryochain.co' and role = 'pending';
