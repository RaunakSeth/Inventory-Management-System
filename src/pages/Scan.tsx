import { useState } from "react";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { BillScanner } from "../components/BillScanner";
import { ProductQuickAdd } from "../components/ProductQuickAdd";
import { ScanLine, Receipt, Camera } from "lucide-react";

export function Scan() {
  const [mode, setMode] = useState<"barcode" | "bill">("barcode");
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

      {mode === "bill" && <BillScanner />}
    </div>
  );
}
