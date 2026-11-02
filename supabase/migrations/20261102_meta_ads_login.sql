-- Signing in with Facebook: who connected, when the token runs out, and the
-- token held between sign-in and picking an ad account.
alter table public.meta_ads_settings
  add column if not exists connected_via text,
  add column if not exists connected_by text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists pending_token_encrypted text,
  add column if not exists pending_token_expires_at timestamptz,
  add column if not exists pending_user text,
  add column if not exists pending_at timestamptz;
