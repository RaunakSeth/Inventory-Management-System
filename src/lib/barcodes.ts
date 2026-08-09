// EAN-13 generation, validation and SVG rendering (no external deps).

const L_CODES = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const G_CODES = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const R_CODES = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
// Parity of the 6 left digits, driven by the FIRST digit of the 13.
const PARITY: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL",
  "4": "LGLLGG", "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG",
  "8": "LGLGGL", "9": "LGGLGL",
};

/** Compute the EAN-13 check digit for a 12-digit input. */
export function ean13CheckDigit(first12: string): number {
  const digits = first12.replace(/\D/g, "");
  if (digits.length !== 12) {
    throw new Error("EAN-13 needs exactly 12 digits before the check digit");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = digits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True if this is a valid 13-digit EAN-13 (checksum included). */
export function isValidEan13(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  return digits.length === 13 && ean13CheckDigit(digits.slice(0, 12)) === digits.charCodeAt(12) - 48;
}

/** Generate a random valid EAN-13. Optional prefix (e.g. "890" for India). */
export function generateEan13(prefix = "890"): string {
  let first12 = prefix.replace(/\D/g, "").slice(0, 12);
  while (first12.length < 12) first12 += Math.floor(Math.random() * 10);
  return first12 + ean13CheckDigit(first12);
}

const SCALE = 2; // px per module
const BAR_HEIGHT = 52;
const TEXT_HEIGHT = 20;

/** Render a valid EAN-13 to an SVG string. Returns null when the code is invalid. */
export function renderEan13Svg(code: string): string | null {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 13 || !isValidEan13(digits)) return null;

  const parity = PARITY[digits[0]];
  const encLeft = digits
    .slice(1, 7)
    .split("")
    .map((c, i) => {
      const v = c.charCodeAt(0) - 48;
      return parity[i] === "G" ? G_CODES[v] : L_CODES[v];
    });
  const encRight = digits
    .slice(7, 13)
    .split("")
    .map((c) => R_CODES[c.charCodeAt(0) - 48]);

  const modules: boolean[] = [];
  const push = (bits: string) => {
    for (const b of bits) modules.push(b === "1");
  };

  push("101");
  for (const s of encLeft) push(s);
  push("01010");
  for (const s of encRight) push(s);
  push("101");

  let rects = "";
  let i = 0;
  while (i < modules.length) {
    if (modules[i]) {
      let j = i;
      while (j < modules.length && modules[j]) j++;
      rects += `<rect x="${i * SCALE}" y="0" width="${(j - i) * SCALE}" height="${BAR_HEIGHT}" />`;
      i = j;
    } else {
      i++;
    }
  }

  const width = modules.length * SCALE;
  const textY = BAR_HEIGHT + 14;

  let text = `<text x="${SCALE}" y="${textY}" font-family="monospace" font-size="12" fill="#000">${digits[0]}</text>`;
  for (let d = 1; d <= 6; d++) {
    const x = 8 + (d - 1) * 15;
    text += `<text x="${x}" y="${textY}" font-family="monospace" font-size="12" fill="#000">${digits[d]}</text>`;
  }
  for (let d = 7; d <= 12; d++) {
    const x = 8 + 6 * 15 + 12 + (d - 7) * 15;
    text += `<text x="${x}" y="${textY}" font-family="monospace" font-size="12" fill="#000">${digits[d]}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAR_HEIGHT + TEXT_HEIGHT}" viewBox="0 0 ${width} ${BAR_HEIGHT + TEXT_HEIGHT}" role="img" aria-label="EAN-13 ${digits}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${rects}
  ${text}
</svg>`;
}

export interface LabelTemplate {
  id: string;
  name: string;
  cols: number;
  rows: number;
}

/** Preset A4 label-sheet templates (cols × rows per page). */
export const LABEL_TEMPLATES: LabelTemplate[] = [
  { id: "small", name: "Small", cols: 3, rows: 8 },
  { id: "medium", name: "Medium", cols: 2, rows: 5 },
  { id: "large", name: "Large", cols: 1, rows: 3 },
];

export interface LabelPrintItem {
  code: string;
  text?: string;
  sub?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Opens a print window with A4 sheets of barcode labels.
 *
 * The selected barcodes are recycled to fill every cell on the sheet(s):
 * selecting one barcode fills the whole grid with copies of it, and selecting
 * several spreads them evenly across each page. Only valid EAN-13 codes print.
 */
export function printLabelSheet(items: LabelPrintItem[], template: LabelTemplate): void {
  const usableW = 190; // mm
  const usableH = 281; // mm (A4 minus ~4.5mm margins)
  const gap = 1.5;
  const labelW = (usableW - (template.cols - 1) * gap) / template.cols;
  const labelH = (usableH - (template.rows - 1) * gap) / template.rows;

  const printable = items
    .map((it) => ({ it, svg: renderEan13Svg(it.code) }))
    .filter((x): x is { it: LabelPrintItem; svg: string } => x.svg !== null)
    .map(({ it, svg }) => {
      const text = it.text ? `<div class="text">${escapeHtml(it.text)}</div>` : "";
      const sub = it.sub ? `<div class="sub">${escapeHtml(it.sub)}</div>` : "";
      return `<div class="label">${svg}${text}${sub}</div>`;
    });

  if (printable.length === 0) return;

  const cellsPerSheet = template.cols * template.rows;
  const sheetCount = Math.max(1, Math.ceil(printable.length / cellsPerSheet));

  const sheets: string[] = [];
  for (let s = 0; s < sheetCount; s++) {
    const cells: string[] = [];
    for (let c = 0; c < cellsPerSheet; c++) {
      cells.push(printable[(s * cellsPerSheet + c) % printable.length]);
    }
    sheets.push(`<div class="sheet">${cells.join("")}</div>`);
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Barcode labels</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .sheet { width: ${usableW}mm; display: grid; grid-template-columns: repeat(${template.cols}, ${labelW}mm); grid-template-rows: repeat(${template.rows}, ${labelH}mm); column-gap: ${gap}mm; row-gap: ${gap}mm; margin: 4.5mm auto; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .label { border: 0.3mm dashed #cbd5e1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; padding: 1.5mm; page-break-inside: avoid; }
  .label svg { width: ${Math.max(labelW - 5, 20)}mm; height: auto; }
  .label .text { font-size: 9px; font-weight: 700; margin-top: 1mm; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label .sub { font-size: 7.5px; color: #475569; margin-top: 0.5mm; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style></head><body>${sheets.join("")}</body>
<script>window.addEventListener('load', function(){ window.focus(); window.print(); });</script>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}