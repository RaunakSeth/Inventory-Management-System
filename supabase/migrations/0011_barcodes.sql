-- 0011_barcodes.sql
-- User-generated barcodes (barcode generation feature).
--
-- Model (per the product owner's decision):
--   * product_library  -> SHARED global catalog (real EAN / India barcodes), stays shared.
--   * barcodes         -> PER-USER. Each user generates/edits/deletes their own barcode
--                         values and may map them to any product in the shared library.
--
-- The barcode "code" is the printable value (e.g. a 13-digit EAN-13). The UI renders
-- the visual barcode from it. Each user may map the same code to only one product,
-- but different users may hold colliding codes independently (unique per (user_id, code)).

create table if not exists barcodes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid references product_library(id) on delete set null,
  code text not null,                       -- printable barcode value (e.g. 8901234567895)
  format text not null default 'ean13',     -- ean13 | gtin | custom
  label text not null default '',           -- friendly name for this barcode
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create index if not exists barcodes_user_id_idx on barcodes (user_id);
create index if not exists barcodes_product_id_idx on barcodes (product_id);

alter table barcodes enable row level security;

-- Owner-only: a user can only see / change their own barcodes.
drop policy if exists "users_manage_own_barcodes" on barcodes;
create policy "users_manage_own_barcodes" on barcodes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);