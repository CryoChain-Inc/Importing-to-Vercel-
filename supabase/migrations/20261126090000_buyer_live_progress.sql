-- buyer-live-progress: buyers cannot read delivery_stops (they carry farm locations), so Realtime never told the buyer app
-- that a pickup was collected, a top-up pickup from another farm was added, or the order was delivered: it waited for
-- the 60 s poll. Any change to an order's stops now stamps the order row, which the buyer can read, so the app reloads at once.
alter table public.orders add column stops_changed_at timestamptz;
comment on column public.orders.stops_changed_at is 'Last change to this order''s delivery stops; exists so Realtime reaches the buyer.';

create function private.touch_order_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.delivery_stops := coalesce(new, old);
begin
  if tg_op = 'UPDATE' and old.state is not distinct from new.state and old.driver_id is not distinct from new.driver_id
     and old.label is not distinct from new.label then
    return null;
  end if;
  -- Once per transaction per order: plan_routes touches many stops of one order together.
  update public.orders set stops_changed_at = now() where id = r.order_id and stops_changed_at is distinct from now();
  return null;
end;
$$;
revoke all on function private.touch_order_stops() from public, anon, authenticated;

create trigger delivery_stops_touch_order
  after insert or delete or update of state, driver_id, label on public.delivery_stops
  for each row execute function private.touch_order_stops();
