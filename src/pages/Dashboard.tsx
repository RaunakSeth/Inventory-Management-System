import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNotifications } from "../components/Notifications";
import { useConfirm } from "../components/ConfirmDialog";
import { ProductEditorDialog } from "../components/ProductEditorDialog";
import { useSettings, type FieldId } from "../lib/settings";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Banner } from "@astryxdesign/core/Banner";
import { Selector } from "@astryxdesign/core/Selector";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Section } from "@astryxdesign/core/Section";
import { List } from "@astryxdesign/core/List";
import { ListItem } from "@astryxdesign/core/List";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { AlertTriangle, Clock, Package, Plus, Minus, Trash2, AlertCircle, History, MapPin, Calendar, Store, DollarSign, Tag, IndianRupee } from "lucide-react";
import { useCurrency, formatMoney } from "../lib/currency";
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
  location_id: string | null;
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
  const { currency, convertFromBase } = useCurrency();
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
  const [tagList, setTagList] = useState<{ id: string; name: string; color: string }[]>([]);
  const [editProduct, setEditProduct] = useState<StockRow | null>(null);
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const alertedRef = useRef(false);

  async function fetchStock() {
    setLoading(true);
    const { data } = await supabase
      .from("stock_items")
      .select(`
        id, product_id, quantity, unit, min_quantity, location_id,
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
          location_id: r.location_id ?? null,
          image_url: r.product_library?.image_url ?? null,
          best_before_date: r.best_before_date ?? null,
          last_restocked_at: r.last_restocked_at ?? null,
          product_group_id: r.product_library?.product_group_id ?? null,
        };
      });
      setRows(mapped);

      // Smart notifications — only alert when stock is actually running out.
      // Deduped by item (expiry beats stock) and fired once per page load.
      const alerts: { row: StockRow; reason: string; urgency: "high" | "medium" | "low"; kind: "stock" | "expiry" }[] = [];

      for (const r of mapped) {
        // 1. Expiry first — it's more time-critical than low stock
        if (r.best_before_date) {
          const days = daysUntil(r.best_before_date);
          if (days < 0) {
            alerts.push({ row: r, reason: `Expired ${Math.abs(days)}d ago`, urgency: "high", kind: "expiry" });
            continue;
          }
          if (days <= 2) {
            alerts.push({ row: r, reason: days === 0 ? "Expires today" : `Expires in ${days}d`, urgency: "high", kind: "expiry" });
            continue;
          }
          if (days <= settings.notifications_days_before_expiry) {
            alerts.push({ row: r, reason: `Expires in ${days}d`, urgency: "medium", kind: "expiry" });
            continue;
          }
        }

        // 2. Has consumption data → use days remaining
        if (r.avg_daily_consumption && r.avg_daily_consumption > 0) {
          const daysLeft = r.quantity / r.avg_daily_consumption;
          if (daysLeft <= 1) {
            alerts.push({ row: r, reason: `Runs out today/tomorrow (${Math.round(daysLeft * 10) / 10}d left)`, urgency: "high", kind: "stock" });
            continue;
          }
          if (daysLeft <= 3) {
            alerts.push({ row: r, reason: `${Math.round(daysLeft)}d of supply left`, urgency: "medium", kind: "stock" });
            continue;
          }
        }

        // 3. No consumption data — only alert if significantly below min
        if (r.quantity < r.min_quantity) {
          alerts.push({ row: r, reason: `Only ${r.quantity} ${r.unit} left (min: ${r.min_quantity})`, urgency: "medium", kind: "stock" });
        } else if (r.quantity === r.min_quantity && r.min_quantity > 1) {
          alerts.push({ row: r, reason: `At minimum (${r.quantity} ${r.unit})`, urgency: "low", kind: "stock" });
        }
      }

      if (alerts.length > 0 && !alertedRef.current) {
        alertedRef.current = true;
        const stockAlerts = settings.notifications_low_stock ? alerts.filter((a) => a.kind === "stock") : [];
        const expiryAlerts = settings.notifications_expiring ? alerts.filter((a) => a.kind === "expiry") : [];

        const highStock = stockAlerts.filter((a) => a.urgency === "high");
        const medStock = stockAlerts.filter((a) => a.urgency === "medium" || a.urgency === "low");
        const highExpiry = expiryAlerts.filter((a) => a.urgency === "high");
        const medExpiry = expiryAlerts.filter((a) => a.urgency === "medium" || a.urgency === "low");

        if (highStock.length > 0) {
          addNotification({
            type: "error",
            title: "Urgent: Stock Running Out",
            message: highStock.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (highStock.length > 3 ? ` +${highStock.length - 3} more` : ""),
            duration: 10000,
          });
        }
        if (medStock.length > 0) {
          addNotification({
            type: "warning",
            title: "Stock Getting Low",
            message: medStock.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (medStock.length > 3 ? ` +${medStock.length - 3} more` : ""),
            duration: 8000,
          });
        }
        if (highExpiry.length > 0) {
          addNotification({
            type: "error",
            title: "Expired or Expiring Now",
            message: highExpiry.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (highExpiry.length > 3 ? ` +${highExpiry.length - 3} more` : ""),
            duration: 10000,
          });
        }
        if (medExpiry.length > 0) {
          addNotification({
            type: "warning",
            title: "Expiring Soon",
            message: medExpiry.slice(0, 3).map((a) => `${a.row.product_name}: ${a.reason}`).join(", ") + (medExpiry.length > 3 ? ` +${medExpiry.length - 3} more` : ""),
            duration: 8000,
          });
        }
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

  async function fetchTags() {
    const { data } = await supabase.from("tags").select("*").order("name");
    if (data) setTagList(data as { id: string; name: string; color: string }[]);
  }

  async function fetchInventoryValue() {
    const [{ data: stocks }, { data: prices }] = await Promise.all([
      supabase.from("stock_items").select("id, quantity"),
      supabase.from("transactions")
        .select("stock_item_id, unit_price")
        .not("unit_price", "is", null)
        .order("created_at", { ascending: false }),
    ]);
    if (!stocks || !prices) return;
    // Latest recorded price per stock item
    const latestPrice = new Map<string, number>();
    for (const t of prices as any[]) {
      if (t.unit_price != null && !latestPrice.has(t.stock_item_id)) {
        latestPrice.set(t.stock_item_id, t.unit_price);
      }
    }
    let total = 0;
    for (const s of stocks as any[]) {
      const p = latestPrice.get(s.id);
      if (p != null) total += s.quantity * p;
    }
    setInventoryValue(total);
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
    fetchTags();
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
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto pb-24">
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
          {currency === "INR" ? <IndianRupee className="w-4 h-4 text-emerald-400" /> : <DollarSign className="w-4 h-4 text-emerald-400" />}
          <span className="text-sm text-emerald-300">Inventory value: <span className="font-semibold">{formatMoney(convertFromBase(inventoryValue ?? 0), currency)}</span></span>
        </div>
      )}

      {allGroups.length > 0 && (
        <div className="flex items-center gap-3">
          <Tag className="w-4 h-4 text-slate-400" />
          <Selector
            label="Product group"
            isLabelHidden
            size="sm"
            value={selectedGroup}
            onChange={setSelectedGroup}
            options={[{ value: "all", label: "All groups" }, ...allGroups.map((g) => ({ value: g.id, label: g.name }))]}
          />
        </div>
      )}

      {errorMsg && (
        <Banner
          status="error"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} radius={4} index={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No stock yet"
          description="Scan a barcode or a bill to add your first item."
          icon={<Package />}
        />
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
                  onEditProduct={() => setEditProduct(row)}
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

          <Collapsible
            trigger={<span className="flex items-center gap-2 text-sm"><Package className="w-4 h-4" /> All Stock ({filteredRows.length})</span>}
            defaultIsOpen={false}
          >
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
                  onEditProduct={() => setEditProduct(row)}
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
          </Collapsible>

          {recentTransactions.length > 0 && (
            <Section variant="muted" padding={3}>
              <List hasDividers>
                {recentTransactions.map((t: any) => {
                  const p = t.stock_items?.product_library;
                  const icon = t.type === "restock" || t.quantity_change > 0 ? "text-emerald-400" : "text-red-400";
                  const label = t.quantity_change > 0 ? "+" : "";
                  return (
                    <ListItem
                      key={t.id}
                      label={p?.name ?? "(unknown)"}
                      description={`${t.note || t.type}${t.stores?.name ? ` · ${t.stores.name}` : ""}`}
                      startContent={
                        <Thumbnail
                          src={p?.image_url || FALLBACK_IMG}
                          alt={p?.name ?? ""}
                          label={p?.name ?? ""}
                          className="w-8 h-8"
                        />
                      }
                      endContent={
                        <span className={"text-sm font-mono " + icon}>
                          {label}{t.quantity_change}
                        </span>
                      }
                    />
                  );
                })}
              </List>
            </Section>
          )}
        </>
      )}

      <ProductEditorDialog
        open={!!editProduct}
        product={editProduct ? {
          id: editProduct.product_id,
          name: editProduct.product_name,
          category: editProduct.category,
          brand: editProduct.brand,
          default_unit: editProduct.unit,
          barcode: editProduct.barcode,
          image_url: editProduct.image_url,
          product_group_id: editProduct.product_group_id,
        } : {
          id: "", name: "", category: null, brand: null,
          default_unit: "pcs", barcode: null, image_url: null, product_group_id: null,
        }}
        tags={tagList}
        groups={allGroups}
        onOpenChange={(v) => { if (!v) setEditProduct(null); }}
        onTagsChanged={fetchTags}
        onUpdated={fetchStock}
      />
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
  onEditProduct,
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
  onEditProduct: () => void;
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
      <div className="p-3 md:p-4 flex items-center gap-3">
        {visibleFields.includes("image") && (
          <Thumbnail
            src={row.image_url || FALLBACK_IMG}
            alt={row.product_name}
            label={row.product_name}
            className="w-10 h-10 md:w-11 md:h-11"
          />
        )}

        <button
          type="button"
          onClick={onEditProduct}
          className="min-w-0 flex-1 text-left group"
        >
          {visibleFields.includes("name") && (
            <p className="font-medium text-sm truncate group-hover:text-emerald-400 transition">
              {row.product_name}
            </p>
          )}
          {visibleFields.includes("category") && (
            <p className="text-xs text-slate-500 truncate">
              {row.category || "\u00a0"}
            </p>
          )}
        </button>

        {isEditing ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
            <NumberInput
              label="Quantity"
              isLabelHidden
              size="sm"
              min={0}
              value={editQty}
              onChange={(v) => setEditQty(v ?? 0)}
              width={80}
            />
            <TextInput
              label="Unit"
              isLabelHidden
              size="sm"
              value={editUnit}
              onChange={setEditUnit}
              width={72}
            />
            <Button
              label="Save"
              size="sm"
              variant="primary"
              isLoading={saving}
              onClick={onSaveEdit}
            />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <IconButton
              icon={<Minus className="w-3 h-3" />}
              label="Use 1"
              size="sm"
              onClick={() => onQuickAdjust(-1)}
            />
            <button onClick={onStartEdit} className="text-right hover:text-emerald-400 transition px-1" aria-label={`Edit ${row.product_name} quantity`}>
              <p className="text-sm font-semibold leading-none">{row.quantity}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{row.unit}</p>
            </button>
            <IconButton
              icon={<Plus className="w-3 h-3" />}
              label="Add 1"
              size="sm"
              onClick={() => onQuickAdjust(1)}
            />
            <IconButton
              icon={<Trash2 className="w-3 h-3" />}
              label="Delete item"
              size="sm"
              variant="destructive"
              onClick={onDelete}
            />
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="px-3 md:px-4 pb-2 md:pb-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
          {visibleFields.includes("days_left") && row.estimated_days_remaining !== null && (
            <span className={"text-xs flex items-center gap-1 " + (isUrgent ? "text-red-400" : "text-amber-400")}>
              <StatusDot variant={isUrgent ? "error" : "warning"} label={isUrgent ? "Urgent" : "Low"} />
              ~{row.estimated_days_remaining < 1 ? "<1" : row.estimated_days_remaining} day{row.estimated_days_remaining !== 1 ? "s" : ""} left
            </span>
          )}
          {visibleFields.includes("location") && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {activatingLocation === row.stock_item_id ? (
                <span className="text-slate-400">Saving...</span>
              ) : (
                <Selector
                  label="Location"
                  isLabelHidden
                  size="sm"
                  value={row.location_id ?? ""}
                  onChange={(v) => onAssignLocation(v || null)}
                  options={[
                    { value: "", label: "No location" },
                    ...locations.map((l) => ({ value: l.id, label: l.name })),
                  ]}
                />
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
