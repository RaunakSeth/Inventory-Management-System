-- Add visible_fields to user_settings for configurable inventory field visibility
-- Stores which fields the user wants to see on their stock cards.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS visible_fields jsonb NOT NULL DEFAULT '[
  "image", "name", "category", "quantity", "min_quantity",
  "location", "best_before", "consumption", "tags"
]';

-- Update the get_my_settings function to include visible_fields
CREATE OR REPLACE FUNCTION get_my_settings()
RETURNS TABLE (
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
  notifications_days_before_expiry int,
  visible_fields jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ai_provider, ai_api_key, ai_base_url, ai_model,
    oauth_provider, oauth_access_token, oauth_refresh_token, oauth_token_expires_at,
    notifications_low_stock, notifications_expiring, notifications_days_before_expiry,
    visible_fields
  FROM user_settings
  WHERE user_id = auth.uid();
$$;
