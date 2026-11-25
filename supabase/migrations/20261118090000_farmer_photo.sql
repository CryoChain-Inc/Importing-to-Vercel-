-- Optional farmer profile photo: a storage key in the public 'produce' bucket, inside the farmer's own folder.
alter table public.farmers
  add column photo_path text,
  add constraint farmers_photo_path_own check (photo_path is null or photo_path like id::text || '/%');
grant update (photo_path) on table public.farmers to authenticated;
