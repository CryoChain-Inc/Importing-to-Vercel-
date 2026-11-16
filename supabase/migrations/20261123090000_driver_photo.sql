-- Optional driver profile photo: a storage key in the public 'produce' bucket, inside the driver's own folder.
alter table public.drivers
  add column photo_path text,
  add constraint drivers_photo_path_own check (photo_path is null or photo_path like id::text || '/%');
grant update (photo_path) on table public.drivers to authenticated;
