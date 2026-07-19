-- Recomputes avg_daily_consumption for every stock item from the last 30 days
-- of 'usage' transactions. Call this on a schedule (pg_cron, see below) or
-- manually via: select recompute_consumption_rates();

create or replace function recompute_consumption_rates() returns void as $$
begin
  update stock_items si
  set avg_daily_consumption = sub.daily_rate
  from (
    select
      t.stock_item_id,
      -- total consumed over the window / number of days in the window
      abs(sum(t.quantity_change)) / greatest(
        extract(epoch from (now() - min(t.created_at))) / 86400.0,
        1
      ) as daily_rate
    from transactions t
    where t.type = 'usage'
      and t.created_at >= now() - interval '30 days'
    group by t.stock_item_id
  ) sub
  where si.id = sub.stock_item_id;
end;
$$ language plpgsql;

-- Requires the pg_cron extension (enable it from the Supabase Dashboard ->
-- Database -> Extensions first, then run this). Runs once a day at 3am.
-- select cron.schedule('recompute-consumption-rates', '0 3 * * *', 'select recompute_consumption_rates()');
