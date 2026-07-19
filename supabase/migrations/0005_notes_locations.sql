-- Migration 0005: Notes/description, product_tags, locations UI helpers
-- 1. Add notes/description to product_library
-- 2. Add product-to-tag direct table (product_tags) for simplicity
-- 3. Add better location functions
-- 4. Ensure location parent_id is properly indexed

-- 1. Notes/description field
alter table product_library add column if not exists description text;

-- 2. Product tags (direct product-to-tag, simpler than stock_item_tags for catalog-level labels)
create table if not exists product_tags (
  product_id uuid not null references product_library(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

alter table product_tags enable row level security;
create policy "authenticated_full_access" on product_tags
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 3. Helper: get all locations as flat list
create or replace function get_locations_tree()
returns table (id uuid, name text, parent_id uuid, depth int)
language sql stable
as $$
  with recursive loc_tree as (
    select id, name, parent_id, 0 as depth
    from locations
    where parent_id is null
    union all
    select l.id, l.name, l.parent_id, lt.depth + 1
    from locations l
    join loc_tree lt on lt.id = l.parent_id
  )
  select * from loc_tree order by depth, name;
$$;

-- 4. Ensure index exists (idempotent)
create index if not exists locations_parent_idx on locations (parent_id);
