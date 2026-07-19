import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Product {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  default_unit: string;
  barcode: string | null;
}

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("product_library")
      .select("id, name, category, brand, default_unit, barcode", { count: "exact" })
      .order("name")
      .then(({ data, error }) => {
        if (!error && data) setProducts(data as Product[]);
        setLoading(false);
      });
  }, []);

  const filtered = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(search.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
      )
    : products;

  return (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold">Product Library ({filtered.length})</h1>
      <input
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-slate-800 px-3 py-2"
        autoFocus
      />
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">
          {search ? "No products match your search." : "No products yet. Scan a barcode to add the first one!"}
        </p>
      ) : (
        filtered.map((p) => (
          <div key={p.id} className="rounded-lg bg-slate-900 p-3 flex justify-between items-start">
            <div className="min-w-0">
              <p className="font-medium truncate">{p.name}</p>
              <p className="text-xs text-slate-500">
                {[p.category, p.brand].filter(Boolean).join(" · ") || null}
              </p>
              {p.barcode && (
                <p className="text-xs text-slate-600 font-mono mt-1">#{p.barcode}</p>
              )}
            </div>
            <span className="text-xs text-slate-500 shrink-0 ml-2">{p.default_unit}</span>
          </div>
        ))
      )}
    </div>
  );
}
