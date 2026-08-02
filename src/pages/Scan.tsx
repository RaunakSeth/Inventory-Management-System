import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BillScanner } from "../components/BillScanner";
import { ProductQuickAdd } from "../components/ProductQuickAdd";
import { identifyProductFromPhoto, friendlyAIError } from "../lib/edgeFunctions";
import { useNotifications } from "../components/Notifications";
import { supabase } from "../lib/supabase";
import type { ProductLookupResult, Store, QuantityUnit } from "../lib/types";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { ScanLine, Receipt, Camera, PenLine } from "lucide-react";

type Mode = "barcode" | "bill" | "manual";

export function Scan() {
  const [mode, setMode] = useState<Mode>("barcode");
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-2">
        <Camera className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Scan</h1>
      </div>

      <SegmentedControl
        label="Add mode"
        value={mode}
        onChange={(v) => { setMode(v as Mode); setScannedCode(null); }}
        layout="fill"
      >
        <SegmentedControlItem value="barcode" label="Barcode" icon={<ScanLine className="w-4 h-4" />} />
        <SegmentedControlItem value="manual" label="Manual" icon={<PenLine className="w-4 h-4" />} />
        <SegmentedControlItem value="bill" label="Bill" icon={<Receipt className="w-4 h-4" />} />
      </SegmentedControl>

      {mode === "barcode" &&
        (scannedCode ? (
          <ProductQuickAdd barcode={scannedCode} onDone={() => setScannedCode(null)} />
        ) : (
          <BarcodeScanner active={mode === "barcode"} onDetected={setScannedCode} />
        ))}

      {mode === "manual" && <ManualAdd onDone={() => setScannedCode(null)} />}

      {mode === "bill" && <BillScanner />}
    </div>
  );
}

function ManualAdd({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<"form" | "identifying" | "saving">("form");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState(1);
  const [minQuantity, setMinQuantity] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [bestBeforeDate, setBestBeforeDate] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [stores, setStores] = useState<Store[]>([]);
  const [units, setUnits] = useState<QuantityUnit[]>([]);
  const webcamRef = useRef<Webcam>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useNotifications();

  useEffect(() => {
    supabase.from("stores").select("*").order("name").then(({ data }) => setStores(data ?? []));
    supabase.from("quantity_units").select("*").order("name").then(({ data }) => setUnits(data ?? []));
  }, []);

  async function identifyFromCamera() {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    setStage("identifying");
    setAiSuggestion(null);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const res = await identifyProductFromPhoto(blob);
      setName(res.name ?? "");
      setCategory(res.category ?? "");
      setImageUrl(res.image_url ?? null);
      setUnit(res.likely_unit ?? "pcs");
      setStage("form");
    } catch (err) {
      const { title, detail } = friendlyAIError(err);
      addNotification({ type: "error", title, message: detail });
      setErrorMsg(detail);
      setAiSuggestion(detail);
      setStage("form");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function saveItem() {
    if (!name.trim()) { setErrorMsg("Product name is required."); return; }
    setStage("saving");
    setErrorMsg(null);
    try {
      const { data: product, error: productErr } = await supabase
        .from("product_library")
        .insert({
          name: name.trim(),
          brand: brand || null,
          category: category || null,
          default_unit: unit,
          image_url: imageUrl,
          source: "manual",
        })
        .select()
        .single();
      if (productErr) throw productErr;

      const { data: stock, error: stockErr } = await supabase.from("stock_items").insert({
        product_id: product.id,
        unit,
        min_quantity: minQuantity,
        best_before_date: bestBeforeDate || null,
      }).select().single();
      if (stockErr) throw stockErr;

      await supabase.from("transactions").insert({
        stock_item_id: stock.id,
        type: "restock",
        quantity_change: quantity,
        note: "Manual add",
        store_id: storeId || null,
        unit_price: unitPrice ? Number(unitPrice) : null,
      });

      onDone();
      setName(""); setCategory(""); setBrand(""); setImageUrl(null); setBestBeforeDate("");
      setQuantity(1); setMinQuantity(1); setUnit("pcs");
      setStage("form");
    } catch (err) {
      setErrorMsg((err as any)?.message ?? String(err));
      setStage("form");
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4 rounded-xl bg-slate-900 p-4 md:p-5">
      <p className="text-sm font-medium text-slate-300">Add product manually</p>

      <TextInput
        label="Name *"
        value={name}
        onChange={setName}
        placeholder="e.g. Bananas, Cooking oil, Detergent..."
        isRequired
      />

      <div className="flex flex-col sm:flex-row sm:gap-3">
        <TextInput label="Category" value={category} onChange={setCategory} placeholder="Produce, Cleaning..." />
        <TextInput label="Brand" value={brand} onChange={setBrand} />
      </div>

      <div className="flex flex-col sm:flex-row sm:gap-3">
        <div className="flex-1">
          <Selector
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={[
              ...units.map((u) => ({ value: u.name, label: u.name })),
              ...(units.some((u) => u.name === "pcs") ? [] : [{ value: "pcs", label: "pcs" }]),
            ]}
            width="100%"
          />
        </div>
        <NumberInput
          label="Qty"
          value={quantity}
          onChange={(val) => setQuantity(val ?? 1)}
          min={0}
        />
        <NumberInput
          label="Reorder at"
          value={minQuantity}
          onChange={(val) => setMinQuantity(val ?? 1)}
          min={0}
        />
      </div>

      <label className="block text-sm text-slate-400">
        Best before (optional)
        <input
          type="date"
          className="w-full mt-1 rounded bg-slate-800 px-2 py-1 text-sm"
          value={bestBeforeDate}
          onChange={(e) => setBestBeforeDate(e.target.value)}
        />
      </label>

      <div className="flex flex-col sm:flex-row sm:gap-3">
        <div className="flex-1">
          <Selector
            label="Store (optional)"
            value={storeId}
            onChange={(v) => setStoreId(v ?? "")}
            hasClear
            placeholder="None"
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            width="100%"
          />
        </div>
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

      <div className="space-y-2">
        <p className="text-sm text-slate-400">Photo (optional)</p>
        <div className="rounded-lg overflow-hidden bg-black">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "environment" }}
            className="w-full"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            label={stage === "identifying" ? "Identifying..." : "Snap & identify"}
            variant="primary"
            isLoading={stage === "identifying"}
            onClick={identifyFromCamera}
            width="100%"
          />
          <Button
            label="Upload"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
        {imageUrl && (
          <img src={imageUrl} alt="Preview" className="w-20 h-20 rounded object-cover mt-1" />
        )}
      </div>

      {errorMsg && <Banner status="error" title={errorMsg} />}

      <Button
        label={stage === "saving" ? "Saving..." : "Add to stock"}
        variant="primary"
        isLoading={stage === "saving"}
        isDisabled={!name.trim()}
        onClick={saveItem}
        width="100%"
      />
    </div>
  );
}
