import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmDialog";
import { ProductEditorDialog } from "../components/ProductEditorDialog";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Package, Search, Trash2, AlertCircle } from "lucide-react";
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

export function Products() {
  const { showConfirm } = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
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
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto pb-24">
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
        <Grid columns={{ minWidth: 250, max: 2 }} gap={3}>
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
        </Grid>
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
  const [open, setOpen] = useState(false);

  const meta = [product.category, product.brand].filter(Boolean).join(" · ");

  return (
    <>
      <ClickableCard
        label={`Open ${product.name}`}
        onClick={() => setOpen(true)}
        padding={3}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700/40 overflow-hidden flex items-center justify-center shrink-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Package className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{product.name}</p>
            <p className="text-xs text-slate-500 truncate">{meta || "\u00a0"}</p>
            {product.product_group_id && (
              <p className="text-[10px] text-emerald-400 mt-0.5">
                {groups.find((g) => g.id === product.product_group_id)?.name ?? ""}
              </p>
            )}
          </div>
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
          </div>
        </div>
      </ClickableCard>

      <ProductEditorDialog
        open={open}
        product={product}
        tags={tags}
        groups={groups}
        onOpenChange={setOpen}
        onTagsChanged={onTagsChanged}
        onUpdated={onUpdated}
      />
    </>
  );
}