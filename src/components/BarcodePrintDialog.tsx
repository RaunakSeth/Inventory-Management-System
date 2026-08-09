import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Printer } from "lucide-react";
import { LABEL_TEMPLATES, printLabelSheet } from "../lib/barcodes";
import type { LabelPrintItem } from "../lib/barcodes";

interface Props {
  open: boolean;
  items: LabelPrintItem[];
  onOpenChange: (v: boolean) => void;
}

export function BarcodePrintDialog({ open, items, onOpenChange }: Props) {
  const [templateId, setTemplateId] = useState(LABEL_TEMPLATES[0].id);
  const template = LABEL_TEMPLATES.find((t) => t.id === templateId) ?? LABEL_TEMPLATES[0];

  function handlePrint() {
    printLabelSheet(items, template);
  }

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="form" width={440}>
      <Layout
        header={<DialogHeader title="Print labels" subtitle={`${items.length} barcode${items.length === 1 ? "" : "s"} on an A4 sheet`} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {LABEL_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                      t.id === templateId
                        ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {t.name}
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {t.cols} × {t.rows} per page
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Each sheet is filled completely — selected barcodes repeat to cover
                all <span className="text-slate-200">{template.cols * template.rows}</span> labels.
                Select A4 paper and disable headers/footers in the print dialog.
              </p>
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <div className="flex justify-end gap-2">
              <Button label="Close" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label="Print"
                variant="primary"
                icon={<Printer className="w-4 h-4" />}
                isDisabled={items.length === 0}
                onClick={handlePrint}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}