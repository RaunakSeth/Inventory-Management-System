-- Fuzzy name matching for bill line items -> product_library, using the
-- pg_trgm index already created on product_library.name. Called from the
-- frontend via supabase.rpc('match_product_by_name', { search: '...' }).

create or replace function match_product_by_name(search text, min_similarity real default 0.35)
returns table (
  product_id uuid,
  name text,
  similarity real
) as $$
  select
    id as product_id,
    name,
    similarity(name, search) as similarity
  from product_library
  where similarity(name, search) > min_similarity
  order by similarity desc
  limit 5;
$$ language sql stable;
