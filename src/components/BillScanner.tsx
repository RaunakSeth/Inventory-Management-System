import { useRef, useState } from "react";
import Webcam from "react-webcam";
import { parseBillPhoto } from "../lib/edgeFunctions";
import { supabase } from "../lib/supabase";
import type { BillLineItem } from "../lib/types";

interface ReviewRow extends BillLineItem {
  matched_product_id: string | null;
  match_name: string | null;
  similarity: number | null;
  include: boolean;
}

export function BillScanner() {
  const webcamRef = useRef<Webcam>(null);
  const [photo, setPhoto] = useState<string | null>(null); // data URL for preview
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [vendor, setVendor] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function capture() {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    setPhoto(dataUrl);
    setLoading(true);
    setErrorMsg(null);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const result = await parseBillPhoto(blob);
      setVendor(result.vendor_name);

      // Fuzzy-match every line item against the product library so the
      // reviewer just has to confirm, not type everything from scratch.
      const matched: ReviewRow[] = await Promise.all(
        result.line_items.map(async (item) => {
          const { data } = await supabase.rpc("match_product_by_name", {
            search: item.parsed_name,
          });
          const best = data?.[0];
          return {
            ...item,
            matched_product_id: best?.product_id ?? null,
            match_name: best?.name ?? null,
            similarity: best?.similarity ?? null,
            include: true,
          };
        })
      );
      setRows(matched);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndSave() {
    if (!rows) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: bill, error: billErr } = await supabase
        .from("bills")
        .insert({ image_url: photo ?? "", vendor_name: vendor, status: "reviewed" })
        .select()
        .single();
      if (billErr) throw billErr;

      for (const row of rows) {
        if (!row.include) continue;

        await supabase.from("bill_line_items").insert({
          bill_id: bill.id,
          raw_text: row.raw_text,
          parsed_name: row.parsed_name,
          quantity: row.quantity,
          unit: row.unit,
          unit_price: row.unit_price,
          matched_product_id: row.matched_product_id,
          match_confidence: row.similarity,
          needs_review: !row.matched_product_id,
        });

        // Only post a stock transaction when we have a confident product
        // match — unmatched items stay flagged in bill_line_items for you
        // to resolve manually (add as new product, or link to an existing one).
        if (row.matched_product_id && row.quantity) {
          const { data: stockItem } = await supabase
            .from("stock_items")
            .select("id")
            .eq("product_id", row.matched_product_id)
            .maybeSingle();

          let stockItemId = stockItem?.id;
          if (!stockItemId) {
            const { data: newStock } = await supabase
              .from("stock_items")
              .insert({ product_id: row.matched_product_id, unit: row.unit ?? "pcs" })
              .select()
              .single();
            stockItemId = newStock?.id;
          }

          if (stockItemId) {
            await supabase.from("transactions").insert({
              stock_item_id: stockItemId,
              type: "bill_scan",
              quantity_change: row.quantity,
              source_bill_id: bill.id,
              note: `From bill: ${row.raw_text}`,
            });
          }
        }
      }

      setRows(null);
      setPhoto(null);
      setVendor(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev?.map((r, i) => (i === idx ? { ...r, ...patch } : r)) ?? null);
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {!rows && (
        <>
          <div className="rounded-xl overflow-hidden bg-black">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "environment" }}
              className="w-full"
            />
          </div>
          <button
            onClick={capture}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-emerald-500 font-medium disabled:opacity-50"
          >
            {loading ? "Reading bill…" : "Capture bill"}
          </button>
        </>
      )}

      {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}

      {rows && (
        <div className="space-y-3">
          {vendor && <p className="text-sm text-slate-400">Vendor: {vendor}</p>}
          {rows.map((row, idx) => (
            <div key={idx} className="rounded-lg bg-slate-900 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.include}
                  onChange={(e) => updateRow(idx, { include: e.target.checked })}
                />
                <span className="font-medium">{row.parsed_name}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {row.quantity ?? "?"} {row.unit ?? ""}
                </span>
              </div>
              <p className="text-xs text-slate-500">Raw: {row.raw_text}</p>
              {row.matched_product_id ? (
                <p className="text-xs text-emerald-400">
                  Matched: {row.match_name} ({Math.round((row.similarity ?? 0) * 100)}% confident)
                </p>
              ) : (
                <p className="text-xs text-amber-400">
                  No confident match — will be saved for manual review instead of updating stock.
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={confirmAndSave}
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-emerald-500 font-medium disabled:opacity-50"
            >
              {loading ? "Saving…" : "Confirm & update stock"}
            </button>
            <button
              onClick={() => {
                setRows(null);
                setPhoto(null);
              }}
              className="px-4 py-3 rounded-lg bg-slate-800"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
