import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Row {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
}

export function Products() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("stock_items")
      .select("id, unit, quantity, min_quantity, product_library(name, category)")
      .then(({ data }) => {
        if (!data) return;
        setRows(
          data.map((r: any) => ({
            id: r.id,
            name: r.product_library?.name ?? "(unknown)",
            category: r.product_library?.category ?? null,
            quantity: r.quantity,
            unit: r.unit,
            min_quantity: r.min_quantity,
          }))
        );
      });
  }, []);

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold">Products</h1>
      <input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-slate-800 px-3 py-2"
      />
      {filtered.map((row) => (
        <div key={row.id} className="rounded-lg bg-slate-900 p-3 flex justify-between">
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-slate-500">{row.category}</p>
          </div>
          <p
            className={
              row.quantity <= row.min_quantity ? "text-red-400" : "text-slate-300"
            }
          >
            {row.quantity} {row.unit}
          </p>
        </div>
      ))}
    </div>
  );
}
