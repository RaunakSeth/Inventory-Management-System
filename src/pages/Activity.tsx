import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { History, Package, Filter, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

interface Txn {
  id: string;
  type: string;
  quantity_change: number;
  note: string | null;
  created_at: string;
  stock_items: {
    product_id: string;
    product_library: { name: string; image_url: string | null };
  } | null;
}

const PAGE_SIZE = 20;

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'%3E%3C/path%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'%3E%3C/polyline%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'%3E%3C/line%3E%3C/svg%3E";

export function Activity() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function fetchActivity() {
    setLoading(true);
    setErrorMsg(null);

    let query = supabase
      .from("transactions")
      .select(`
        id, type, quantity_change, note, created_at,
        stock_items!inner(product_id, product_library!inner(name, image_url))
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error, count } = await query;
    if (error) { setErrorMsg(error.message); setLoading(false); return; }
    setTxns((data as any) as Txn[]);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchActivity();
  }, [typeFilter, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <History className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Activity Log</h1>
        {!loading && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{total}</span>}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/20 border border-red-800/30 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">x</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-500" />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm border border-slate-700"
        >
          <option value="all">All types</option>
          <option value="restock">Restock</option>
          <option value="usage">Usage</option>
          <option value="adjustment">Adjustment</option>
          <option value="bill_scan">Bill scan</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : txns.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No transactions yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {txns.map((t) => {
            const p = t.stock_items?.product_library;
            const isAdd = t.quantity_change > 0;
            return (
              <div key={t.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-800/30">
                <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {p?.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <img src={FALLBACK_IMG} alt="" className="w-5 h-5 opacity-50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p?.name ?? "(unknown)"}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isAdd ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
                      {t.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 truncate">
                    {t.note || t.type}
                    <span className="ml-2">{new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                </div>
                <p className={`text-sm font-mono font-medium ${isAdd ? "text-emerald-400" : "text-red-400"}`}>
                  {isAdd ? "+" : ""}{t.quantity_change}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500">Page {page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
