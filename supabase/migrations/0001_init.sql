-- PG Home Inventory Management — core schema
-- Design notes:
--   * product_library = your growing shared catalog (seeded from Open Food Facts,
--     barcode-lookup fallback, or Gemini vision extraction from a photo).
--   * stock_items = actual quantity on hand per product (+ optional location).
--   * transactions = immutable ledger of every stock movement (restock/usage/adjustment).
--     Current quantity is always derived by summing transactions, never edited directly —
--     this is what lets us compute a real consumption rate later, not just a snapshot.
--   * bills / bill_line_items = raw bill scan + Gemini-parsed line items, reviewed
--     by a human before they become transactions.

create extension if not exists "pg_trgm";
create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type transaction_type as enum ('restock', 'usage', 'adjustment', 'bill_scan');
create type bill_status as enum ('pending', 'parsed', 'reviewed', 'error');
create type product_source as enum ('open_food_facts', 'barcode_lookup', 'gemini_vision', 'manual');

-- ---------- Locations (optional: "Kitchen store", "Cleaning cupboard", "Reception") ----------
create table locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Product library (shared catalog, grows over time) ----------
create table product_library (
  id uuid primary key default uuid_generate_v4(),
  barcode text unique,                     -- EAN13/UPC, nullable (some items have no barcode)
  name text not null,
  brand text,
  category text,                           -- e.g. "Grains", "Cleaning", "Dairy"
  default_unit text not null default 'pcs',-- kg, l, pcs, packet, bottle...
  pack_size numeric,                       -- e.g. 1 (kg) per pack, used to convert bill qty -> stock qty
  image_url text,
  source product_source not null default 'manual',
  source_ref text,                        -- e.g. Open Food Facts product code, for re-sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_library_barcode_idx on product_library (barcode);
create index product_library_name_trgm_idx on product_library using gin (name gin_trgm_ops);

-- ---------- Stock items (current holding per product, per location) ----------
create table stock_items (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references product_library(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  quantity numeric not null default 0,     -- always derived from transactions (see recompute below)
  unit text not null default 'pcs',
  min_quantity numeric not null default 0, -- reorder threshold
  avg_daily_consumption numeric,           -- rolling estimate, updated by a scheduled job
  last_restocked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (product_id, location_id)
);

-- ---------- Transactions (immutable ledger) ----------
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  type transaction_type not null,
  quantity_change numeric not null,        -- positive = added, negative = consumed
  note text,
  source_bill_id uuid,                     -- set below once bills table exists
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index transactions_stock_item_idx on transactions (stock_item_id, created_at desc);

-- ---------- Bills (raw scans) ----------
create table bills (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  vendor_name text,
  total_amount numeric,
  status bill_status not null default 'pending',
  raw_llm_response jsonb,                  -- full Gemini structured output, kept for audit/debug
  scanned_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table bill_line_items (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid not null references bills(id) on delete cascade,
  raw_text text not null,                  -- original line as printed on the bill
  parsed_name text,
  quantity numeric,
  unit text,
  unit_price numeric,
  matched_product_id uuid references product_library(id),
  match_confidence numeric,                -- 0-1, from fuzzy match or LLM confidence
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

alter table transactions
  add constraint transactions_source_bill_fk
  foreign key (source_bill_id) references bills(id) on delete set null;

-- ---------- Keep stock_items.quantity in sync with the transaction ledger ----------
create or replace function apply_transaction_to_stock() returns trigger as $$
begin
  update stock_items
    set quantity = quantity + new.quantity_change,
        updated_at = now(),
        last_restocked_at = case when new.quantity_change > 0 then now() else last_restocked_at end
    where id = new.stock_item_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_apply_transaction
  after insert on transactions
  for each row execute function apply_transaction_to_stock();

-- ---------- Low-stock view: the core "what needs refilling" query ----------
create view low_stock_items as
select
  si.id as stock_item_id,
  pl.name as product_name,
  pl.category,
  si.quantity,
  si.unit,
  si.min_quantity,
  si.avg_daily_consumption,
  case
    when si.avg_daily_consumption is not null and si.avg_daily_consumption > 0
      then round(si.quantity / si.avg_daily_consumption, 1)
    else null
  end as estimated_days_remaining,
  l.name as location_name
from stock_items si
join product_library pl on pl.id = si.product_id
left join locations l on l.id = si.location_id
where si.quantity <= si.min_quantity
   or (si.avg_daily_consumption is not null and si.avg_daily_consumption > 0
       and si.quantity / si.avg_daily_consumption <= 3); -- flag anything ~3 days from running out

-- ---------- RLS: shared household model — any signed-in staff member has full access ----------
alter table locations enable row level security;
alter table product_library enable row level security;
alter table stock_items enable row level security;
alter table transactions enable row level security;
alter table bills enable row level security;
alter table bill_line_items enable row level security;

create policy "authenticated_full_access" on locations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on product_library for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on stock_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on transactions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on bills for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on bill_line_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
