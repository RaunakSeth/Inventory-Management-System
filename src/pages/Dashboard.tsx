import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AlertTriangle, Clock, Package, Plus, Minus, RotateCcw, ImageIcon } from "lucide-react";

interface StockRow {
  stock_item_id: string;
  product_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
  avg_daily_consumption: number | null;
  estimated_days_remaining: number | null;
  location_name: string | null;
  image_url: string | null;
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'%3E%3C/path%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'%3E%3C/polyline%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'%3E%3C/line%3E%3C/svg%3E";

export function Dashboard() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editUnit, setEditUnit] = useState<string>("pcs");
  const [saving, setSaving] = useState(false);

  async function fetchStock() {
    setLoading(true);
    const { data } = await supabase
      .from("stock_items")
      .select(`
        id, product_id, quantity, unit, min_quantity,
        avg_daily_consumption, last_restocked_at,
        product_library!inner(name, category, image_url),
        locations(name)
      `)
      .order("quantity", { ascending: true });
    if (data) {
      setRows(
        (data as any[]).map((r) => {
          const qty = r.quantity;
          const minQty = r.min_quantity;
          const avg = r.avg_daily_consumption;
          const daysLeft =
            avg && avg > 0 ? Math.round((qty / avg) * 10) / 10 : null;
          return {
            stock_item_id: r.id,
            product_id: r.product_id,
            product_name: r.product_library?.name ?? "(unknown)",
            category: r.product_library?.category ?? null,
            quantity: qty,
            unit: r.unit,
            min_quantity: minQty,
            avg_daily_consumption: avg,
            estimated_days_remaining: daysLeft,
            location_name: r.locations?.name ?? null,
            image_url: r.product_library?.image_url ?? null,
          };
        })
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStock();
  }, []);

  const lowRows = rows.filter(
    (r) =>
      r.quantity <= r.min_quantity ||
      (r.avg_daily_consumption && r.avg_daily_consumption > 0 && r.quantity / r.avg_daily_consumption <= 3)
  );

  function startEdit(row: StockRow) {
    setEditingId(row.stock_item_id);
    setEditQty(row.quantity);
    setEditUnit(row.unit);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(row: StockRow) {
    setSaving(true);
    const diff = editQty - row.quantity;
    if (diff !== 0) {
      await supabase.from("transactions").insert({
        stock_item_id: row.stock_item_id,
        type: "adjustment",
        quantity_change: diff,
        note: "Manual adjustment from dashboard",
      });
    }
    if (editUnit !== row.unit) {
      await supabase
        .from("stock_items")
        .update({ unit: editUnit })
        .eq("id", row.stock_item_id);
    }
    setSaving(false);
    setEditingId(null);
    fetchStock();
  }

  async function quickAdjust(row: StockRow, delta: number) {
    await supabase.from("transactions").insert({
      stock_item_id: row.stock_item_id,
      type: delta > 0 ? "restock" : "usage",
      quantity_change: delta,
      note: delta > 0 ? "Quick restock" : "Quick usage",
    });
    fetchStock();
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold">Needs Refilling</h1>
        {!loading && lowRows.length > 0 && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {lowRows.length} item{lowRows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-800/50 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No stock yet</p>
          <p className="text-xs mt-1">Scan a barcode or a bill to add your first item.</p>
        </div>
      ) : (
        <>
          {/* Low stock alert section */}
          {lowRows.length > 0 && (
            <div className="space-y-2">
              {lowRows.map((row) => (
                <StockCard
                  key={row.stock_item_id}
                  row={row}
                  isLow
                  editingId={editingId}
                  editQty={editQty}
                  editUnit={editUnit}
                  setEditQty={setEditQty}
                  setEditUnit={setEditUnit}
                  onStartEdit={() => startEdit(row)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => saveEdit(row)}
                  onQuickAdjust={(d) => quickAdjust(row, d)}
                  saving={saving}
                />
              ))}
            </div>
          )}

          {/* All stock section */}
          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-300 transition py-2">
              <Package className="w-4 h-4" />
              All Stock ({rows.length})
              <RotateCcw className="w-3 h-3 ml-auto group-open:rotate-180 transition" />
            </summary>
            <div className="space-y-2 mt-2">
              {rows.map((row) => (
                <StockCard
                  key={row.stock_item_id}
                  row={row}
                  isLow={false}
                  editingId={editingId}
                  editQty={editQty}
                  editUnit={editUnit}
                  setEditQty={setEditQty}
                  setEditUnit={setEditUnit}
                  onStartEdit={() => startEdit(row)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => saveEdit(row)}
                  onQuickAdjust={(d) => quickAdjust(row, d)}
                  saving={saving}
                />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function StockCard({
  row,
  isLow,
  editingId,
  editQty,
  editUnit,
  setEditQty,
  setEditUnit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onQuickAdjust,
  saving,
}: {
  row: StockRow;
  isLow: boolean;
  editingId: string | null;
  editQty: number;
  editUnit: string;
  setEditQty: (v: number) => void;
  setEditUnit: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onQuickAdjust: (d: number) => void;
  saving: boolean;
}) {
  const isEditing = editingId === row.stock_item_id;
  const isUrgent = row.estimated_days_remaining !== null && row.estimated_days_remaining <= 2;
  const isWarning = row.estimated_days_remaining !== null && row.estimated_days_remaining > 2;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isLow && isUrgent
          ? "bg-red-900/20 border-red-800/30"
          : isLow && isWarning
          ? "bg-amber-900/20 border-amber-800/30"
          : "bg-slate-900/80 border-slate-800/50"
      }`}
    >
      <div className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt={row.product_name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }}
            />
          ) : (
            <img src={FALLBACK_IMG} alt="" className="w-5 h-5 opacity-50" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{row.product_name}</p>
          <p className="text-xs text-slate-500 truncate">
            {row.category || "\u00a0"}
          </p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              step="any"
              value={editQty}
              onChange={(e) => setEditQty(Number(e.target.value))}
              className="w-16 rounded bg-slate-800 px-2 py-1 text-sm text-right border border-slate-700"
            />
            <input
              value={editUnit}
              onChange={(e) => setEditUnit(e.target.value)}
              className="w-12 rounded bg-slate-800 px-2 py-1 text-sm border border-slate-700"
            />
            <button
              onClick={onSaveEdit}
              disabled={saving}
              className="text-xs bg-emerald-500 px-2 py-1 rounded disabled:opacity-50"
            >
              {saving ? "..." : "Save"}
            </button>
            <button onClick={onCancelEdit} className="text-xs text-slate-500 px-1">
              X
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onQuickAdjust(-1)}
              className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition"
              title="Use 1"
            >
              <Minus className="w-3 h-3 text-slate-400" />
            </button>
            <button onClick={onStartEdit} className="text-right hover:text-emerald-400 transition">
              <p className="text-sm font-medium">{row.quantity}</p>
              <p className="text-[10px] text-slate-500 -mt-0.5">{row.unit}</p>
            </button>
            <button
              onClick={() => onQuickAdjust(1)}
              className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition"
              title="Add 1"
            >
              <Plus className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}
      </div>

      {!isEditing && row.estimated_days_remaining !== null && (
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <Clock className={`w-3 h-3 ${isUrgent ? "text-red-400" : "text-amber-400"}`} />
          <span className={`text-xs ${isUrgent ? "text-red-400" : "text-amber-400"}`}>
            ~{row.estimated_days_remaining < 1 ? "<1" : row.estimated_days_remaining} day
            {row.estimated_days_remaining !== 1 ? "s" : ""} left
          </span>
        </div>
      )}
    </div>
  );
}
