-- user_settings: per-user AI provider credentials
-- Stores either a manual API key or OAuth tokens for free AI providers.
-- RLS: users can only read/write their own settings.

create table user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  ai_provider text not null default 'none',        -- 'gemini', 'huggingface', 'groq', 'together', 'none'
  ai_api_key text,                                  -- encrypted manual key (for gemini or custom)
  ai_base_url text,                                 -- for openai_compatible (ollama etc)
  ai_model text,                                    -- model name
  oauth_provider text,                              -- 'huggingface', 'groq', 'together'
  oauth_access_token text,                          -- provider access token (encrypted at rest via pgcrypto)
  oauth_refresh_token text,
  oauth_token_expires_at timestamptz,
  notifications_low_stock boolean not null default true,
  notifications_expiring boolean not null default true,
  notifications_days_before_expiry int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

-- Users can only access their own settings
create policy "users_own_settings" on user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Edge functions need to read settings too (service role bypasses RLS, but
-- we also create a function for the anon key to read their own settings)
create or replace function get_my_settings()
returns table (
  ai_provider text,
  ai_api_key text,
  ai_base_url text,
  ai_model text,
  oauth_provider text,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_token_expires_at timestamptz,
  notifications_low_stock boolean,
  notifications_expiring boolean,
  notifications_days_before_expiry int
)
language sql
security definer
set search_path = public
as $$
  select
    ai_provider, ai_api_key, ai_base_url, ai_model,
    oauth_provider, oauth_access_token, oauth_refresh_token, oauth_token_expires_at,
    notifications_low_stock, notifications_expiring, notifications_days_before_expiry
  from user_settings
  where user_id = auth.uid();
$$;

grant execute on function get_my_settings() to authenticated;
