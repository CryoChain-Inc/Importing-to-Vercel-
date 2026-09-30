-- Staff can open the operating record from the app before the Edge Functions are deployed.
-- Buyers and farmers still cannot read this table, so wallet numbers stay on the server.

grant select, insert, update on public.workspace to authenticated;

create policy "staff read workspace"
  on public.workspace for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('ops', 'agent', 'driver')
    )
  );

create policy "ops insert workspace"
  on public.workspace for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'ops'
    )
  );

create policy "staff update workspace"
  on public.workspace for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('ops', 'agent', 'driver')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('ops', 'agent', 'driver')
    )
  );

create or replace function public.attach_ops_user(ops_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if ops_id is null or ops_id = '' then
    return;
  end if;
  update public.profiles
  set ops_user_id = ops_id
  where id = auth.uid()
    and role = 'ops'
    and (ops_user_id is null or ops_user_id = '');
end;
$$;

grant execute on function public.attach_ops_user(text) to authenticated;

notify pgrst, 'reload schema';
