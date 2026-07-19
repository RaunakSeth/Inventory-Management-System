import { useState } from "react";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BillScanner } from "../components/BillScanner";
import { ProductQuickAdd } from "../components/ProductQuickAdd";

export function Scan() {
  const [mode, setMode] = useState<"barcode" | "bill">("barcode");
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 max-w-sm mx-auto">
        <button
          onClick={() => setMode("barcode")}
          className={`flex-1 py-2 rounded-lg ${mode === "barcode" ? "bg-emerald-500" : "bg-slate-800"}`}
        >
          Scan barcode
        </button>
        <button
          onClick={() => setMode("bill")}
          className={`flex-1 py-2 rounded-lg ${mode === "bill" ? "bg-emerald-500" : "bg-slate-800"}`}
        >
          Scan bill
        </button>
      </div>

      {mode === "barcode" &&
        (scannedCode ? (
          <ProductQuickAdd barcode={scannedCode} onDone={() => setScannedCode(null)} />
        ) : (
          <BarcodeScanner active={mode === "barcode"} onDetected={setScannedCode} />
        ))}

      {mode === "bill" && <BillScanner />}
    </div>
  );
}
