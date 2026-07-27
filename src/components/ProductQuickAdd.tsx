import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { identifyProductFromPhoto, lookupProductByBarcode, friendlyAIError } from "../lib/edgeFunctions";
import { useNotifications } from "./Notifications";
import { supabase } from "../lib/supabase";
import type { ProductLookupResult } from "../lib/types";

interface Props {
  barcode: string;
  onDone: () => void;
}

/**
 * Flow: barcode -> Open Food Facts lookup.
 *   found      -> pre-filled confirm form, "add stock" posts a restock transaction.
 *   not found  -> offers a photo capture, sent to Gemini vision to identify the
 *                 product instead. Either path ends by upserting product_library
 *                 (keyed on barcode) so the next scan is instant.
 */
export function ProductQuickAdd({ barcode, onDone }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const [stage, setStage] = useState<"looking_up" | "confirm" | "needs_photo" | "saving">(
    "looking_up"
  );
  const [result, setResult] = useState<ProductLookupResult | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState(1);
  const [minQuantity, setMinQuantity] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addNotification } = useNotifications();

  // Kick off the lookup once on mount.
  useEffect(() => {
    lookupProductByBarcode(barcode)
      .then((res) => {
        setResult(res);
        if (res.found) {
          setName(res.name ?? "");
          setUnit(res.likely_unit ?? "pcs");
          setStage("confirm");
        } else {
          setStage("needs_photo");
        }
      })
      .catch((err) => setErrorMsg(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setUnit(res.likely_unit ?? "pcs");
      setStage("confirm");
    } catch (err) {
      const { title, detail } = friendlyAIError(err);
      addNotification({ type: "error", title, message: detail });
      setErrorMsg(detail);
      setStage("needs_photo");
    }
  }

  async function saveAndRestock() {
    setStage("saving");
    setErrorMsg(null);
    try {
      const { data: product, error: productErr } = await supabase
        .from("product_library")
        .upsert(
          {
            barcode,
            name,
            brand: result?.brand ?? null,
            category: result?.category ?? null,
            default_unit: unit,
            image_url: result?.image_url ?? null,
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
          .insert({ product_id: product.id, unit, min_quantity: minQuantity })
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
      });

      onDone();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
            Not found in Open Food Facts. Snap a photo and I'll identify it.
          </p>
          <div className="rounded-lg overflow-hidden bg-black">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "environment" }}
              className="w-full"
            />
          </div>
          <button onClick={identifyFromCamera} className="w-full py-2 rounded-lg bg-emerald-500">
            Identify from photo
          </button>
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
            Name
            <input
              className="w-full mt-1 rounded bg-slate-800 px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
          <button
            onClick={saveAndRestock}
            disabled={stage === "saving" || !name}
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
