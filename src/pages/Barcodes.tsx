import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  generateEan13,
  renderEan13Svg,
} from "../lib/barcodes";
import type { Barcode } from "../lib/types";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { useConfirm } from "../components/ConfirmDialog";
import { BarcodePrintDialog } from "../components/BarcodePrintDialog";
import { Plus, Trash2, RefreshCw, Link2, Printer, Pencil, Barcode as BarcodeIcon } from "lucide-react";

interface EditorState {
  id: string | null;
  code: string;
  label: string;
  notes: string;
  productId: string | null;
  format: string;
}

interface ProductOption {
  id: string;
  name: string;
}

export function Barcodes() {
  const { showConfirm } = useConfirm();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printIds, setPrintIds] = useState<Set<string>>(new Set());

  const printItems = barcodes
    .filter((b) => printIds.size === 0 || printIds.has(b.id))
    .map((b) => ({
      code: b.code,
      text: b.label || b.product?.name || undefined,
      sub: b.label && b.product?.name ? b.product.name : undefined,
    }));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("barcodes")
      .select(
        "id, user_id, product_id, code, format, label, notes, created_at, updated_at, product:product_library(name, category)"
      )
      .order("created_at", { ascending: false });
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setBarcodes((data ?? []).map((b: any) => ({ ...b, product: b.product?.[0] ?? b.product ?? null })));
    setLoading(false);
  }, []);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("product_library")
      .select("id, name")
      .order("name");
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setProducts((data ?? []) as ProductOption[]);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchProducts();
  }, [fetchAll, fetchProducts]);

  function openCreate() {
    const code = generateEan13();
    setEditor({
      id: null,
      code,
      label: "",
      notes: "",
      productId: null,
      format: "ean13",
    });
    setSaveError(null);
    setEditorOpen(true);
  }

  function openEdit(b: Barcode) {
    setEditor({
      id: b.id,
      code: b.code,
      label: b.label ?? "",
      notes: b.notes ?? "",
      productId: b.product_id,
      format: b.format,
    });
    setSaveError(null);
    setEditorOpen(true);
  }

  function regenerate() {
    if (!editor) return;
    setEditor({ ...editor, code: generateEan13() });
  }

  async function saveEditor() {
    if (!editor) return;
    if (!editor.code.trim()) {
      setSaveError("Barcode code is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);

    const payload = {
      code: editor.code.trim(),
      label: editor.label.trim(),
      notes: editor.notes.trim() || null,
      product_id: editor.productId || null,
    };

    let error: { message: string } | null = null;

    if (editor.id) {
      ({ error } = await supabase
        .from("barcodes")
        .update(payload)
        .eq("id", editor.id));
    } else {
      ({ error } = await supabase.from("barcodes").insert({
        ...payload,
        format: editor.format,
      }));
    }

    if (error) {
      setSaveError(error.message);
    } else {
      setEditorOpen(false);
      await fetchAll();
    }

    setSaving(false);
  }

  async function deleteBarcode(b: Barcode) {
    showConfirm({
      title: `Delete "${b.label || b.code}"?`,
      description: "This removes the barcode from your studio. Products it pointed to are left untouched.",
      actionLabel: "Delete",
      onAction: async () => {
        const { error } = await supabase.from("barcodes").delete().eq("id", b.id);
        if (error) setErrorMsg(error.message);
        else await fetchAll();
      },
    });
  }

  const editorIsValid = editor != null && editor.code.trim().length > 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <BarcodeIcon className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Barcode studio</h1>
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{barcodes.length}</span>
        <Button
          label={printIds.size > 0 ? `Print selected (${printIds.size})` : "Print labels"}
          variant="secondary"
          icon={<Printer className="w-4 h-4" />}
          onClick={() => setPrintOpen(true)}
          isDisabled={barcodes.length === 0}
          className="ml-auto"
        />
        <Button
          label="New barcode"
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={openCreate}
        />
      </div>

      {errorMsg && <Banner status="error" title={errorMsg} isDismissable onDismiss={() => setErrorMsg(null)} />}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} radius={4} index={i} />
          ))}
        </div>
      )}

      {!loading && barcodes.length === 0 && (
        <EmptyState
          title="No barcodes yet"
          description="Generate barcodes for your own products — each maps to a product and stays private to you."
          icon={<BarcodeIcon />}
        />
      )}

      {!loading && barcodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {barcodes.map((b) => {
            const svg = renderEan13Svg(b.code);
            const productName = b.product?.name;
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => openEdit(b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEdit(b);
                  }
                }}
                className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3 cursor-pointer hover:border-slate-600 transition-colors"
              >
                <div className="flex flex-col gap-3">
                  <div
                    className="barcode-img rounded-lg bg-white px-3 py-2 w-full"
                    dangerouslySetInnerHTML={{ __html: svg ?? "<span/>" }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        {b.label || "Untitled barcode"}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{b.code}</p>
                      {productName ? (
                        <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                          <Link2 className="w-3 h-3" /> {productName}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">
                          Not linked to a product
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                      <label
                        title="Include in print"
                        className={`flex items-center justify-center w-8 h-8 rounded-lg border cursor-pointer transition-colors ${
                          printIds.has(b.id)
                            ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                            : "border-slate-700 text-slate-500 hover:border-slate-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={printIds.has(b.id)}
                          onChange={(e) => {
                            const next = new Set(printIds);
                            if (e.target.checked) next.add(b.id);
                            else next.delete(b.id);
                            setPrintIds(next);
                          }}
                        />
                        <Printer className="w-4 h-4" />
                      </label>
                      <IconButton
                        label="Edit"
                        icon={<Pencil className="w-4 h-4" />}
                        onClick={() => openEdit(b)}
                      />
                      <IconButton
                        label="Delete"
                        icon={<Trash2 className="w-4 h-4" />}
                        variant="destructive"
                        onClick={() => deleteBarcode(b)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && editor && (
        <Dialog isOpen={editorOpen} onOpenChange={setEditorOpen} purpose="form" width={520}>
          <Layout
            header={<DialogHeader title={editor.id ? "Edit barcode" : "New barcode"} />}
            content={
              <LayoutContent>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <TextInput
                        label="Code (13 digits)"
                        value={editor.code}
                        onChange={(v) => setEditor({ ...editor, code: v })}
                        placeholder="EAN-13 code"
                      />
                    </div>
                    <Button
                      label="Generate"
                      variant="secondary"
                      icon={<RefreshCw className="w-4 h-4" />}
                      onClick={regenerate}
                    />
                  </div>
                  {editor.code.length === 13 && (
                    <div
                      className="flex justify-center rounded-lg bg-white p-2"
                      dangerouslySetInnerHTML={{
                        __html: renderEan13Svg(editor.code) ?? "",
                      }}
                    />
                  )}
                  {editor.code.length > 0 && editor.code.length !== 13 && (
                    <p className="text-xs text-amber-400">
                      EAN-13 codes are exactly 13 digits.
                    </p>
                  )}
                  <TextInput
                    label="Label"
                    value={editor.label}
                    onChange={(v) => setEditor({ ...editor, label: v })}
                    placeholder="e.g. Home-made pickle jar"
                  />
                  <TextInput
                    label="Notes"
                    value={editor.notes}
                    onChange={(v) => setEditor({ ...editor, notes: v })}
                    placeholder="Optional"
                  />
                  <Selector
                    label="Link to product"
                    value={editor.productId ?? ""}
                    onChange={(v) => setEditor({ ...editor, productId: v || null })}
                    hasClear
                    placeholder="None"
                    options={products.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    width="100%"
                  />
                  {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                </div>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <div className="flex justify-end gap-2">
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onClick={() => setEditorOpen(false)}
                  />
                  <Button
                    label={saving ? "Saving..." : "Save"}
                    variant="primary"
                    isDisabled={!editorIsValid}
                    isLoading={saving}
                    onClick={saveEditor}
                  />
                </div>
              </LayoutFooter>
            }
          />
        </Dialog>
      )}

      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={(v) => {
          setPrintOpen(v);
          if (!v) setPrintIds(new Set());
        }}
        items={printItems}
      />
    </div>
  );
}