-- Optional buyer profile photo: a storage key in the public 'produce' bucket, inside the buyer's own folder.
alter table public.buyers
  add column photo_path text,
  add constraint buyers_photo_path_own check (photo_path is null or photo_path like id::text || '/%');

create or replace function public.set_buyer_photo(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.buyers set photo_path = p_path where id = (select auth.uid());
  if not found then
    raise exception 'not a buyer';
  end if;
end;
$$;

revoke all on function public.set_buyer_photo(text) from public, anon;
grant execute on function public.set_buyer_photo(text) to authenticated;
