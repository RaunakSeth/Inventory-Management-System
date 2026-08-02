import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Section } from "@astryxdesign/core/Section";
import { ShoppingCart, Plus, Trash2, Check, ArrowRight } from "lucide-react";
import type { ShoppingListItem, Product, QuantityUnit } from "../lib/types";

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z'%3E%3C/path%3E%3Cline x1='3' y1='6' x2='21' y2='6'%3E%3C/line%3E%3Cpath d='M16 10a4 4 0 01-8 0'%3E%3C/path%3E%3C/svg%3E";

export function ShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemNote, setNewItemNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [addingToStock, setAddingToStock] = useState(false);
  const [units, setUnits] = useState<QuantityUnit[]>([]);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase
      .from("shopping_list")
      .select("*, product_library(id, name, image_url, default_unit)")
      .order("done")
      .order("created_at", { ascending: false });
    if (data) setItems(data as any[]);
    setLoading(false);
  }

  async function fetchProducts() {
    const { data } = await supabase.from("product_library").select("id, name, image_url, default_unit").order("name");
    if (data) setProducts(data as Product[]);
  }

  async function fetchUnits() {
    const { data } = await supabase.from("quantity_units").select("*").order("name");
    if (data) setUnits(data as QuantityUnit[]);
  }

  useEffect(() => {
    fetchItems();
    fetchProducts();
    fetchUnits();
  }, []);

  async function addItem() {
    setErrorMsg(null);
    const payload: any = {
      quantity: newItemQty,
      unit: newItemUnit,
      note: newItemNote || null,
    };
    if (selectedProduct) {
      payload.product_id = selectedProduct;
    } else if (newItemName.trim()) {
      payload.custom_name = newItemName.trim();
    } else {
      setErrorMsg("Enter a product name or select one");
      return;
    }

    const { error } = await supabase.from("shopping_list").insert(payload);
    if (error) setErrorMsg(error.message);
    else {
      setNewItemName("");
      setNewItemQty(1);
      setNewItemUnit("pcs");
      setNewItemNote("");
      setSelectedProduct("");
      setShowForm(false);
      fetchItems();
    }
  }

  async function toggleDone(id: string, current: boolean) {
    await supabase.from("shopping_list").update({ done: !current }).eq("id", id);
    fetchItems();
  }

  async function removeItem(id: string) {
    await supabase.from("shopping_list").delete().eq("id", id);
    fetchItems();
  }

  async function clearDone() {
    await supabase.from("shopping_list").delete().eq("done", true);
    fetchItems();
  }

  async function addLowStockToShopping() {
    const [{ data: allItems }, { data: existing }] = await Promise.all([
      supabase
        .from("stock_items")
        .select("id, product_id, quantity, unit, min_quantity, product_library(name)"),
      supabase.from("shopping_list").select("product_id").eq("done", false),
    ]);

    if (!allItems?.length) return;

    const alreadyPending = new Set((existing ?? []).map((e: any) => e.product_id));

    const lowItems = allItems.filter(
      (item: any) => item.quantity <= item.min_quantity && !alreadyPending.has(item.product_id)
    );
    if (!lowItems.length) return;

    const rows = lowItems.map((item: any) => ({
      product_id: item.product_id,
      quantity: Math.max(item.min_quantity - item.quantity, 1),
      unit: item.unit,
      note: `Low stock: ${item.quantity} ${item.unit} remaining`,
    }));

    await supabase.from("shopping_list").insert(rows);
    fetchItems();
  }

  async function addAllToStock() {
    setAddingToStock(true);
    const pending = items.filter((i) => !i.done && i.product_id);

    for (const item of pending) {
      const { data: stockItem } = await supabase
        .from("stock_items")
        .select("id")
        .eq("product_id", item.product_id)
        .maybeSingle();

      let stockItemId = stockItem?.id;
      if (!stockItemId) {
        const { data: newStock } = await supabase
          .from("stock_items")
          .insert({ product_id: item.product_id, unit: item.unit })
          .select()
          .single();
        stockItemId = newStock?.id;
      }

      if (stockItemId) {
        await supabase.from("transactions").insert({
          stock_item_id: stockItemId,
          type: "restock",
          quantity_change: item.quantity,
          note: "Added from shopping list",
        });
      }

      await supabase.from("shopping_list").update({ done: true }).eq("id", item.id);
    }

    setAddingToStock(false);
    fetchItems();
  }

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <ShoppingCart className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Shopping List</h1>
        {pending.length > 0 && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
            {pending.length}
          </span>
        )}
        <div className="ml-auto flex gap-3">
          <Button label="+ Low stock" size="sm" variant="secondary" onClick={addLowStockToShopping} />
          <IconButton icon={<Plus className="w-4 h-4" />} label="Add item" size="sm" onClick={() => setShowForm(!showForm)} />
        </div>
      </div>

      {errorMsg && (
        <Banner status="error" title={errorMsg} isDismissable onDismiss={() => setErrorMsg(null)} />
      )}

      {showForm && (
        <Section variant="muted" padding={4}>
          <Selector
            label="Product"
            value={selectedProduct}
            onChange={(v) => setSelectedProduct(v ?? "")}
            hasClear
            placeholder="Select existing product..."
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            width="100%"
          />
          {!selectedProduct && (
            <TextInput label="Or type a name" value={newItemName} onChange={setNewItemName} placeholder="e.g. Eggs" />
          )}
          <div className="flex gap-3">
            <NumberInput label="Qty" value={newItemQty} onChange={(val) => setNewItemQty(val ?? 1)} min={1} />
            <div className="flex-1">
              <Selector
                label="Unit"
                value={newItemUnit}
                onChange={setNewItemUnit}
                options={units.length > 0
                  ? units.map((u) => ({ value: u.name, label: u.name }))
                  : [{ value: "pcs", label: "pcs" }]}
                width="100%"
              />
            </div>
          </div>
          <TextInput label="Note" value={newItemNote} onChange={setNewItemNote} placeholder="Optional" />
          <div className="flex gap-3">
            <Button label="Add" variant="primary" onClick={addItem} width="100%" />
            <Button label="Cancel" variant="secondary" onClick={() => setShowForm(false)} />
          </div>
        </Section>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Shopping list is empty"
          description="Add items manually or tap '+ Low stock' to auto-fill."
          icon={<ShoppingCart />}
        />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-1">
              {pending.map((item) => (
                <ShoppingItemCard key={item.id} item={item} onToggle={() => toggleDone(item.id, item.done)} onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          )}

          {pending.length > 0 && done.length > 0 && (
            <Button
              label={addingToStock ? "Adding..." : "Add all to stock"}
              icon={!addingToStock ? <ArrowRight className="w-4 h-4" /> : undefined}
              variant="primary"
              onClick={addAllToStock}
              isDisabled={addingToStock}
              width="100%"
            />
          )}

          {done.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-300 transition py-2">
                <Check className="w-4 h-4" />
                Done ({done.length})
              </summary>
              <div className="space-y-1 mt-2">
                {done.map((item) => (
                  <ShoppingItemCard key={item.id} item={item} onToggle={() => toggleDone(item.id, item.done)} onRemove={() => removeItem(item.id)} />
                ))}
              </div>
              <Button label="Clear completed" variant="secondary" size="sm" onClick={clearDone} className="mt-2" />
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ShoppingItemCard({ item, onToggle, onRemove }: { item: any; onToggle: () => void; onRemove: () => void }) {
  const product = item.product_library;
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 md:px-4 py-3 border transition ${item.done ? "bg-slate-900/30 border-slate-800/30 opacity-50" : "bg-slate-900/80 border-slate-800/50"}`}>
      <button onClick={onToggle} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${item.done ? "bg-emerald-500 border-emerald-500" : "border-slate-600 hover:border-emerald-400"}`}>
        {item.done && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
        {product?.image_url ? (
          <img src={product.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <img src={FALLBACK_IMG} alt="" className="w-4 h-4 opacity-50" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${item.done ? "line-through" : ""}`}>
          {product?.name ?? item.custom_name}
        </p>
        {item.note && <p className="text-[10px] text-slate-600 truncate">{item.note}</p>}
      </div>
      <span className="text-xs text-slate-500 shrink-0">
        {item.quantity} {item.unit}
      </span>
      <IconButton icon={<Trash2 className="w-3 h-3" />} label="Remove item" size="sm" onClick={onRemove} />
    </div>
  );
}
