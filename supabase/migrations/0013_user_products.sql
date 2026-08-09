-- 0013_user_products.sql
-- User-specific products next to the global catalog, completing the barcode feature:
--
--   * product_library gains a nullable `user_id`:
--       - user_id IS NULL     -> GLOBAL shared catalog (products of national/Indian
--                                 origin, entered via scan/lookup of real barcodes).
--       - user_id IS NOT NULL -> USER-SPECIFIC product (created for a user-generated
--                                barcode / a manual entry that is not a national origin).
--   * barcodes (0011) stays the per-user barcode registry and can point at either kind
--     of product. Editing a mapping / changing a product's code = "products switch their
--     barcodes" in the backend.
--   * barcode uniqueness:
--       - global rows: one row per barcode (unique when user_id IS NULL)
--       - user rows:   unique per (user_id, barcode)
--   * RLS: users read global + their own products; can only write their own. Inserting
--     a GLOBAL (national origin) product goes through security-definer RPC
--     `upsert_national_product`, never through direct user insert.

alter table public.product_library
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- default to user-owned rows for app writers
alter table public.product_library
  alter column user_id set default auth.uid();

-- keep a deterministic seed for the 195 global rows (they must stay user_id NULL)
-- (no rows are re-seeded here; existing rows are already present)

-- ---------------------------------------------------------------------------
-- Replace the single UNIQUE(barcode) with split uniqueness
-- ---------------------------------------------------------------------------
alter table public.product_library drop constraint if exists product_library_barcode_key;

create unique index if not exists product_library_global_barcode_key
  on public.product_library (barcode)
  where user_id is null and barcode is not null;

create unique index if not exists product_library_user_barcode_key
  on public.product_library (user_id, barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------------
-- RLS: users read global + their own products, write only their own
-- ---------------------------------------------------------------------------
drop policy if exists authenticated_full_access on public.product_library;
drop policy if exists products_read on public.product_library;
drop policy if exists products_insert on public.product_library;
drop policy if exists products_update on public.product_library;
drop policy if exists products_delete on public.product_library;

create policy products_read on public.product_library
  for select
  using (user_id is null or user_id = auth.uid());

create policy products_insert on public.product_library
  for insert
  with check (user_id = auth.uid());

create policy products_update on public.product_library
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy products_delete on public.product_library
  for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: insert/update a NATIONAL (global) product row.
-- Used by the scan/quick-add path AFTER a real barcode lookup succeeds, so the
-- global catalog only grows from authoritative lookups, never from manual edits.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_national_product(
  p_barcode      text,
  p_name         text,
  p_brand        text default null,
  p_category     text default null,
  p_unit         text default 'pcs',
  p_image_url    text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.product_library
    (barcode, name, brand, category, default_unit, image_url, source, user_id)
  values
    (p_barcode, p_name, p_brand, p_category, coalesce(p_unit, 'pcs'), p_image_url, 'open_food_facts', null)
  on conflict (barcode) where user_id is null
  do update set
    name         = coalesce(excluded.name, product_library.name),
    brand        = coalesce(excluded.brand, product_library.brand),
    category     = coalesce(excluded.category, product_library.category),
    default_unit = coalesce(excluded.default_unit, product_library.default_unit),
    image_url    = coalesce(excluded.image_url, product_library.image_url),
    updated_at   = now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.upsert_national_product to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: resolve a scanned barcode to the best product for this user.
--   1. the user's own barcode mapping (barcodes.code -> product)
--   2. own product_library rows whose barcode equals the scan
--   3. global national rows
-- This is the single lookup the scan/restock flow should call.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_barcode(p_code text)
returns table (product_id uuid, name text, source text, is_global boolean)
language plpgsql stable security definer
set search_path = public
as $$
begin
  -- own mapping via barcodes registry first (user-generated barcodes win)
  return query
    select b.product_id, pl.name, pl.source, (pl.user_id is null)
    from public.barcodes b
    join public.product_library pl on pl.id = b.product_id
    where b.user_id = auth.uid() and b.code = p_code
    order by pl.user_id is null
    limit 1;

  if found then return; end if;

  -- direct product match (own or global)
  return query
    select pl.id, pl.name, pl.source, (pl.user_id is null)
    from public.product_library pl
    where pl.barcode = p_code and (pl.user_id is null or pl.user_id = auth.uid())
    limit 1;
end;
$$;

grant execute on function public.resolve_barcode(text) to authenticated;