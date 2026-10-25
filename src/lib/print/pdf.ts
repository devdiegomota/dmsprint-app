/**
 * Exportação da folha imposta em PDF pronto para gráfica.
 *
 * A página do PDF é definida em milímetros exatos (210 × 297 mm — A4) e recebe a
 * imagem rasterizada de 2480 × 3508 px → densidade resultante de 300 DPI.
 * O operador deve imprimir em escala 100% ("tamanho real", sem "ajustar à página").
 *
 * Dois motores, cada um no ponto forte:
 *  - JPEG  → jsPDF (embutimento JPEG/DCTDecode, arquivo compacto).
 *  - PNG   → pdf-lib (embutimento PNG/FlateDecode realmente sem perdas — o jsPDF
 *            re-codificaria para JPEG, o que invalidaria a opção lossless).
 */

import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { PRINT_DPI, MM_PER_INCH } from "./constants";

export type PdfImageFormat = "jpeg" | "png";

export interface ExportOptions {
  filename: string;
  format: PdfImageFormat;
  /** Qualidade JPEG (0.9–1.0). Ignorado em PNG. */
  quality?: number;
}

export interface ExportResult {
  filename: string;
  bytes: number;
}

/** Dispara o download de um Blob no navegador. */
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

function normalizeFilename(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

/** Página A4 em pontos PDF (1 pt = 1/72 pol). */
const A4_PT = {
  width: (210 / MM_PER_INCH) * 72, // 595.28
  height: (297 / MM_PER_INCH) * 72, // 841.89
};

/**
 * Gera e baixa o PDF da folha A4 imposta. Executa 100% no cliente.
 */
export async function exportSheetPdf(
  sheet: HTMLCanvasElement,
  options: ExportOptions,
): Promise<ExportResult> {
  const filename = normalizeFilename(options.filename);

  if (options.format === "png") {
    // ---- Caminho sem perdas (pdf-lib + FlateDecode) ----
    const dataUrl = sheet.toDataURL("image/png");
    const pdf = await PDFDocument.create();
    pdf.setTitle(filename.replace(/\.pdf$/i, ""));
    pdf.setSubject(`Impressão A4 300 DPI (${PRINT_DPI} ppp) — imposição para gráfica`);
    pdf.setCreator("ImpressA4 — Montador de Folhas");
    pdf.setProducer("ImpressA4 (pdf-lib)");

    const image = await pdf.embedPng(dataUrl);
    const page = pdf.addPage([A4_PT.width, A4_PT.height]);
    page.drawImage(image, { x: 0, y: 0, width: A4_PT.width, height: A4_PT.height });

    const bytes = await pdf.save();
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
    return { filename, bytes: bytes.length };
  }

  // ---- Caminho JPEG (jsPDF / DCTDecode) ----
  const quality = options.quality ?? 0.95;
  const dataUrl = sheet.toDataURL("image/jpeg", quality);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  pdf.setProperties({
    title: filename.replace(/\.pdf$/i, ""),
    subject: `Impressão A4 300 DPI (${PRINT_DPI} ppp) — imposição para gráfica`,
    creator: "ImpressA4 — Montador de Folhas",
  });

  pdf.save(filename);

  // Estimativa de tamanho do payload (dataURL ≈ 4/3 do binário)
  const bytes = Math.round((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);
  return { filename, bytes };
}

/** Formata bytes em KB/MB legíveis pt-BR. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
