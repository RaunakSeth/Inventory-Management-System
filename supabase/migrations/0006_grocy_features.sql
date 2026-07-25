-- Migration 0006: Grocy-inspired features
-- 1. Expiration dates on stock items
-- 2. Shopping list
-- 3. Quantity units with conversion
-- 4. Product groups
-- 5. Stores
-- 6. Price tracking

-- 1. Expiration dates
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS best_before_date date;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS opened_at timestamptz;
CREATE INDEX IF NOT EXISTS stock_items_best_before_idx ON stock_items (best_before_date);

-- 2. Shopping list
CREATE TABLE IF NOT EXISTS shopping_list (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid REFERENCES product_library(id) ON DELETE SET NULL,
  custom_name text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pcs',
  note text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON shopping_list FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 3. Quantity units
CREATE TABLE IF NOT EXISTS quantity_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  name_plural text,
  factor_to_base numeric NOT NULL DEFAULT 1,
  base_unit_id uuid REFERENCES quantity_units(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quantity_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON quantity_units FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Seed default quantity units
INSERT INTO quantity_units (name, name_plural, factor_to_base) VALUES
  ('piece', 'pieces', 1),
  ('kg', 'kg', 1),
  ('g', 'g', 0.001),
  ('L', 'L', 1),
  ('mL', 'mL', 0.001),
  ('packet', 'packets', 1),
  ('bottle', 'bottles', 1),
  ('dozen', 'dozen', 12),
  ('box', 'boxes', 1),
  ('bag', 'bags', 1)
ON CONFLICT (name) DO NOTHING;

-- 4. Product groups
CREATE TABLE IF NOT EXISTS product_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  parent_id uuid REFERENCES product_groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL default now()
);
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON product_groups FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Seed default product groups
INSERT INTO product_groups (name) VALUES
  ('Food & Groceries'), ('Cleaning'), ('Toiletries'), ('Beverages'),
  ('Spices & Condiments'), ('Dairy'), ('Bakery'), ('Frozen'),
  ('Personal Care'), ('Household')
ON CONFLICT (name) DO NOTHING;

-- 5. Stores
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  address text,
  created_at timestamptz NOT NULL default now()
);
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON stores FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 6. Price tracking (per transaction)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;

-- Add optional foreign keys to product_library
ALTER TABLE product_library ADD COLUMN IF NOT EXISTS product_group_id uuid REFERENCES product_groups(id) ON DELETE SET NULL;
