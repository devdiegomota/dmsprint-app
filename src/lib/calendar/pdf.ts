/**
 * Exportação do Calendário de Mesa Tenda em PDF pronto para gráfica (Task 28).
 *
 * MODELO TENDA (padrão de mercado, cf. cartões tenda Avery): cada folha A4 leva
 * as DUAS faces da tenda no MESMO lado do papel —
 *   - metade de baixo: face frontal (capa ou mês) em pé;
 *   - metade de cima: o verso (mês seguinte) girado 180°.
 * Ao dobrar no meio (vinco a 148,5 mm), as duas faces ficam em pé e legíveis,
 * cada uma para um lado da mesa. Imprime SOMENTE a frente — 13 folhas, sem
 * duplex, sem corte (a folha inteira É a tenda).
 *
 * Rasterização: cada face é 2480 × 1754 px; a página composta, 2480 × 3508 px
 * → 300 DPI em A4 (210 × 297 mm). JPEG q0.95 embutido via jsPDF (DCTDecode,
 * sem recodificação — auditado na Task 24).
 */

import { jsPDF } from "jspdf";
import { makeCanvas } from "@/lib/print/analysis";
import { FACE_H_PX, FACE_W_PX, PANEL_COUNT } from "./compose";

export interface CalendarPdfOptions {
  filename: string;
  /** Qualidade JPEG (0.8–1.0). */
  quality?: number;
}

export interface CalendarPdfResult {
  filename: string;
  bytes: number;
  pages: number;
  /** Blob gerado — usado pelo upload opcional para a Nuvem DMS. */
  blob: Blob;
}

/** Cópia girada 180° da face (para o verso da tenda na metade de cima). */
function rotate180(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.translate(src.width, src.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  return out;
}

function normalizeFilename(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

/** jsPDF A4 retrato com metadados do produto. */
function newA4Pdf(title: string, subject: string): jsPDF {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({ title, subject, creator: "DMS Print — Calendário Tenda" });
  return pdf;
}

/** Acrescenta a folha composta (`canvas` 2480 × 3508) como página A4 do PDF. */
function appendSheetPage(pdf: jsPDF, canvas: HTMLCanvasElement, quality: number, first: boolean): void {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (!first) pdf.addPage();
  pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297, undefined, "NONE");
}

/** Monta a página A4 do cartão `cardIndex`: frente embaixo + verso (mês seguinte) em cima. */
export function buildTendaPage(
  faces: HTMLCanvasElement[],
  cardIndex: number,
): HTMLCanvasElement {
  const page = makeCanvas(FACE_W_PX, FACE_H_PX * 2);
  const ctx = page.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  const front = faces[cardIndex];
  const back = faces[(cardIndex + 1) % PANEL_COUNT];
  ctx.drawImage(front, 0, FACE_H_PX);
  ctx.drawImage(rotate180(back), 0, 0);
  return page;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Gera e baixa o PDF com as 13 folhas do calendário. Executa 100% no cliente.
 * `faces` deve ter as 13 faces compostas (capa + 12 meses), na ordem.
 */
export async function exportCalendarPdf(
  faces: HTMLCanvasElement[],
  options: CalendarPdfOptions,
): Promise<CalendarPdfResult> {
  if (faces.length !== PANEL_COUNT) {
    throw new Error(`Esperadas ${PANEL_COUNT} faces, recebidas ${faces.length}.`);
  }
  const filename = normalizeFilename(options.filename);
  const quality = options.quality ?? 0.95;

  const pdf = newA4Pdf(filename.replace(/\.pdf$/i, ""), "Calendário de Mesa Tenda 2027 — 1 tenda por folha A4, dobrar no meio");

  for (let card = 0; card < PANEL_COUNT; card++) {
    const page = buildTendaPage(faces, card);
    appendSheetPage(pdf, page, quality, card === 0);
  }

  const blob = pdf.output("blob");
  downloadBlob(blob, filename);
  return { filename, bytes: blob.size, pages: PANEL_COUNT, blob };
}

/**
 * Formato "Tenda A4 única" (Task 29): UMA folha com o calendário completo —
 * frente (arte + Jan–Jun) embaixo e verso (arte + Jul–Dez) girado 180° em cima.
 * Dobra no meio, imprime só a frente do papel. `sheet` é a folha composta
 * (composeTendaA4Sheet, 2480 × 3508 px).
 */
export async function exportTendaA4Pdf(
  sheet: HTMLCanvasElement,
  options: CalendarPdfOptions,
): Promise<CalendarPdfResult> {
  const filename = normalizeFilename(options.filename);
  const quality = options.quality ?? 0.95;

  const pdf = newA4Pdf(filename.replace(/\.pdf$/i, ""), "Calendário Tenda A4 2027 — 1 folha: frente Jan–Jun, verso Jul–Dez; dobrar no meio");
  appendSheetPage(pdf, sheet, quality, true);

  const blob = pdf.output("blob");
  downloadBlob(blob, filename);
  return { filename, bytes: blob.size, pages: 1, blob };
}
