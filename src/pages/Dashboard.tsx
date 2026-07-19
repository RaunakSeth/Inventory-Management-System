import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AlertTriangle, Clock, Package, Plus, Minus, Trash2, AlertCircle, History } from "lucide-react";

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

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
          const avg = r.avg_daily_consumption;
          const daysLeft = avg && avg > 0 ? Math.round((qty / avg) * 10) / 10 : null;
          return {
            stock_item_id: r.id,
            product_id: r.product_id,
            product_name: r.product_library?.name ?? "(unknown)",
            category: r.product_library?.category ?? null,
            quantity: qty,
            unit: r.unit,
            min_quantity: r.min_quantity,
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

  async function fetchRecentTransactions() {
    const { data } = await supabase
      .from("transactions")
      .select(`
        id, type, quantity_change, created_at, note,
        stock_item_id,
        stock_items!inner(product_id, product_library!inner(name, image_url))
      `)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setRecentTransactions(data as any[]);
  }

  useEffect(() => {
    fetchStock();
    fetchRecentTransactions();
  }, []);

  const lowRows = rows.filter(
    (r) =>
      r.quantity <= r.min_quantity ||
      (r.avg_daily_consumption && r.avg_daily_consumption > 0 && r.quantity / r.avg_daily_consumption <= 3)
  );

  function startEdit(row: StockRow) {
    setErrorMsg(null);
    setEditingId(row.stock_item_id);
    setEditQty(row.quantity);
    setEditUnit(row.unit);
  }

  function cancelEdit() {
    setEditingId(null);
    setErrorMsg(null);
  }

  async function saveEdit(row: StockRow) {
    setSaving(true);
    setErrorMsg(null);
    const diff = editQty - row.quantity;
    if (diff !== 0) {
      const { error } = await supabase.from("transactions").insert({
        stock_item_id: row.stock_item_id,
        type: "adjustment",
        quantity_change: diff,
        note: "Manual adjustment from dashboard",
      });
      if (error) {
        if (error.message.includes("Insufficient stock") || error.message.includes("violates row-level security")) {
          setErrorMsg(
            `Cannot go below 0. Current stock: ${row.quantity} ${row.unit}. Use a restock first or set a higher quantity.`
          );
        } else {
          setErrorMsg(error.message);
        }
        setSaving(false);
        return;
      }
    }
    if (editUnit !== row.unit) {
      await supabase.from("stock_items").update({ unit: editUnit }).eq("id", row.stock_item_id);
    }
    setSaving(false);
    setEditingId(null);
    fetchStock();
  }

  async function quickAdjust(row: StockRow, delta: number) {
    setErrorMsg(null);
    const { error } = await supabase.from("transactions").insert({
      stock_item_id: row.stock_item_id,
      type: delta > 0 ? "restock" : "usage",
      quantity_change: delta,
      note: delta > 0 ? "Quick restock" : "Quick usage",
    });
    if (error) {
      if (error.message.includes("Insufficient stock")) {
        setErrorMsg(`Cannot use ${Math.abs(delta)} — only ${row.quantity} ${row.unit} available.`);
      } else {
        setErrorMsg(error.message);
      }
    } else {
      fetchStock();
    }
  }

  async function deleteStockItem(stockItemId: string) {
    setErrorMsg(null);
    const { error } = await supabase.from("stock_items").delete().eq("id", stockItemId);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setConfirmDelete(null);
      fetchStock();
    }
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

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/20 border border-red-800/30 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">x</button>
        </div>
      )}

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
                  onDelete={() => setConfirmDelete(row.stock_item_id)}
                  saving={saving}
                  confirmDelete={confirmDelete}
                  onConfirmDelete={() => deleteStockItem(row.stock_item_id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                />
              ))}
            </div>
          )}

          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-300 transition py-2">
              <Package className="w-4 h-4" />
              All Stock ({rows.length})
              <Plus className="w-3 h-3 ml-auto group-open:rotate-45 transition" />
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
                  onDelete={() => setConfirmDelete(row.stock_item_id)}
                  saving={saving}
                  confirmDelete={confirmDelete}
                  onConfirmDelete={() => deleteStockItem(row.stock_item_id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                />
              ))}
            </div>
          </details>

          {recentTransactions.length > 0 && (
            <details className="group" open>
              <summary className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-300 transition py-2">
                <History className="w-4 h-4" />
                Recent Activity
              </summary>
              <div className="space-y-1 mt-2">
                {recentTransactions.map((t: any) => {
                  const p = t.stock_items?.product_library;
                  const icon = t.type === "restock" || t.quantity_change > 0 ? "text-emerald-400" : "text-red-400";
                  const label = t.quantity_change > 0 ? "+" : "";
                  return (
                    <div key={t.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-800/30">
                      <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {p?.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <img src={FALLBACK_IMG} alt="" className="w-4 h-4 opacity-50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{p?.name ?? "(unknown)"}</p>
                        <p className="text-[10px] text-slate-600 truncate">{t.note || t.type}</p>
                      </div>
                      <p className={`text-sm font-mono ${icon}`}>
                        {label}{t.quantity_change}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
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
  onDelete,
  saving,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
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
  onDelete: () => void;
  saving: boolean;
  confirmDelete: string | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const isEditing = editingId === row.stock_item_id;
  const isDeleting = confirmDelete === row.stock_item_id;
  const isUrgent = row.estimated_days_remaining !== null && row.estimated_days_remaining <= 2;
  const isWarning = row.estimated_days_remaining !== null && row.estimated_days_remaining > 2;

  if (isDeleting) {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-800/30 p-4">
        <p className="text-sm font-medium text-red-400">Delete "{row.product_name}"?</p>
        <p className="text-xs text-red-400/70 mt-1">
          This will permanently remove the stock entry. Transactions are preserved.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={onConfirmDelete} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-400 transition">
            Delete
          </button>
          <button onClick={onCancelDelete} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

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
              min="0"
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
            <button onClick={onCancelEdit} className="text-xs text-slate-500 px-1">X</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
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
            <button
              onClick={onDelete}
              className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-red-900/50 transition ml-1"
              title="Delete item"
            >
              <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
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
