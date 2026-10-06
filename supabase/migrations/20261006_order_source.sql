-- Where an order came from. Shopee and Lazada orders are read from the order
-- sheet (orange and dark-blue rows) and have no CRM customer, only a buyer name.

alter table public.orders add column if not exists source text not null default 'whatsapp';
alter table public.orders add column if not exists external_ref text;
alter table public.orders add column if not exists buyer_name text;

create unique index if not exists orders_external_ref_key
  on public.orders (external_ref)
  where external_ref is not null;

create index if not exists orders_source_idx on public.orders (source);
