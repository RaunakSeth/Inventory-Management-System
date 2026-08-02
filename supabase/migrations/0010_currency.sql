-- currency support: display currency + base currency (the currency stored prices are denominated in)
-- Applied to the live DB via `supabase db query` (project had no CLI migration history).
alter table user_settings add column if not exists currency text not null default 'USD';
alter table user_settings add column if not exists base_currency text not null default 'USD';