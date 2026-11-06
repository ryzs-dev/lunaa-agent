-- Staff numbers the WhatsApp bot accepts orders from, managed in Settings.
create table if not exists public.staff_phones (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text not null,
  added_by text,
  created_at timestamptz not null default now()
);

alter table public.staff_phones enable row level security;

insert into public.staff_phones (phone_number, name) values
  ('601126470411', 'Dev - 0411'),
  ('60174941361', 'Admin - 41361'),
  ('60164525013', 'Admin - 5013'),
  ('60127909921', 'Admin - 9921'),
  ('60164561361', 'Admin - 61361'),
  ('601158699901', 'Admin - 9901'),
  ('60174589098', 'Admin - 9098'),
  ('60168658627', 'Admin - 8627')
on conflict (phone_number) do nothing;

notify pgrst, 'reload schema';
