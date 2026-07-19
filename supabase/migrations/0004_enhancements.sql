-- Migration 0004: Enhancements from Shelf.nu / Homebox research
-- 1. Prevent negative stock quantities (BEFORE INSERT trigger on transactions)
-- 2. Add parent_id to locations for hierarchical nesting
-- 3. Add consumption_type to stock_items (consumed vs returnable)
-- 4. Add tags support

-- 1. Negative quantity prevention
create or replace function prevent_negative_stock() returns trigger as $$
declare
  current_qty numeric;
begin
  select quantity into current_qty from stock_items where id = new.stock_item_id;
  if current_qty + new.quantity_change < 0 then
    raise exception 'Insufficient stock: have %, need %', current_qty, abs(new.quantity_change)
      using hint = 'Adjust quantity or add a restock transaction first.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_negative_stock on transactions;
create trigger trg_prevent_negative_stock
  before insert on transactions
  for each row
  when (new.quantity_change < 0)
  execute function prevent_negative_stock();

-- 2. Hierarchical locations (self-referencing parent_id)
alter table locations add column if not exists parent_id uuid references locations(id) on delete set null;
create index if not exists locations_parent_idx on locations (parent_id);

-- 3. Consumption types for stock items
do $$ begin
  create type consumption_type as enum ('consumed', 'returnable');
exception
  when duplicate_object then null;
end $$;

alter table stock_items add column if not exists consumption_type consumption_type not null default 'consumed';

-- 4. Tags support
create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text default '#6b7280',
  created_at timestamptz not null default now()
);

create table if not exists stock_item_tags (
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (stock_item_id, tag_id)
);

alter table stock_item_tags enable row level security;
create policy "authenticated_full_access" on stock_item_tags for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table tags enable row level security;
create policy "authenticated_full_access" on tags for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
