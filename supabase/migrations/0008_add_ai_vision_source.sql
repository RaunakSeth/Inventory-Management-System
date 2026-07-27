-- Add 'ai_vision' to product_source enum and migrate existing data
ALTER TYPE product_source ADD VALUE IF NOT EXISTS 'ai_vision';

-- Migrate old 'gemini_vision' records to 'ai_vision'
UPDATE product_library SET source = 'ai_vision' WHERE source = 'gemini_vision';

-- Update the default
ALTER TABLE product_library ALTER COLUMN source SET DEFAULT 'ai_vision';
