-- Support email shown alongside the support phone; ops-only like the rest of ops_config.
alter table public.ops_config
  add column support_email text check (support_email is null or support_email ~ '^\S+@\S+\.\S+$');
