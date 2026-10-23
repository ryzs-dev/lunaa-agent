-- Converra connection made from Integrations → Converra ("Connect with Converra"),
-- plus the history of full customer syncs. Read and written only by lunaa-agent with the
-- service role key: RLS on, no policies.

create table if not exists public.converra_connection (
  -- Single row: Lunaa connects to one Converra workspace.
  id smallint primary key default 1 check (id = 1),
  business_id text,
  workspace_name text,
  access_key text,
  api_base_url text,
  connected_by text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  auto_sync boolean not null default true,
  sync_segments boolean not null default true,
  sync_email boolean not null default true,
  -- null = all customers; otherwise only customers in at least one of these segments sync.
  segment_ids text[],
  oauth_state text,
  oauth_state_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.converra_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('manual', 'connect')),
  started_by text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  business_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  failed integer not null default 0,
  without_phone integer not null default 0,
  error text
);

create index if not exists converra_sync_runs_started_idx
  on public.converra_sync_runs (started_at desc);

alter table public.converra_connection enable row level security;
alter table public.converra_sync_runs enable row level security;
