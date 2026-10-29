-- Bounds for ops settings: cold-chain range within -100..100 °C, and capped contact lengths.
alter table public.ops_config
  add constraint ops_config_temp_range check (
    (min_temp_c is null or min_temp_c between -100 and 100)
    and (max_temp_c is null or max_temp_c between -100 and 100)) not valid,
  add constraint ops_config_support_phone_len check (support_phone is null or support_phone ~ '^[0-9]{6,15}$') not valid,
  add constraint ops_config_support_email_len check (support_email is null or length(support_email) <= 60) not valid;
