import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AlertTriangle, Clock, Package } from "lucide-react";
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
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold">Needs Refilling</h1>
        {!loading && rows.length > 0 && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {rows.length} item{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-slate-800/50 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">All stocked up!</p>
          <p className="text-xs mt-1">Nothing is running low right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isUrgent = row.estimated_days_remaining !== null && row.estimated_days_remaining <= 2;
            const isWarning = row.estimated_days_remaining !== null && row.estimated_days_remaining > 2;
            return (
              <div
                key={row.stock_item_id}
                className={`rounded-xl p-4 border ${
                  isUrgent
                    ? "bg-red-900/20 border-red-800/30"
                    : isWarning
                    ? "bg-amber-900/20 border-amber-800/30"
                    : "bg-slate-900/80 border-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{row.product_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.quantity} {row.unit} left
                      {row.location_name ? ` \u00b7 ${row.location_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {row.estimated_days_remaining !== null ? (
                      <div className={`flex items-center gap-1.5 ${isUrgent ? "text-red-400" : "text-amber-400"}`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-sm font-medium">
                          {row.estimated_days_remaining < 1
                            ? "<1d"
                            : `~${Math.round(row.estimated_days_remaining)}d`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">Below threshold</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
