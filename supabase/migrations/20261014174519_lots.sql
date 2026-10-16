-- Lots: ops aggregates unallocated farmer listings (consignments) of ONE product into a lot of at most one
-- vehicle load (3,000 kg), per docs/Workflow-short.md §3.2. A lot cannot exist without listings (I1), and a
-- listing belongs to at most one lot. The 2,700 kg minimum and GHS 6,200 stop-value rule are advisory in the UI.

create sequence if not exists public.lot_code_seq;

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'LOT-' || lpad(nextval('public.lot_code_seq')::text, 5, '0'),
  product text not null,
  total_kg numeric(10, 2) not null check (total_kg > 0 and total_kg <= 3000),
  state text not null default 'listed'
    check (state in ('listed', 'escrow_pending', 'escrow_funded', 'collecting', 'in_transit', 'delivered', 'accepted', 'disputed', 'cancelled')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index lots_state_created_idx on public.lots (state, created_at desc);

alter table public.produce_listings
  add column lot_id uuid references public.lots (id) on delete restrict;
create index produce_listings_lot_idx on public.produce_listings (lot_id);
-- Unallocated supply is what ops picks from.
create index produce_listings_unallocated_idx on public.produce_listings (product, created_at) where lot_id is null;

alter table public.lots enable row level security;
revoke all on table public.lots from anon, authenticated;
grant select on public.lots to authenticated;
create policy lots_select_ops on public.lots for select to authenticated using ((select private.is_ops()));
-- Writes only through create_lot() / cancel_lot().

-- A listing already in a lot can no longer be removed by the farmer.
drop policy if exists produce_listings_delete_own on public.produce_listings;
create policy produce_listings_delete_own on public.produce_listings
  for delete to authenticated using (farmer_id = (select auth.uid()) and lot_id is null);

create or replace function public.create_lot(p_listing_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
  products int;
  kg numeric;
  prod text;
  new_id uuid;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;

  -- Lock the rows so two ops users can't claim the same listing.
  select count(*), count(distinct product), coalesce(sum(weight_kg), 0), min(product)
    into n, products, kg, prod
    from (
      select product, weight_kg from public.produce_listings
      where id = any (p_listing_ids) and lot_id is null
      for update
    ) l;

  if coalesce(cardinality(p_listing_ids), 0) = 0 or n <> cardinality(p_listing_ids) then
    raise exception 'some listings are missing or already in a lot';
  end if;
  if products <> 1 then
    raise exception 'a lot holds one product';
  end if;
  if kg > 3000 then
    raise exception 'a lot cannot exceed 3,000 kg';
  end if;

  insert into public.lots (product, total_kg, created_by) values (prod, kg, uid) returning id into new_id;
  update public.produce_listings set lot_id = new_id where id = any (p_listing_ids);
  return new_id;
end;
$$;

-- Only a lot nobody has committed to can be cancelled; its listings return to the pool.
create or replace function public.cancel_lot(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  update public.lots set state = 'cancelled' where id = p_lot_id and state = 'listed';
  if not found then
    raise exception 'lot cannot be cancelled';
  end if;
  update public.produce_listings set lot_id = null where lot_id = p_lot_id;
end;
$$;

revoke all on function public.create_lot(uuid[]), public.cancel_lot(uuid) from public, anon;
grant execute on function public.create_lot(uuid[]), public.cancel_lot(uuid) to authenticated;
