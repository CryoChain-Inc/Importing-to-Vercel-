-- Account deletion (Google Play / privacy requirement). Called only by the delete-account edge function (service role).
-- Orders, settlements, payouts and chat reference profiles without cascade and are financial records, so the account
-- is anonymised in place: personal data is wiped, the rows other records point at stay. The auth user is then
-- soft-deleted by the function, which frees the phone/email and blocks sign-in.

create or replace function public.erase_account(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r text;
begin
  select role into r from public.profiles where id = p_id;
  if r is null then raise exception 'no_account'; end if;
  -- Staff accounts are invite-only and managed by ops.
  if r not in ('farmer', 'buyer', 'pending') then raise exception 'staff_account'; end if;

  -- Money still moving: the user must wait until it settles.
  if exists (select 1 from public.payout_transfers where farmer_id = p_id and status in ('queued', 'sent'))
     or exists (select 1 from public.orders where buyer_id = p_id and state in ('awaiting_payment', 'paid'))
     or exists (select 1 from public.truck_bookings where buyer_id = p_id and state in ('awaiting_payment', 'paid') and pickup_at > now() - interval '1 day')
  then raise exception 'in_flight'; end if;

  delete from public.sms_outbox where user_id = p_id;
  delete from public.notifications where user_id = p_id;
  delete from public.buyer_addresses where buyer_id = p_id;
  delete from public.produce_listings where farmer_id = p_id and lot_id is null;
  update public.truck_messages set body = '[deleted]' where sender_id = p_id;

  update public.farmers
     set address = null, locality = null, language = null, latitude = null, longitude = null,
         line1 = null, landmark = null, city = null, postcode = null,
         momo_network = null, momo_number = null, momo_name = null, wallet_verified_at = null
   where id = p_id;
  update public.buyers set organization_name = '', delivery_location = '' where id = p_id;
  update public.profiles
     set display_name = null, phone = null, email = null, country_code = null, national_number = null
   where id = p_id;
end;
$$;

revoke all on function public.erase_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_account(uuid) to service_role;
