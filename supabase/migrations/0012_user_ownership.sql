-- 0012_user_ownership.sql
-- Move from the "shared household" model to PER-USER data scoping.
--
-- Design decisions (from the product owner):
--   * product_library stays SHARED/global (real India / EAN products, global-unique barcode).
--   * Every other table becomes owner-scoped: a fresh `user_id` column, legacy rows
--     backfilled to the OLDEST registered user, and RLS swapped from
--     `authenticated_full_access` (anyone) to `*_user_owned` (auth.uid() = user_id).
--   * Global UNIQUE(name) on small lookup tables becomes UNIQUE(user_id, name) so two
--     users can independently maintain Locations / Stores / Units / Groups / Tags.
--   * `low_stock_items` view switches to security_invoker so RLS is enforced.
--   * barcodes (0011) are already per-user and are not touched here.

-- ---------------------------------------------------------------------------
-- Step 0: backfill target — legacy rows are assigned to the oldest user.
-- Runs BEFORE the not-null enforcement so every legacy row gets an owner.
-- ---------------------------------------------------------------------------
create or replace function public._assign_default_owner() returns uuid
language sql stable
as $$
  select id from auth.users
  order by coalesce(last_sign_in_at, created_at) asc, created_at asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Step 1: helper — add owned column to a table & backfill
-- ---------------------------------------------------------------------------
create or replace function public.claim_column(tbl text) returns void
language plpgsql
as $$
declare
  owner_id uuid := public._assign_default_owner();
begin
  execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', tbl);
  if owner_id is not null then
    execute format('update public.%I set user_id = %L where user_id is null', tbl, owner_id::text);
  end if;
  execute format('alter table public.%I alter column user_id set not null', tbl);
  execute format('alter table public.%I alter column user_id set default auth.uid()', tbl);
end;
$$;

select public.claim_column('locations');
select public.claim_column('stock_items');
select public.claim_column('transactions');
select public.claim_column('bills');
select public.claim_column('bill_line_items');
select public.claim_column('shopping_list');
select public.claim_column('quantity_units');
select public.claim_column('product_groups');
select public.claim_column('stores');
select public.claim_column('tags');
select public.claim_column('product_tags');
select public.claim_column('stock_item_tags');

-- ---------------------------------------------------------------------------
-- Step 2: per-user uniqueness on lookup catalogues (replace global UNIQUE name)
-- ---------------------------------------------------------------------------
alter table locations drop constraint if exists locations_name_key;
alter table locations add constraint locations_user_name_key unique (user_id, name);

alter table stores drop constraint if exists stores_name_key;
alter table stores add constraint stores_user_name_key unique (user_id, name);

alter table quantity_units drop constraint if exists quantity_units_name_key;
alter table quantity_units add constraint quantity_units_user_name_key unique (user_id, name);

alter table product_groups drop constraint if exists product_groups_name_key;
alter table product_groups add constraint product_groups_user_name_key unique (user_id, name);

alter table tags drop constraint if exists tags_name_key;
alter table tags add constraint tags_user_name_key unique (user_id, name);

-- stock_items: same (product_id, location_id) allowed across different users
alter table stock_items drop constraint if exists stock_items_product_id_location_id_key;
alter table stock_items add constraint stock_items_user_product_location_key unique (user_id, product_id, location_id);

-- ---------------------------------------------------------------------------
-- Step 3: RLS — replace broad `authenticated_full_access` with owner-scoped policies.
-- product_library deliberately keeps its shared access (global catalogue).
-- ---------------------------------------------------------------------------

drop policy if exists authenticated_full_access on public.locations;
create policy locations_user_owned on public.locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.stock_items;
create policy stock_items_user_owned on public.stock_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.transactions;
create policy transactions_user_owned on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.bills;
create policy bills_user_owned on public.bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.bill_line_items;
create policy bill_line_items_user_owned on public.bill_line_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.shopping_list;
create policy shopping_list_user_owned on public.shopping_list
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.quantity_units;
create policy quantity_units_user_owned on public.quantity_units
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.product_groups;
create policy product_groups_user_owned on public.product_groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.stores;
create policy stores_user_owned on public.stores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.tags;
create policy tags_user_owned on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.product_tags;
create policy product_tags_user_owned on public.product_tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists authenticated_full_access on public.stock_item_tags;
create policy stock_item_tags_user_owned on public.stock_item_tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Step 4: barcodes (0011) already has owner policies + access is auto-exposed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Step 5: `low_stock_items` must enforce RLS (security_invoker) now data is per-user.
-- ---------------------------------------------------------------------------
create or replace view low_stock_items
with (security_invoker = true) as
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
       and si.quantity / si.avg_daily_consumption <= 3);

-- ---------------------------------------------------------------------------
-- Cleanup: helper functions no longer needed (kept deterministic).
-- ---------------------------------------------------------------------------
drop function if exists public.claim_column(text);
drop function if exists public._assign_default_owner();