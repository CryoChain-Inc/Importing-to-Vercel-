-- Farmer payouts. Ops picks payable settlements into a payout run, runs preflight checks (wallet name lookup +
-- Paystack balance), a second ops user approves when the run total exceeds ops_config.payout_threshold_ghs,
-- then the payout-run edge function releases one Paystack transfer per settlement to the farmer's MoMo wallet.
-- Each transfer is tracked on its own; a settlement becomes 'paid' only when Paystack confirms its transfer.

create table public.payout_runs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  -- review: being checked / awaiting approval. released: transfers submitted. partial: some failed. completed: all paid.
  status text not null default 'review' check (status in ('review', 'released', 'partial', 'completed', 'cancelled')),
  total numeric(12, 2) not null check (total > 0),
  needs_approval boolean not null,
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  preflight jsonb,
  preflight_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint payout_runs_second_person check (approved_by is null or approved_by <> created_by)
);

create table public.payout_transfers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payout_runs (id) on delete cascade,
  settlement_id uuid not null references public.settlements (listing_id),
  farmer_id uuid not null references public.profiles (id),
  amount numeric(12, 2) not null check (amount > 0),
  -- wallet as it was when the run was created
  network text not null,
  momo_number text not null,
  momo_name text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'succeeded', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  reference text,
  provider_ref text,
  last_error text,
  wallet_check text check (wallet_check in ('verified', 'unverified')),
  wallet_registered_name text,
  updated_at timestamptz not null default now()
);
-- A settlement has at most one live transfer, so it can never be paid twice. Failed ones are retried in place.
create unique index payout_transfers_one_live on public.payout_transfers (settlement_id) where status <> 'cancelled';
create index payout_transfers_run_idx on public.payout_transfers (run_id);
create index payout_transfers_reference_idx on public.payout_transfers (reference) where reference is not null;
create index payout_transfers_farmer_idx on public.payout_transfers (farmer_id);

alter table public.payout_runs enable row level security;
alter table public.payout_transfers enable row level security;
revoke all on table public.payout_runs, public.payout_transfers from anon, authenticated;
grant select on public.payout_runs, public.payout_transfers to authenticated;
create policy payout_runs_select_ops on public.payout_runs for select to authenticated using ((select private.is_ops()));
create policy payout_transfers_select_ops on public.payout_transfers for select to authenticated using ((select private.is_ops()));
-- Written only by the functions below and the payout-run edge function (service role).

comment on table public.payout_runs is 'A batch of farmer payouts. Over-threshold runs need a second ops user (not the creator) to approve.';
comment on table public.payout_transfers is 'One Paystack MoMo transfer for one settlement.';

-- ── Create a run from payable settlements ───────────────────────────────────
create or replace function public.create_payout_run(p_settlements uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rid uuid;
  wanted int := (select count(distinct x) from unnest(coalesce(p_settlements, '{}')) x);
  found_n int;
  tot numeric;
  thr numeric;
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  if wanted = 0 then raise exception 'choose settlements to pay'; end if;

  select count(*), sum(s.net) into found_n, tot
    from public.settlements s
    join public.farmers f on f.id = s.farmer_id
   where s.listing_id = any (p_settlements) and s.status = 'payable' and f.momo_number is not null
     and not exists (select 1 from public.payout_transfers t where t.settlement_id = s.listing_id and t.status <> 'cancelled');
  if found_n <> wanted then raise exception 'some settlements are not payable, have no wallet, or are already in a run'; end if;

  select payout_threshold_ghs into thr from public.ops_config;
  insert into public.payout_runs (total, needs_approval, created_by)
  values (tot, thr is not null and tot > thr, uid)
  returning id into rid;

  insert into public.payout_transfers (run_id, settlement_id, farmer_id, amount, network, momo_number, momo_name)
  select rid, s.listing_id, s.farmer_id, s.net, f.momo_network, f.momo_number, f.momo_name
    from public.settlements s join public.farmers f on f.id = s.farmer_id
   where s.listing_id = any (p_settlements);
  return rid;
end;
$$;

-- ── Second ops user signs off an over-threshold run ─────────────────────────
create or replace function public.approve_payout_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  update public.payout_runs set approved_by = uid, approved_at = now()
   where id = p_run and status = 'review' and needs_approval and approved_by is null and created_by <> uid;
  if not found then raise exception 'this run needs approval from a different ops user'; end if;
end;
$$;

-- Only a run that has not been released can be cancelled.
create or replace function public.cancel_payout_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  update public.payout_runs set status = 'cancelled' where id = p_run and status = 'review';
  if not found then raise exception 'only a run under review can be cancelled'; end if;
  update public.payout_transfers set status = 'cancelled', updated_at = now() where run_id = p_run;
end;
$$;

-- ── Record a Paystack result (edge function / webhook, idempotent) ──────────
-- p_status: sent | succeeded | failed. Settlement turns paid on success and back to payable if Paystack later reverses.
create or replace function public.apply_transfer_result(p_transfer uuid, p_status text, p_provider_ref text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.payout_transfers;
  r public.payout_runs;
  live int;
  paid int;
  bad int;
begin
  if p_status not in ('sent', 'succeeded', 'failed') then raise exception 'bad status'; end if;
  select * into t from public.payout_transfers where id = p_transfer for update;
  if not found or t.status = 'cancelled' or t.status = p_status then return; end if;
  if t.status = 'succeeded' and p_status = 'sent' then return; end if;

  update public.payout_transfers set
    status = p_status,
    attempts = attempts + (case when t.status in ('queued', 'failed') then 1 else 0 end),
    provider_ref = coalesce(p_provider_ref, provider_ref),
    last_error = case when p_status = 'succeeded' then null else coalesce(p_error, last_error) end,
    updated_at = now()
   where id = p_transfer;

  if p_status = 'succeeded' then
    update public.settlements set status = 'paid', paid_at = now(), updated_at = now() where listing_id = t.settlement_id;
    insert into public.notifications (user_id, title, body)
    values (t.farmer_id, 'Payment sent', format('GHS %s was sent to your %s wallet.', to_char(t.amount, 'FM999999990.00'), t.network));
  elsif t.status = 'succeeded' then
    update public.settlements set status = 'payable', paid_at = null, updated_at = now() where listing_id = t.settlement_id;
  end if;

  select * into r from public.payout_runs where id = t.run_id;
  if r.status in ('released', 'partial', 'completed') then
    select count(*) filter (where status in ('queued', 'sent')), count(*) filter (where status = 'succeeded'), count(*) filter (where status = 'failed')
      into live, paid, bad
      from public.payout_transfers where run_id = r.id;
    update public.payout_runs set status = case when live > 0 then 'released' when bad > 0 then 'partial' else 'completed' end
     where id = r.id;
  end if;
end;
$$;

revoke all on function public.create_payout_run(uuid[]), public.approve_payout_run(uuid), public.cancel_payout_run(uuid) from public, anon;
grant execute on function public.create_payout_run(uuid[]), public.approve_payout_run(uuid), public.cancel_payout_run(uuid) to authenticated;
revoke all on function public.apply_transfer_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_transfer_result(uuid, text, text, text) to service_role;
