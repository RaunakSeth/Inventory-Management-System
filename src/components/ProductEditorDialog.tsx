import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { Package, Barcode, Tag, Upload, Trash2 } from "lucide-react";
import type { ProductGroup } from "../lib/types";

interface EditableProduct {
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

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
];

interface Props {
  open: boolean;
  product: EditableProduct;
  tags: TagRecord[];
  groups: ProductGroup[];
  onOpenChange: (v: boolean) => void;
  onTagsChanged: () => void;
  onUpdated: () => void;
}

export function ProductEditorDialog({
  open,
  product,
  tags,
  groups,
  onOpenChange,
  onTagsChanged,
  onUpdated,
}: Props) {
  const [editingTags, setEditingTags] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editName, setEditName] = useState(product.name);
  const [editCategory, setEditCategory] = useState(product.category ?? "");
  const [editBrand, setEditBrand] = useState(product.brand ?? "");
  const [editGroupId, setEditGroupId] = useState<string>(product.product_group_id ?? "");
  const [productTags, setProductTags] = useState<TagRecord[]>([]);
  const [imgFailed, setImgFailed] = useState(false);
  const [editImage, setEditImage] = useState<string | null>(product.image_url);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [linkedBarcodes, setLinkedBarcodes] = useState<{ id: string; code: string; label: string | null }[]>([]);
  const [chosenBarcode, setChosenBarcode] = useState<string>(product.barcode ?? "");

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (open) {
      setEditName(product.name);
      setEditCategory(product.category ?? "");
      setEditBrand(product.brand ?? "");
      setEditGroupId(product.product_group_id ?? "");
      setEditingTags(false);
      setNewTagInput("");
      setErrorMsg(null);
      setImgFailed(false);
      setEditImage(product.image_url);
      setChosenBarcode(product.barcode ?? "");
      supabase
        .from("barcodes")
        .select("id, code, label")
        .eq("product_id", product.id)
        .then(({ data }) =>
          setLinkedBarcodes((data ?? []) as { id: string; code: string; label: string | null }[])
        );
    }
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("stock_item_tags")
      .select("tag_id")
      .eq("stock_item_id", product.id)
      .then(({ data: links }) => {
        if (!links) return;
        const tagIds = new Set(links.map((l: any) => l.tag_id));
        setProductTags(tags.filter((t) => tagIds.has(t.id)));
      });
  }, [tags, product.id, open]);

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
        image_url: editImage,
        barcode: chosenBarcode || null,
      })
      .eq("id", product.id);
    if (error) setErrorMsg(error.message);
    else {
      onUpdated();
      onOpenChange(false);
    }
    setSaving(false);
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

  const meta = [product.category, product.brand].filter(Boolean).join(" · ");

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      width="min(480px, calc(100vw - 32px))"
      maxHeight="min(640px, calc(100dvh - 32px))"
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title={product.name}
            subtitle={meta || product.default_unit}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={3}>
            <div className="space-y-3">
              <div className="w-full h-40 rounded-xl bg-slate-800 border border-slate-700/40 overflow-hidden flex items-center justify-center">
                {editImage && !imgFailed ? (
                  <img
                    src={editImage}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={() => setImgFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Package className="w-10 h-10" />
                    <span className="text-xs">No photo</span>
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <div className="flex items-center gap-2">
                <Button
                  label="Upload photo"
                  size="sm"
                  variant="secondary"
                  icon={<Upload className="w-4 h-4" />}
                  onClick={() => photoInputRef.current?.click()}
                />
                {editImage && (
                  <Button
                    label="Remove"
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setEditImage(null)}
                  />
                )}
              </div>
              <TextInput label="Name" value={editName} onChange={setEditName} />
              <div className="flex flex-col sm:flex-row gap-2">
                <TextInput label="Category" value={editCategory} onChange={setEditCategory} />
                <TextInput label="Brand" value={editBrand} onChange={setEditBrand} />
              </div>
              <Selector
                label="Group"
                value={editGroupId}
                onChange={(v) => setEditGroupId(v ?? "")}
                hasClear
                placeholder="None"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
                width="100%"
              />
              {product.barcode && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Barcode className="w-3 h-3" />
                  {product.barcode}
                </p>
              )}

              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <Barcode className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-400">Barcode to use</span>
                </div>
                {linkedBarcodes.length === 0 && !product.barcode ? (
                  <p className="text-xs text-slate-500">
                    No barcode yet. Generate one in the Barcode studio and link it to this product.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {product.barcode && (
                      <button
                        type="button"
                        onClick={() => setChosenBarcode(product.barcode!)}
                        className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                          chosenBarcode === product.barcode
                            ? "border-emerald-400 bg-emerald-400/10"
                            : "border-slate-700 hover:border-slate-500"
                        }`}
                      >
                        <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-slate-200 flex-1 truncate">{product.barcode}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">Global</span>
                      </button>
                    )}
                    {linkedBarcodes.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setChosenBarcode(b.code)}
                        className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                          chosenBarcode === b.code
                            ? "border-emerald-400 bg-emerald-400/10"
                            : "border-slate-700 hover:border-slate-500"
                        }`}
                      >
                        <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-slate-200 flex-1 truncate">{b.code}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">Studio</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800">
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
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={saving ? "Saving..." : "Save changes"}
                variant="primary"
                isLoading={saving}
                onClick={saveDetails}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}