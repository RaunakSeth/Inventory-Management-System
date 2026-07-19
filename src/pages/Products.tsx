import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Package, Search, Barcode, Trash2, AlertCircle } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  default_unit: string;
  barcode: string | null;
  image_url: string | null;
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'%3E%3C/path%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'%3E%3C/polyline%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'%3E%3C/line%3E%3C/svg%3E";

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_library")
      .select("id, name, category, brand, default_unit, barcode, image_url")
      .order("name");
    if (!error && data) setProducts(data as Product[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  async function deleteProduct(id: string) {
    setErrorMsg(null);
    const { error } = await supabase.from("product_library").delete().eq("id", id);
    if (error) {
      if (error.message.includes("foreign key")) {
        setErrorMsg("This product has stock entries. Delete them from Dashboard first.");
      } else {
        setErrorMsg(error.message);
      }
    } else {
      setConfirmDelete(null);
      fetchProducts();
    }
  }

  const filtered = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(search.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
      )
    : products;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <Package className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Products</h1>
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
          {products.length}
        </span>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/20 border border-red-800/30 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">x</button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          placeholder="Search by name, brand, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-sm border border-slate-700 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition"
          autoFocus
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-800/50 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search ? "No products match your search." : "No products yet. Scan a barcode to add one!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            if (confirmDelete === p.id) {
              return (
                <div key={p.id} className="rounded-xl bg-red-900/20 border border-red-800/30 p-4">
                  <p className="text-sm font-medium text-red-400">Delete "{p.name}"?</p>
                  <p className="text-xs text-red-400/70 mt-1">
                    This also removes the product from your library. Stock entries for this product are also deleted.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => deleteProduct(p.id)} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-400 transition">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={p.id}
                className="rounded-xl bg-slate-900/80 p-3 flex items-center gap-3 border border-slate-800/50 hover:border-slate-700 transition"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }}
                    />
                  ) : (
                    <img src={FALLBACK_IMG} alt="" className="w-6 h-6 opacity-50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[p.category, p.brand].filter(Boolean).join(" · ") || "\u00a0"}
                  </p>
                  {p.barcode && (
                    <p className="text-[10px] text-slate-600 font-mono mt-0.5 flex items-center gap-1">
                      <Barcode className="w-3 h-3" />
                      {p.barcode}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                    {p.default_unit}
                  </span>
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-red-900/50 transition"
                    title="Delete product"
                  >
                    <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
