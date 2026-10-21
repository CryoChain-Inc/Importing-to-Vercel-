-- Phone is also stored as country_code + national_number (digits only, no "+" or leading 0),
-- derived from the verified auth.users.phone. Covers every calling code libphonenumber-js knows (src/data/countries.ts).
alter table public.profiles add column if not exists country_code text, add column if not exists national_number text;

create or replace function public.split_phone(p text)
returns table (country_code text, national_number text)
language sql
immutable
set search_path = ''
as $$
  select c, substr(d, length(c) + 1)
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
  join unnest(array['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998']) as c on x.d like c || '%'
  order by length(c) desc
  limit 1
$$;

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cc text;
  nn text;
begin
  select s.country_code, s.national_number into cc, nn from public.split_phone(nullif(new.phone, '')) s;
  insert into public.profiles (id, phone, email, country_code, national_number)
  values (new.id, nullif(new.phone, ''), new.email, cc, nn)
  on conflict (id) do update
    set phone = excluded.phone, email = excluded.email,
        country_code = excluded.country_code, national_number = excluded.national_number;
  return new;
end;
$$;

update public.profiles p
   set country_code = s.country_code, national_number = s.national_number
  from public.split_phone(p.phone) s
 where p.phone is not null;

alter table public.profiles
  add constraint profiles_phone_parts check ((country_code is null) = (national_number is null));
