-- Shopee / Lazada shops connected from Integrations, and the orders pulled from them.

create table if not exists public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('shopee', 'lazada')),
  shop_id text not null,
  shop_name text,
  region text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, shop_id)
);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('shopee', 'lazada')),
  shop_id text not null,
  external_id text not null,
  order_number text not null,
  status text not null,
  buyer_name text,
  buyer_phone text,
  shipping_address text,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'MYR',
  items jsonb not null default '[]'::jsonb,
  ordered_at timestamptz not null,
  platform_updated_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (platform, external_id)
);

create index if not exists marketplace_orders_shop_ordered_idx
  on public.marketplace_orders (platform, shop_id, ordered_at desc);

-- Tokens are only read by the backend with the service role key.
alter table public.marketplace_connections enable row level security;
alter table public.marketplace_orders enable row level security;
