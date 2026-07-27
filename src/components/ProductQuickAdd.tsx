import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { identifyProductFromPhoto, lookupProductByBarcode, friendlyAIError } from "../lib/edgeFunctions";
import { useNotifications } from "./Notifications";
import { supabase } from "../lib/supabase";
import type { ProductLookupResult, Store, QuantityUnit } from "../lib/types";

interface Props {
  barcode: string;
  onDone: () => void;
}

export function ProductQuickAdd({ barcode, onDone }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"looking_up" | "confirm" | "needs_photo" | "saving">(
    "looking_up"
  );
  const [result, setResult] = useState<ProductLookupResult | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState(1);
  const [minQuantity, setMinQuantity] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [bestBeforeDate, setBestBeforeDate] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [stores, setStores] = useState<Store[]>([]);
  const [units, setUnits] = useState<QuantityUnit[]>([]);
  const { addNotification } = useNotifications();

  useEffect(() => {
    supabase.from("stores").select("*").order("name").then(({ data }) => setStores(data ?? []));
    supabase.from("quantity_units").select("*").order("name").then(({ data }) => setUnits(data ?? []));
  }, []);

  useEffect(() => {
    lookupProductByBarcode(barcode)
      .then((res) => {
        setResult(res);
        if (res.found) {
          setName(res.name ?? "");
          setUnit(res.likely_unit ?? "pcs");
          setImageUrl(res.image_url ?? null);
          setCategory(res.category ?? "");
          setBrand(res.brand ?? "");
          setStage("confirm");
        } else {
          setStage("needs_photo");
        }
      })
      .catch((err) => setErrorMsg(err?.message ?? String(err)));
  }, [barcode]);

  async function identifyFromCamera() {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    setStage("saving");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const res = await identifyProductFromPhoto(blob);
      setResult(res);
      setName(res.name ?? "");
      setCategory(res.category ?? "");
      setBrand(res.brand ?? "");
      setUnit(res.likely_unit ?? "pcs");
      setImageUrl(res.image_url ?? null);
      setStage("confirm");
    } catch (err) {
      const { title, detail } = friendlyAIError(err);
      addNotification({ type: "error", title, message: detail });
      setErrorMsg(detail);
      setStage("needs_photo");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function saveAndRestock() {
    if (!name.trim()) { setErrorMsg("Product name is required."); return; }
    setStage("saving");
    setErrorMsg(null);
    try {
      const { data: product, error: productErr } = await supabase
        .from("product_library")
        .upsert(
          {
            barcode,
            name: name.trim(),
            brand: brand || null,
            category: category || null,
            default_unit: unit,
            image_url: imageUrl,
            source: result?.source ?? "manual",
          },
          { onConflict: "barcode" }
        )
        .select()
        .single();
      if (productErr) throw productErr;

      const { data: stockItem } = await supabase
        .from("stock_items")
        .select("id")
        .eq("product_id", product.id)
        .maybeSingle();

      let stockItemId = stockItem?.id;
      if (!stockItemId) {
        const { data: newStock, error: stockErr } = await supabase
          .from("stock_items")
          .insert({
            product_id: product.id,
            unit,
            min_quantity: minQuantity,
            best_before_date: bestBeforeDate || null,
          })
          .select()
          .single();
        if (stockErr) throw stockErr;
        stockItemId = newStock.id;
      }

      await supabase.from("transactions").insert({
        stock_item_id: stockItemId,
        type: "restock",
        quantity_change: quantity,
        note: "Quick-add via barcode scan",
        store_id: storeId || null,
        unit_price: unitPrice ? Number(unitPrice) : null,
      });

      onDone();
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
      setStage("confirm");
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-3 rounded-xl bg-slate-900 p-4">
      <p className="text-xs text-slate-500">Barcode: {barcode}</p>

      {stage === "looking_up" && <p>Looking up product…</p>}

      {stage === "needs_photo" && (
        <div className="space-y-2">
          <p className="text-sm text-amber-400">
            Not found in Open Food Facts. Snap a photo or upload one, or enter details manually.
          </p>
          <div className="rounded-lg overflow-hidden bg-black">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "environment" }}
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={identifyFromCamera} className="flex-1 py-2 rounded-lg bg-emerald-500 text-sm">
              Snap & identify
            </button>
            <button onClick={() => fileRef.current?.click()} className="py-2 px-3 rounded-lg bg-slate-800 text-sm">
              Upload
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </div>
          {imageUrl && <img src={imageUrl} alt="Preview" className="w-16 h-16 rounded object-cover" />}
          <button
            onClick={() => setStage("confirm")}
            className="w-full py-2 rounded-lg bg-slate-800 text-sm"
          >
            Skip — enter manually instead
          </button>
        </div>
      )}

      {(stage === "confirm" || stage === "saving") && (
        <div className="space-y-2">
          <label className="block text-sm">
            Name *
            <input
              className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1 text-sm">
              Category
              <input
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Grains, Dairy..."
              />
            </label>
            <label className="flex-1 text-sm">
              Brand
              <input
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <label className="flex-1 text-sm">
              Unit
              <select
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
                <option value="pcs">pcs</option>
              </select>
            </label>
            <label className="flex-1 text-sm">
              Qty to add
              <input
                type="number"
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <label className="flex-1 text-sm">
              Reorder at
              <input
                type="number"
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={minQuantity}
                onChange={(e) => setMinQuantity(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="block text-sm">
            Best before (optional)
            <input
              type="date"
              className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
              value={bestBeforeDate}
              onChange={(e) => setBestBeforeDate(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1 text-sm">
              Store (optional)
              <select
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">None</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-sm">
              Unit price (optional)
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          {imageUrl && <img src={imageUrl} alt="Preview" className="w-16 h-16 rounded object-cover" />}
          <button
            onClick={saveAndRestock}
            disabled={stage === "saving" || !name.trim()}
            className="w-full py-2 rounded-lg bg-emerald-500 disabled:opacity-50"
          >
            {stage === "saving" ? "Saving…" : "Save & add to stock"}
          </button>
        </div>
      )}

      {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
    </div>
  );
}
