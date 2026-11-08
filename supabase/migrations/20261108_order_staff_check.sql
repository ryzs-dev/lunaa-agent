-- Staff confirm or correct a WhatsApp order from the bot's summary.
alter table public.orders
  add column if not exists staff_confirmed_at timestamptz,
  add column if not exists staff_confirmed_by text,
  add column if not exists staff_corrected_at timestamptz,
  add column if not exists staff_corrected_by text;

notify pgrst, 'reload schema';
