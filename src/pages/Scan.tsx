import { useState, useRef } from "react";
import Webcam from "react-webcam";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BillScanner } from "../components/BillScanner";
import { ProductQuickAdd } from "../components/ProductQuickAdd";
import { identifyProductFromPhoto } from "../lib/edgeFunctions";
import { supabase } from "../lib/supabase";
import type { ProductLookupResult } from "../lib/types";
import { ScanLine, Receipt, Camera, PenLine } from "lucide-react";

type Mode = "barcode" | "bill" | "manual";

export function Scan() {
  const [mode, setMode] = useState<Mode>("barcode");
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-3 mb-2">
        <Camera className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Scan</h1>
      </div>

      <div className="flex gap-2 bg-slate-900 rounded-xl p-1 border border-slate-800">
        <button
          onClick={() => { setMode("barcode"); setScannedCode(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
            mode === "barcode" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <ScanLine className="w-4 h-4" />
          Barcode
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
            mode === "manual" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <PenLine className="w-4 h-4" />
          Manual
        </button>
        <button
          onClick={() => setMode("bill")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
            mode === "bill" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <Receipt className="w-4 h-4" />
          Bill
        </button>
      </div>

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function identifyFromCamera() {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    setStage("identifying");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const res = await identifyProductFromPhoto(blob);
      setName(res.name ?? "");
      setCategory(res.category ?? "");
      setImageUrl(res.image_url ?? null);
      setUnit(res.likely_unit ?? "pcs");
      setStage("form");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
      }).select().single();
      if (stockErr) throw stockErr;

      await supabase.from("transactions").insert({
        stock_item_id: stock.id,
        type: "restock",
        quantity_change: quantity,
        note: "Manual add",
      });

      onDone();
      setName(""); setCategory(""); setBrand(""); setImageUrl(null);
      setQuantity(1); setMinQuantity(1); setUnit("pcs");
      setStage("form");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStage("form");
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-3 rounded-xl bg-slate-900 p-4">
      <p className="text-sm font-medium text-slate-300">Add product manually</p>

      <label className="block text-sm">
        Name *
        <input
          className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bananas, Cooking oil, Detergent..."
        />
      </label>

      <div className="flex gap-2">
        <label className="flex-1 text-sm">
          Category
          <input
            className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Produce, Cleaning..."
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
          <input
            className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label className="flex-1 text-sm">
          Qty
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

      <div className="space-y-1">
        <p className="text-sm text-slate-400">Photo (optional)</p>
        <div className="rounded-lg overflow-hidden bg-black">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "environment" }}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={identifyFromCamera} disabled={stage === "identifying"} className="flex-1 py-2 rounded-lg bg-emerald-600 text-sm disabled:opacity-50">
            {stage === "identifying" ? "Identifying..." : "Snap & identify"}
          </button>
          <button onClick={() => fileRef.current?.click()} className="py-2 px-3 rounded-lg bg-slate-800 text-sm">
            Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
        {imageUrl && (
          <img src={imageUrl} alt="Preview" className="w-20 h-20 rounded object-cover mt-1" />
        )}
      </div>

      {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}

      <button
        onClick={saveItem}
        disabled={stage === "saving" || !name.trim()}
        className="w-full py-2.5 rounded-lg bg-emerald-500 font-medium disabled:opacity-50"
      >
        {stage === "saving" ? "Saving..." : "Add to stock"}
      </button>
    </div>
  );
}
