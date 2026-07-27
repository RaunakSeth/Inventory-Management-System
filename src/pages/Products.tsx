import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmDialog";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Package, Search, Barcode, Trash2, AlertCircle, Tag, ChevronDown, ChevronUp } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  default_unit: string;
  barcode: string | null;
  image_url: string | null;
}

interface TagRecord {
  id: string;
  name: string;
  color: string;
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'%3E%3C/path%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'%3E%3C/polyline%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'%3E%3C/line%3E%3C/svg%3E";

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
];

export function Products() {
  const { showConfirm } = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editBrand, setEditBrand] = useState("");

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_library")
      .select("id, name, category, brand, default_unit, barcode, image_url")
      .order("name");
    if (!error && data) setProducts(data as Product[]);
    setLoading(false);
  }

  async function fetchTags() {
    const { data } = await supabase.from("tags").select("*").order("name");
    if (data) setTags(data as TagRecord[]);
  }

  useEffect(() => {
    fetchProducts();
    fetchTags();
  }, []);

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
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} radius={4} index={i} />
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
          {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                tags={tags}
                onTagsChanged={fetchTags}
                onUpdated={fetchProducts}
                onDeleteClick={() => showConfirm({
                  title: `Delete "${p.name}"?`,
                  description: "This also removes the product from your library. Stock entries for this product are also deleted.",
                  actionLabel: "Delete",
                  onAction: () => deleteProduct(p.id),
                })}
              />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product,
  tags,
  onTagsChanged,
  onUpdated,
  onDeleteClick,
}: {
  product: Product;
  tags: TagRecord[];
  onTagsChanged: () => void;
  onUpdated: () => void;
  onDeleteClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editName, setEditName] = useState(product.name);
  const [editCategory, setEditCategory] = useState(product.category ?? "");
  const [editBrand, setEditBrand] = useState(product.brand ?? "");
  const [productTags, setProductTags] = useState<TagRecord[]>([]);

  useEffect(() => {
    supabase
      .from("stock_item_tags")
      .select("tag_id")
      .eq("stock_item_id", product.id)
      .then(({ data: links }) => {
        if (!links) return;
        const tagIds = new Set(links.map((l: any) => l.tag_id));
        setProductTags(tags.filter((t) => tagIds.has(t.id)));
      });
  }, [tags, product.id]);

  async function saveDetails() {
    setSaving(true);
    setErrorMsg(null);
    const { error } = await supabase
      .from("product_library")
      .update({
        name: editName.trim(),
        category: editCategory || null,
        brand: editBrand || null,
      })
      .eq("id", product.id);
    if (error) setErrorMsg(error.message);
    else onUpdated();
    setSaving(false);
    setExpanded(false);
  }

  async function addTag() {
    const name = newTagInput.trim();
    if (!name) return;

    let tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      const color = LABEL_COLORS[tags.length % LABEL_COLORS.length];
      const { data } = await supabase
        .from("tags")
        .insert({ name, color })
        .select()
        .single();
      if (!data) return;
      tag = data as TagRecord;
      onTagsChanged();
    }

    await supabase
      .from("stock_item_tags")
      .insert({ stock_item_id: product.id, tag_id: tag.id })
      .maybeSingle();
    setNewTagInput("");
    onTagsChanged();
  }

  async function removeTag(tagId: string) {
    await supabase
      .from("stock_item_tags")
      .delete()
      .eq("stock_item_id", product.id)
      .eq("tag_id", tagId);
    onTagsChanged();
  }

  return (
    <div className="rounded-xl bg-slate-900/80 border border-slate-800/50 hover:border-slate-700 transition overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <button onClick={() => setExpanded(!expanded)} className="shrink-0">
          <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }}
              />
            ) : (
              <img src={FALLBACK_IMG} alt="" className="w-6 h-6 opacity-50" />
            )}
          </div>
        </button>
        <button onClick={() => setExpanded(!expanded)} className="min-w-0 flex-1 text-left">
          <p className="font-medium text-sm truncate">{product.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {[product.category, product.brand].filter(Boolean).join(" · ") || "\u00a0"}
          </p>
          {product.barcode && (
            <p className="text-[10px] text-slate-600 font-mono mt-0.5 flex items-center gap-1">
              <Barcode className="w-3 h-3" />
              {product.barcode}
            </p>
          )}
          {productTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {productTags.map((t) => (
                <span
                  key={t.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: t.color + "30", color: t.color }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
            {product.default_unit}
          </span>
          <button
            onClick={onDeleteClick}
            className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-red-900/50 transition"
            title="Delete product"
          >
            <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-slate-700 transition"
          >
            {expanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-800 pt-3">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-slate-400">
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full mt-0.5 rounded bg-slate-800 px-2 py-1 text-sm" />
            </label>
            <label className="flex-1 text-xs text-slate-400">
              Category
              <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full mt-0.5 rounded bg-slate-800 px-2 py-1 text-sm" />
            </label>
            <label className="flex-1 text-xs text-slate-400">
              Brand
              <input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} className="w-full mt-0.5 rounded bg-slate-800 px-2 py-1 text-sm" />
            </label>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">Labels</span>
              <button onClick={() => setEditingTags(!editingTags)} className="text-xs text-emerald-400 ml-auto">
                {editingTags ? "Done" : "Edit"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {productTags.map((t) => (
                <span
                  key={t.id}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: t.color + "30", color: t.color }}
                >
                  {t.name}
                  {editingTags && (
                    <button onClick={() => removeTag(t.id)} className="hover:opacity-70">&times;</button>
                  )}
                </span>
              ))}
            </div>
            {editingTags && (
              <div className="flex gap-1 mt-1.5">
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="New label name..."
                  className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs"
                />
                <button onClick={addTag} className="px-2 py-1 rounded bg-emerald-600 text-xs">Add</button>
              </div>
            )}
          </div>

          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}

          <button
            onClick={saveDetails}
            disabled={saving}
            className="w-full py-1.5 rounded-lg bg-emerald-500 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
