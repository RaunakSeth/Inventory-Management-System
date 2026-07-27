import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmDialog";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Package, Search, Barcode, Trash2, AlertCircle, Tag, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductGroup } from "../lib/types";

interface Product {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  default_unit: string;
  barcode: string | null;
  image_url: string | null;
  product_group_id: string | null;
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
  const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_library")
      .select("id, name, category, brand, default_unit, barcode, image_url, product_group_id")
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
    supabase.from("product_groups").select("*").order("name").then(({ data }) => setAllGroups(data ?? []));
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
        <Banner
          status="error"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      <TextInput
        label="Search products"
        isLabelHidden
        value={search}
        onChange={setSearch}
        placeholder="Search by name, brand, or category..."
        startIcon={<Search className="w-4 h-4" />}
        hasClear
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} radius={4} index={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No products match your search." : "No products yet"}
          description={search ? "Try a different search term." : "Scan a barcode to add your first product!"}
          icon={<Package />}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                tags={tags}
                groups={allGroups}
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
  groups,
  onTagsChanged,
  onUpdated,
  onDeleteClick,
}: {
  product: Product;
  tags: TagRecord[];
  groups: ProductGroup[];
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
  const [editGroupId, setEditGroupId] = useState<string>(product.product_group_id ?? "");
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
        product_group_id: editGroupId || null,
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
          {product.product_group_id && (
            <p className="text-[10px] text-emerald-400 mt-0.5">
              {groups.find((g) => g.id === product.product_group_id)?.name ?? ""}
            </p>
          )}
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
          <IconButton
            icon={<Trash2 className="w-3 h-3" />}
            label="Delete product"
            size="sm"
            onClick={onDeleteClick}
          />
          <IconButton
            icon={expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            label={expanded ? "Collapse" : "Expand"}
            size="sm"
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-800 pt-3">
          <div className="flex gap-2">
            <TextInput label="Name" value={editName} onChange={setEditName} size="sm" />
            <TextInput label="Category" value={editCategory} onChange={setEditCategory} size="sm" />
            <TextInput label="Brand" value={editBrand} onChange={setEditBrand} size="sm" />
          </div>
          <label className="block text-xs text-slate-400">
            Group
            <select value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} className="w-full mt-0.5 rounded bg-slate-800 px-2 py-1 text-sm">
              <option value="">None</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

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
                <TextInput
                  label=""
                  isLabelHidden
                  value={newTagInput}
                  onChange={setNewTagInput}
                  placeholder="New label name..."
                  size="sm"
                />
                <Button label="Add" size="sm" variant="primary" onClick={addTag} />
              </div>
            )}
          </div>

          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}

          <Button
            label={saving ? "Saving..." : "Save changes"}
            variant="primary"
            isLoading={saving}
            onClick={saveDetails}
            width="100%"
          />
        </div>
      )}
    </div>
  );
}
