-- app-sync: the app reloads a screen when one of these tables changes. Realtime only delivers a change to users
-- whose RLS select policy lets them read the row, so this publishes nothing a user could not already query.
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'payments', 'order_allocations', 'delivery_stops', 'ops_decisions',
                           'produce_listings', 'notifications', 'truck_bookings']
  loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
