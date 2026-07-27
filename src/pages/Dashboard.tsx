import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNotifications } from "../components/Notifications";
import { useConfirm } from "../components/ConfirmDialog";
import { useSettings, type FieldId } from "../lib/settings";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { AlertTriangle, Clock, Package, Plus, Minus, Trash2, AlertCircle, History, MapPin, Calendar, Store, DollarSign, Tag } from "lucide-react";
import type { Location, ProductGroup } from "../lib/types";

interface StockRow {
  stock_item_id: string;
  product_id: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  barcode: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
  avg_daily_consumption: number | null;
  estimated_days_remaining: number | null;
  location_name: string | null;
  image_url: string | null;
  best_before_date: string | null;
  last_restocked_at: string | null;
  product_group_id: string | null;
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'%3E%3C/polyline%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'%3E%3C/polyline%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'%3E%3C/line%3E%3C/svg%3E";

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function Dashboard() {
  const { addNotification } = useNotifications();
  const { showConfirm } = useConfirm();
  const { settings } = useSettings();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editUnit, setEditUnit] = useState<string>("pcs");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [activatingLocation, setActivatingLocation] = useState<string | null>(null);
  const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);

  async function fetchStock() {
    setLoading(true);
    const { data } = await supabase
      .from("stock_items")
      .select(`
        id, product_id, quantity, unit, min_quantity,
        avg_daily_consumption, last_restocked_at, best_before_date,
        product_library!inner(name, category, brand, barcode, image_url, product_group_id),
        locations(name)
      `)
      .order("quantity", { ascending: true });
    if (data) {
      const mapped = (data as any[]).map((r) => {
        const qty = r.quantity;
        const avg = r.avg_daily_consumption;
        const daysLeft = avg && avg > 0 ? Math.round((qty / avg) * 10) / 10 : null;
        return {
          stock_item_id: r.id,
          product_id: r.product_id,
          product_name: r.product_library?.name ?? "(unknown)",
          category: r.product_library?.category ?? null,
          brand: r.product_library?.brand ?? null,
          barcode: r.product_library?.barcode ?? null,
          quantity: qty,
          unit: r.unit,
          min_quantity: r.min_quantity,
          avg_daily_consumption: avg,
          estimated_days_remaining: daysLeft,
          location_name: r.locations?.name ?? null,
          image_url: r.product_library?.image_url ?? null,
          best_before_date: r.best_before_date ?? null,
          last_restocked_at: r.last_restocked_at ?? null,
          product_group_id: r.product_library?.product_group_id ?? null,
        };
      });
      setRows(mapped);

      // Smart notifications — only alert when stock is actually running out
      const now = new Date();
      const smartAlerts: { row: StockRow; reason: string; urgency: "high" | "medium" | "low" }[] = [];

      for (const r of mapped) {
        // 1. Has consumption data → use days remaining
        if (r.avg_daily_consumption && r.avg_daily_consumption > 0) {
          const daysLeft = r.quantity / r.avg_daily_consumption;
          if (daysLeft <= 1) {
            smartAlerts.push({ row: r, reason: `Runs out today/tomorrow (${Math.round(daysLeft * 10) / 10}d left)`, urgency: "high" });
          } else if (daysLeft <= 3) {
            smartAlerts.push({ row: r, reason: `${Math.round(daysLeft)}d of supply left`, urgency: "medium" });
          }
          continue;
        }

        // 2. Expiring soon — more important than low stock
        if (r.best_before_date) {
          const days = daysUntil(r.best_before_date);
          if (days < 0) {
            smartAlerts.push({ row: r, reason: `Expired ${Math.abs(days)}d ago`, urgency: "high" });
            continue;
          }
          if (days <= 2) {
            smartAlerts.push({ row: r, reason: days === 0 ? "Expires today" : `Expires in ${days}d`, urgency: "high" });
            continue;
          }
        }

        // 3. No consumption data — only alert if significantly below min
        if (r.quantity < r.min_quantity) {
          smartAlerts.push({ row: r, reason: `Only ${r.quantity} ${r.unit} left (min: ${r.min_quantity})`, urgency: "medium" });
        } else if (r.quantity === r.min_quantity && r.min_quantity > 1) {
          // Only alert at min if min is meaningful (>1)
          smartAlerts.push({ row: r, reason: `At minimum (${r.quantity} ${r.unit})`, urgency: "low" });
        }
      }

      if (smartAlerts.length > 0) {
        const high = smartAlerts.filter((a) => a.urgency === "high");
        const med = smartAlerts.filter((a) => a.urgency === "medium");

        if (high.length > 0) {
          addNotification({
            type: "error",
            title: "Urgent: Stock Running Out",
            message: high.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (high.length > 3 ? ` +${high.length - 3} more` : ""),
            duration: 10000,
          });
        }
        if (med.length > 0) {
          addNotification({
            type: "warning",
            title: "Stock Getting Low",
            message: med.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (med.length > 3 ? ` +${med.length - 3} more` : ""),
            duration: 8000,
          });
        }
      }

      const expiringItems = mapped.filter((r) => r.best_before_date && daysUntil(r.best_before_date) <= 3 && daysUntil(r.best_before_date) >= 0);
      if (expiringItems.length > 0) {
        addNotification({
          type: "warning",
          title: "Expiring Soon",
          message: `${expiringItems.length} item${expiringItems.length > 1 ? "s" : ""} expiring soon: ${expiringItems.slice(0, 3).map((r) => r.product_name).join(", ")}`,
          duration: 8000,
        });
      }

      const expiredItems = mapped.filter((r) => r.best_before_date && daysUntil(r.best_before_date) < 0);
      if (expiredItems.length > 0) {
        addNotification({
          type: "error",
          title: "Expired Items",
          message: `${expiredItems.length} item${expiredItems.length > 1 ? "s" : ""} expired: ${expiredItems.slice(0, 3).map((r) => r.product_name).join(", ")}`,
          duration: 10000,
        });
      }
    }
    setLoading(false);
  }

  async function fetchLocations() {
    const { data } = await supabase.from("locations").select("*").order("name");
    if (data) setAllLocations(data as Location[]);
  }

  async function fetchGroups() {
    const { data } = await supabase.from("product_groups").select("*").order("name");
    if (data) setAllGroups(data as ProductGroup[]);
  }

  async function fetchInventoryValue() {
    const { data } = await supabase
      .from("transactions")
      .select("unit_price, quantity_change, stock_item_id")
      .not("unit_price", "is", null);
    if (data && data.length > 0) {
      let total = 0;
      for (const t of data) {
        if (t.unit_price && t.quantity_change > 0) {
          total += t.unit_price * t.quantity_change;
        }
      }
      setInventoryValue(total);
    }
  }

  async function fetchRecentTransactions() {
    const { data } = await supabase
      .from("transactions")
      .select(`
        id, type, quantity_change, created_at, note, unit_price, store_id,
        stock_item_id,
        stock_items!inner(product_id, product_library!inner(name, image_url)),
        stores(name)
      `)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setRecentTransactions(data as any[]);
  }

  useEffect(() => {
    fetchStock();
    fetchLocations();
    fetchRecentTransactions();
    fetchGroups();
    fetchInventoryValue();
  }, []);

  const lowRows = rows.filter((r) => {
    if (selectedGroup !== "all" && r.product_group_id !== selectedGroup) return false;
    if (r.avg_daily_consumption && r.avg_daily_consumption > 0) {
      return r.quantity / r.avg_daily_consumption <= 3;
    }
    if (r.best_before_date) {
      const days = daysUntil(r.best_before_date);
      if (days <= 3) return true;
    }
    if (r.quantity < r.min_quantity) return true;
    return false;
  });

  const filteredRows = selectedGroup === "all" ? rows : rows.filter((r) => r.product_group_id === selectedGroup);

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
        setErrorMsg(`Cannot use ${Math.abs(delta)} - only ${row.quantity} ${row.unit} available.`);
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
      fetchStock();
    }
  }

  async function assignLocation(stockItemId: string, locationId: string | null) {
    setActivatingLocation(stockItemId);
    setErrorMsg(null);
    const {error} = await supabase.from("stock_items").update({location_id: locationId}).eq("id", stockItemId);
    if (error) setErrorMsg(error.message);
    setActivatingLocation(null);
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

      {!loading && inventoryValue !== null && inventoryValue > 0 && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">Inventory value: <span className="font-semibold">${inventoryValue.toFixed(2)}</span></span>
        </div>
      )}

      {allGroups.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-slate-400" />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All groups</option>
            {allGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/20 border border-red-800/30 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">x</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} radius={4} index={i} />
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
                  onDelete={() => showConfirm({
                    title: `Delete "${row.product_name}"?`,
                    description: "This will permanently remove the stock entry. Transactions are preserved.",
                    actionLabel: "Delete",
                    onAction: () => deleteStockItem(row.stock_item_id),
                  })}
                  saving={saving}
                  locations={allLocations}
                  onAssignLocation={(locId) => assignLocation(row.stock_item_id, locId)}
                  activatingLocation={activatingLocation}
                  visibleFields={settings.visible_fields}
                />
              ))}
            </div>
          )}

          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-300 transition py-2">
              <Package className="w-4 h-4" />
              All Stock ({filteredRows.length})
              <Plus className="w-3 h-3 ml-auto group-open:rotate-45 transition" />
            </summary>
            <div className="space-y-2 mt-2">
              {filteredRows.map((row) => (
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
                  onDelete={() => showConfirm({
                    title: `Delete "${row.product_name}"?`,
                    description: "This will permanently remove the stock entry. Transactions are preserved.",
                    actionLabel: "Delete",
                    onAction: () => deleteStockItem(row.stock_item_id),
                  })}
                  saving={saving}
                  locations={allLocations}
                  onAssignLocation={(locId) => assignLocation(row.stock_item_id, locId)}
                  activatingLocation={activatingLocation}
                  visibleFields={settings.visible_fields}
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
                        <p className="text-[10px] text-slate-600 truncate">
                          {t.note || t.type}
                          {t.stores?.name ? ` · ${t.stores.name}` : ""}
                        </p>
                      </div>
                      <p className={"text-sm font-mono " + icon}>
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
  locations,
  onAssignLocation,
  activatingLocation,
  visibleFields,
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
  locations: Location[];
  onAssignLocation: (locationId: string | null) => void;
  activatingLocation: string | null;
  visibleFields: FieldId[];
}) {
  const isEditing = editingId === row.stock_item_id;
  const isUrgent = row.estimated_days_remaining !== null && row.estimated_days_remaining <= 2;
  const isWarning = row.estimated_days_remaining !== null && row.estimated_days_remaining > 2;

  return (
    <Card
      padding={0}
      variant={isLow && isUrgent ? "red" : isLow && isWarning ? "orange" : "default"}
    >
      <div className="p-3 flex items-center gap-3">
        {visibleFields.includes("image") && (
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
        )}

        <div className="min-w-0 flex-1">
          {visibleFields.includes("name") && (
            <p className="font-medium text-sm truncate">{row.product_name}</p>
          )}
          {visibleFields.includes("category") && (
            <p className="text-xs text-slate-500 truncate">
              {row.category || "\u00a0"}
            </p>
          )}
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

      {!isEditing && (
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          {visibleFields.includes("days_left") && row.estimated_days_remaining !== null && (
            <span className={"text-xs flex items-center gap-1 " + (isUrgent ? "text-red-400" : "text-amber-400")}>
              <Clock className="w-3 h-3" />
              ~{row.estimated_days_remaining < 1 ? "<1" : row.estimated_days_remaining} day{row.estimated_days_remaining !== 1 ? "s" : ""} left
            </span>
          )}
          {visibleFields.includes("location") && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {activatingLocation === row.stock_item_id ? (
                <span className="text-slate-400">Saving...</span>
              ) : (
                <select
                  value={row.location_name ? row.location_name : ""}
                  onChange={(e) => onAssignLocation(e.target.value || null)}
                  className="bg-transparent border-none text-xs text-slate-400 cursor-pointer outline-none"
                >
                  <option value="">{row.location_name || "No location"}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id} selected={row.location_name === l.name}>{l.name}</option>
                  ))}
                </select>
              )}
            </span>
          )}
          {visibleFields.includes("best_before") && row.best_before_date && (() => {
            const days = daysUntil(row.best_before_date);
            const expired = days < 0;
            const soon = days <= 3;
            return (
              <span className={`text-xs flex items-center gap-1 ${expired ? "text-red-400" : soon ? "text-amber-400" : "text-slate-500"}`}>
                <Calendar className="w-3 h-3" />
                {expired ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : days <= 3 ? `Expires in ${days}d` : `Exp: ${row.best_before_date}`}
              </span>
            );
          })()}
          {visibleFields.includes("consumption") && row.avg_daily_consumption != null && row.avg_daily_consumption > 0 && (
            <Badge label={`${row.avg_daily_consumption} ${row.unit}/day`} />
          )}
          {visibleFields.includes("min_quantity") && row.min_quantity > 0 && (
            <Badge label={`min ${row.min_quantity}`} />
          )}
          {visibleFields.includes("last_restocked") && row.last_restocked_at && (
            <span className="text-[10px] text-slate-600">
              Restocked {new Date(row.last_restocked_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
