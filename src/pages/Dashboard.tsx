import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { LowStockRow } from "../lib/types";

export function Dashboard() {
  const [rows, setRows] = useState<LowStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("low_stock_items")
      .select("*")
      .order("estimated_days_remaining", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setRows((data as LowStockRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold">Needs refilling</h1>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-slate-500 text-sm">Nothing low on stock right now. 🎉</p>
      )}
      {rows.map((row) => (
        <div
          key={row.stock_item_id}
          className="rounded-lg bg-slate-900 p-3 flex items-center justify-between"
        >
          <div>
            <p className="font-medium">{row.product_name}</p>
            <p className="text-xs text-slate-500">
              {row.quantity} {row.unit} left
              {row.location_name ? ` · ${row.location_name}` : ""}
            </p>
          </div>
          <div className="text-right">
            {row.estimated_days_remaining !== null ? (
              <p className="text-sm text-amber-400">~{row.estimated_days_remaining}d left</p>
            ) : (
              <p className="text-sm text-red-400">Below threshold</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
