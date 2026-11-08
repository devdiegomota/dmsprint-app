/**
 * Formato "Tenda A4 única" — UM calendário completo por folha A4 (Tasks 29–30).
 *
 * Tenda com PÉ (aba de colagem): o A4 é impresso FRENTE E VERSO (virar pela
 * borda longa) e leva 2 vincos:
 *  - Dobra 1 (cumeeira), a faceMm da borda superior — une as duas faces;
 *  - Dobra 2 (pé), a 2·faceMm — a aba restante dobra para dentro e cola na
 *    borda interna da face de trás, virando o "assoalho" do triângulo.
 * O perímetro do triângulo é a altura do papel: 2·face + pé = 297 mm, então
 * face = (297 − pé) / 2 (117 mm com o pé padrão de 63 mm). Pé maior = tenda
 * mais aberta e estável; menor = tenda mais fechada.
 *
 * Páginas geradas (composeTendaA4Pages):
 *  - Página 1 (impresso na frente do papel): verso (Jul–Dez) DE CABEÇA PARA
 *    BAIXO em cima + frente (Jan–Jun) embaixo + aba em branco com marcas de
 *    dobra nas bordas;
 *  - Página 2 (verso do papel, área livre): guia de montagem impresso —
 *    etiquetas das dobras, passos, diagrama do triângulo e a área de cola
 *    hachurada na aba.
 *
 * A arte de cada face aceita posicionamento manual (ArtPlacement: arraste +
 * zoom + preencher/enquadrar). computeArtRect/panPlacement alimentam o editor
 * da prévia e o PDF com a MESMA matemática — o que se vê é o que sai.
 */

import { makeCanvas } from "@/lib/print/analysis";
import { mmToPx } from "@/lib/print/constants";
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  buildMonthGrid,
  holidayLegend,
} from "./dates";
import { FACE_H_PX, FACE_W_PX, luminance, type CalendarStyle } from "./compose";

export const SHEET_W_PX = FACE_W_PX; // 2480
export const SHEET_H_PX = FACE_H_PX * 2; // 3508

/** Largura da faixa de arte da perna (≈ 64,5 mm @ 300 DPI). */
export const A4_ART_W_PX = 760;

/** Pé da tenda (aba de colagem) — limites e padrão, em mm. */
export const FOOT_MIN_MM = 45;
export const FOOT_MAX_MM = 80;
export const FOOT_DEFAULT_MM = 63;

/** Rótulos dos 2 slots deste formato. */
export const A4_SLOT_LABELS = ["Frente (Jan–Jun)", "Verso (Jul–Dez)"] as const;

export const a4Filename = (year: number): string => `calendario-tenda-a4-${year}.pdf`;

const FONT_STACK = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// ---------------------------------------------------------------------------
// Posicionamento da arte (editor ↔ PDF)
// ---------------------------------------------------------------------------

/** Como a arte entra na faixa da face. fx/fy = ponto da imagem (0–1) que fica no centro da faixa. */
export interface ArtPlacement {
  fitMode: "cover" | "contain";
  /** Zoom relativo ao ajuste base (1 = preencher/enquadrar exato). */
  zoom: number;
  fx: number;
  fy: number;
}

export const DEFAULT_PLACEMENT: ArtPlacement = { fitMode: "cover", zoom: 1, fx: 0.5, fy: 0.5 };
export const PLACEMENT_ZOOM_MIN = 1;
export const PLACEMENT_ZOOM_MAX = 4;

export function clampZoom(zoom: number): number {
  return Math.max(PLACEMENT_ZOOM_MIN, Math.min(PLACEMENT_ZOOM_MAX, zoom));
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Retângulo da imagem dentro da faixa — ÚNICA fonte de verdade usada pelo
 * editor e pelo PDF, então prévia e impresso nunca divergem.
 */
export function computeArtRect(
  img: { width: number; height: number },
  band: { width: number; height: number },
  p: ArtPlacement,
): { dw: number; dh: number; dx: number; dy: number } {
  const fit =
    p.fitMode === "cover"
      ? Math.max(band.width / img.width, band.height / img.height)
      : Math.min(band.width / img.width, band.height / img.height);
  const zoom = clampZoom(p.zoom);
  const dw = img.width * fit * zoom;
  const dh = img.height * fit * zoom;
  let dx = band.width / 2 - clamp(p.fx, 0, 1) * dw;
  let dy = band.height / 2 - clamp(p.fy, 0, 1) * dh;
  dx = dw >= band.width ? clamp(dx, band.width - dw, 0) : (band.width - dw) / 2;
  dy = dh >= band.height ? clamp(dy, band.height - dh, 0) : (band.height - dh) / 2;
  return { dw, dh, dx, dy };
}

/** Aplica um arraste (em px da própria faixa) ao posicionamento. */
export function panPlacement(
  img: { width: number; height: number },
  band: { width: number; height: number },
  p: ArtPlacement,
  ddx: number,
  ddy: number,
): ArtPlacement {
  const { dw, dh, dx, dy } = computeArtRect(img, band, p);
  const next = { ...p };
  // Só faz sentido arrastar onde há transbordo (nos eixos em que a imagem
  // cabe inteira, ela fica centralizada).
  if (dw > band.width + 0.5) next.fx = clamp((band.width / 2 - (dx + ddx)) / dw, 0, 1);
  if (dh > band.height + 0.5) next.fy = clamp((band.height / 2 - (dy + ddy)) / dh, 0, 1);
  return next;
}

// ---------------------------------------------------------------------------
// Geometria da folha com pé
// ---------------------------------------------------------------------------

/** Altura da face (perna) e da aba em px para um pé de `footMm` — a folha fecha exata em 3508 px. */
export function legHeightPx(footMm: number): { leg: number; foot: number } {
  const foot = Math.round(clamp(footMm, FOOT_MIN_MM, FOOT_MAX_MM));
  const leg = Math.floor((SHEET_H_PX - mmToPx(foot)) / 2);
  return { leg, foot: SHEET_H_PX - leg * 2 };
}

function setShadow(ctx: CanvasRenderingContext2D, on: boolean): void {
  ctx.shadowColor = on ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = on ? 12 : 0;
  ctx.shadowOffsetY = on ? 3 : 0;
}

/** Reduz a fonte até o texto caber na largura (ou chegar no tamanho mínimo). */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  startPx: number,
  minPx: number,
  maxWidth: number,
): number {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (ctx.measureText(text).width > maxWidth && size > minPx) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

/** Corta o texto (com reticências) para caber na largura. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Quebra um texto em linhas pela largura (para os passos do guia). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Face da tenda (perna): faixa de arte + 6 mini-meses
// ---------------------------------------------------------------------------

/**
 * Face da tenda (2480 × legH px): faixa de arte à esquerda com posicionamento
 * manual + 6 mini-meses à direita. `monthStart` = 1 (frente, Jan–Jun) ou 7
 * (verso, Jul–Dez). As métricas escalam com a altura da face (o pé encolhe as
 * faces).
 */
export function composeTendaA4Leg(
  monthStart: 1 | 7,
  art: HTMLCanvasElement | null,
  style: CalendarStyle,
  label: string,
  year: number,
  placement: ArtPlacement,
  legH: number,
): HTMLCanvasElement {
  const W = FACE_W_PX;
  const H = legH;
  const s = H / FACE_H_PX; // escala das métricas (a face pode ser menor que 148,5 mm)
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");

  // Fundo branco: só a faixa da esquerda recebe arte; a área dos meses precisa
  // ser branca (o canvas nasce transparente e o JPEG embutido não tem alfa).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ---- Faixa de arte à esquerda (com posicionamento manual) ----
  if (art) {
    // Clipe: em "cover" com zoom a arte transborda a faixa e invadiria a área
    // dos meses — recorta tudo à largura da faixa.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, A4_ART_W_PX, H);
    ctx.clip();
    const band = { width: A4_ART_W_PX, height: H };
    const rect = computeArtRect(art, band, placement);
    if (placement.fitMode === "contain") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_ART_W_PX, H);
    }
    ctx.drawImage(art, rect.dx, rect.dy, rect.dw, rect.dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#e7e5e4";
    ctx.fillRect(0, 0, A4_ART_W_PX, H);
    ctx.fillStyle = "#78716c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(64 * s)}px ${FONT_STACK}`;
    ctx.fillText(`${label} — sem arte`, A4_ART_W_PX / 2, H / 2);
  }

  // ---- Título + ano sobre a arte (scrim na base da faixa) ----
  const scrimH = Math.round(400 * s);
  const darkText = luminance(style.textColor) < 0.55;
  const solid = darkText ? "rgba(255, 255, 255, 0.88)" : "rgba(12, 10, 9, 0.72)";
  const grad = ctx.createLinearGradient(0, H - scrimH - Math.round(80 * s), 0, H - scrimH + Math.round(60 * s));
  grad.addColorStop(0, darkText ? "rgba(255, 255, 255, 0)" : "rgba(12, 10, 9, 0)");
  grad.addColorStop(1, solid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - scrimH - Math.round(80 * s), A4_ART_W_PX, Math.round(140 * s));
  ctx.fillStyle = solid;
  ctx.fillRect(0, H - scrimH + Math.round(60 * s), A4_ART_W_PX, scrimH - Math.round(60 * s));

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  setShadow(ctx, !darkText);
  ctx.fillStyle = style.textColor;
  fitFont(ctx, style.coverTitle, 700, Math.round(84 * s), Math.round(34 * s), A4_ART_W_PX - Math.round(90 * s));
  ctx.fillText(style.coverTitle, A4_ART_W_PX / 2, H - Math.round(235 * s));
  ctx.font = `900 ${Math.round(210 * s)}px ${FONT_STACK}`;
  ctx.fillText(String(year), A4_ART_W_PX / 2, H - Math.round(60 * s));
  setShadow(ctx, false);

  // ---- 6 mini-meses em grade 2 × 3 ----
  const monthsX0 = A4_ART_W_PX + 60;
  const monthsX1 = W - 110;
  const gapX = Math.round(50 * s);
  const gapY = Math.round(40 * s);
  const padTop = Math.round(84 * s);
  const padBottom = Math.round(84 * s);
  const cellW = (monthsX1 - monthsX0 - gapX) / 2;
  const cellH = (H - padTop - padBottom - gapY * 2) / 3;

  for (let i = 0; i < 6; i++) {
    const month = monthStart + i;
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawMiniMonth(
      ctx,
      month,
      monthsX0 + col * (cellW + gapX),
      padTop + row * (cellH + gapY),
      cellW,
      cellH,
      style,
      year,
      s,
    );
  }
  return canvas;
}

/** Mini-mês: nome, cabeçalho D S T Q Q S S, dias e legenda de feriados. Métricas × `s`. */
function drawMiniMonth(
  ctx: CanvasRenderingContext2D,
  month: number,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CalendarStyle,
  year: number,
  s: number,
): void {
  const grid = buildMonthGrid(year, month);
  const legend = style.showHolidayNames ? holidayLegend(year, month) : [];
  const legendH = legend.length > 0 ? Math.round(44 * s) : Math.round(10 * s);

  // Nome do mês
  const name = MONTH_NAMES[month - 1];
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fitFont(ctx, name, 900, Math.round(72 * s), Math.round(40 * s), w);
  ctx.fillStyle = style.textColor;
  ctx.fillText(name, x + 4, y + Math.round(62 * s));

  // Cabeçalho dos dias da semana
  const colW = w / 7;
  const headerY = y + Math.round(112 * s);
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(36 * s)}px ${FONT_STACK}`;
  ctx.globalAlpha = 0.75;
  for (let c = 0; c < 7; c++) {
    ctx.fillText(WEEKDAY_LABELS[c], x + colW * (c + 0.5), headerY);
  }
  ctx.globalAlpha = 1;

  // Dias — altura das linhas se adapta a meses de 4 a 6 semanas
  const gridTop = headerY + Math.round(16 * s);
  const gridH = h - (gridTop - y) - legendH - Math.round(8 * s);
  const rowH = gridH / grid.length;
  const daySize = rowH > Math.round(74 * s) ? Math.round(52 * s) : Math.round(44 * s);
  ctx.font = `700 ${daySize}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const cx = x + colW * (c + 0.5);
      const cy = gridTop + rowH * r + rowH / 2;
      ctx.fillStyle = cell.sunday || cell.holiday !== null ? style.accentColor : style.textColor;
      ctx.fillText(String(cell.day), cx, cy);
    }
  }

  // Legenda "dd/mm nome" (1 linha, truncada)
  if (legend.length > 0) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 ${Math.round(30 * s)}px ${FONT_STACK}`;
    ctx.fillStyle = style.accentColor;
    const line = legend.join("  ·  ");
    ctx.fillText(truncateToWidth(ctx, line, w - 4), x + 2, y + h - Math.round(10 * s));
  }
}

// ---------------------------------------------------------------------------
// Página 1: folha impressa (faces + aba) · Página 2: guia de montagem
// ---------------------------------------------------------------------------

/** Cópia girada 180° da perna (para a metade de cima da folha). */
function rotate180(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.translate(src.width, src.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Marcas de dobra nas bordas da folha (discretas, sobre a arte, no vinco exato). */
function drawFoldTicks(ctx: CanvasRenderingContext2D, leg: number): void {
  for (const y of [leg, leg * 2]) {
    for (const x0 of [0, SHEET_W_PX - 96]) {
      ctx.save();
      ctx.setLineDash([30, 20]);
      ctx.lineWidth = 12;
      ctx.strokeStyle = "rgba(12, 10, 9, 0.55)";
      ctx.beginPath();
      ctx.moveTo(x0 + 6, y);
      ctx.lineTo(x0 + 90, y);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.moveTo(x0 + 6, y);
      ctx.lineTo(x0 + 90, y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** Aba do pé (em branco no lado de fora) + nota discreta. `footMm` só para o texto. */
function drawFlapStrip(
  ctx: CanvasRenderingContext2D,
  yTop: number,
  footPx: number,
  footMm: number,
): void {
  ctx.fillStyle = "#a8a29e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 52px ${FONT_STACK}`;
  ctx.fillText(
    `Aba de colagem (${footMm} mm) — dobra para dentro e cola por dentro · guia de montagem no verso`,
    SHEET_W_PX / 2,
    yTop + footPx / 2,
  );
}

/** Etiqueta centralizada sobre a linha de dobra (guia de montagem). */
function drawFoldChip(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
): void {
  const ink = "#1c1917";
  ctx.font = `700 50px ${FONT_STACK}`;
  const tw = ctx.measureText(label).width;
  const chipW = tw + 90;
  const chipH = 88;
  const cx = SHEET_W_PX / 2;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(cx - chipW / 2, y - chipH / 2, chipW, chipH, chipH / 2);
  } else {
    ctx.rect(cx - chipW / 2, y - chipH / 2, chipW, chipH);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, y + 2);
  ctx.restore();
}

/**
 * Página 2 — guia de montagem (impresso no VERSO do papel, fica para dentro
 * da tenda): título, diagrama do triângulo, etiquetas das dobras, passos e a
 * área de cola hachurada na aba.
 */
function composeAssemblyPage(foot: number, year: number): HTMLCanvasElement {
  const { leg } = legHeightPx(foot);
  const faceMm = (297 - foot) / 2;
  const fmtMm = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));
  const ink = "#1c1917";
  const muted = "#57534e";
  const page = makeCanvas(SHEET_W_PX, SHEET_H_PX);
  const ctx = page.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_W_PX, SHEET_H_PX);
  const y1 = leg;
  const y2 = leg * 2;

  // ---- Faixa de cima (dentro da face de trás): título + diagrama ----
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `900 110px ${FONT_STACK}`;
  ctx.fillText("MONTE SUA TENDA", SHEET_W_PX / 2, 220);
  ctx.fillStyle = muted;
  ctx.font = `500 46px ${FONT_STACK}`;
  ctx.fillText("guia de montagem — esta página fica para DENTRO da tenda", SHEET_W_PX / 2, 300);
  ctx.textAlign = "left";
  ctx.fillStyle = "#a8a29e";
  ctx.font = `500 34px ${FONT_STACK}`;
  ctx.fillText(
    `DMS Print · Calendário Tenda A4 ${year} · pé ${foot} mm · faces ${fmtMm(faceMm)} mm`,
    140,
    380,
  );

  // Diagrama da vista de corte (triângulo: 2 faces + aba)
  const k = 3.4; // px por mm
  const baseHalf = (foot / 2) * k;
  const faceLen = faceMm * k;
  const apexY = 430;
  const baseY = apexY + Math.sqrt(faceLen * faceLen - baseHalf * baseHalf);
  const cx = SHEET_W_PX / 2;
  ctx.beginPath();
  ctx.moveTo(cx, apexY);
  ctx.lineTo(cx - baseHalf, baseY);
  ctx.lineTo(cx + baseHalf, baseY);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = `700 44px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.fillText("frente", cx - baseHalf / 2 - 36, (apexY + baseY) / 2);
  ctx.font = `500 38px ${FONT_STACK}`;
  ctx.fillStyle = muted;
  ctx.fillText(`${fmtMm(faceMm)} mm`, cx - baseHalf / 2 - 36, (apexY + baseY) / 2 + 50);
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `700 44px ${FONT_STACK}`;
  ctx.fillText("verso", cx + baseHalf / 2 + 36, (apexY + baseY) / 2);
  ctx.font = `500 38px ${FONT_STACK}`;
  ctx.fillStyle = muted;
  ctx.fillText(`${fmtMm(faceMm)} mm`, cx + baseHalf / 2 + 36, (apexY + baseY) / 2 + 50);
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `700 44px ${FONT_STACK}`;
  ctx.fillText(`aba de colagem (pé) · ${foot} mm`, cx, baseY + 58);
  ctx.fillStyle = muted;
  ctx.font = `500 38px ${FONT_STACK}`;
  ctx.fillText("vista de corte — as 2 faces + a aba fecham o triângulo", cx, baseY + 116);

  // ---- Linhas de dobra + etiquetas ----
  ctx.save();
  ctx.setLineDash([44, 30]);
  ctx.lineWidth = 5;
  ctx.strokeStyle = ink;
  for (const y of [y1, y2]) {
    ctx.beginPath();
    ctx.moveTo(100, y);
    ctx.lineTo(SHEET_W_PX - 100, y);
    ctx.stroke();
  }
  ctx.restore();
  drawFoldChip(ctx, y1, `DOBRA 1 · CUMEEIRA — vinco a ${fmtMm(faceMm)} mm da borda`);
  drawFoldChip(ctx, y2, `DOBRA 2 · PÉ — vinco a ${fmtMm(faceMm * 2)} mm da borda`);

  // ---- Faixa do meio (dentro da face frontal): passos ----
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `900 64px ${FONT_STACK}`;
  ctx.fillText("Como montar", 140, y1 + 120);
  const steps = [
    "Imprima frente e verso (virar pela borda LONGA), escala 100%, em papel de 250 a 300 g.",
    "Vinque e dobre a Dobra 1 (cumeeira): as duas faces com arte ficam para fora.",
    "Vinque e dobre a Dobra 2 (pé) para dentro — a aba vira o assoalho do triângulo.",
    `Aplique cola na faixa hachurada da aba e prensse contra a borda interna da face de trás. A aba de ${foot} mm fecha o pé.`,
    "Dobre UMA folha de teste antes de rodar a tiragem.",
  ];
  ctx.font = `500 42px ${FONT_STACK}`;
  let sy = y1 + 210;
  for (let i = 0; i < steps.length; i++) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(180, sy - 14, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `700 34px ${FONT_STACK}`;
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 180, sy - 12);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = `500 42px ${FONT_STACK}`;
    const lines = wrapText(ctx, steps[i], 1500);
    for (const line of lines) {
      ctx.fillText(line, 250, sy);
      sy += 56;
    }
    sy += 28;
  }

  // ---- Faixa de baixo (dentro da aba): área de cola hachurada ----
  const gx = 140;
  const gzTop = SHEET_H_PX - 40 - mmToPx(20);
  const gw = SHEET_W_PX - 280;
  const gh = SHEET_H_PX - 40 - gzTop;
  ctx.fillStyle = muted;
  ctx.textAlign = "center";
  ctx.font = `500 42px ${FONT_STACK}`;
  ctx.fillText(`A aba de ${foot} mm vira o assoalho da tenda.`, SHEET_W_PX / 2, gzTop - 128);
  ctx.fillStyle = ink;
  ctx.font = `700 52px ${FONT_STACK}`;
  ctx.fillText("COLA — aplique nesta faixa e prensse contra a face de trás", SHEET_W_PX / 2, gzTop - 66);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gzTop, gw, gh);
  ctx.clip();
  ctx.strokeStyle = "rgba(87, 83, 78, 0.5)";
  ctx.lineWidth = 4;
  for (let x = gx - gh; x < gx + gw; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, gzTop + gh);
    ctx.lineTo(x + gh, gzTop);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#78716c";
  ctx.lineWidth = 4;
  ctx.strokeRect(gx, gzTop, gw, gh);
  return page;
}

export interface TendaA4Options {
  /** Pé da tenda (aba de colagem) em mm — 45 a 80. */
  footMm: number;
  /** Ano do calendário (grade e feriados). */
  year: number;
  /** Posicionamento da arte na faixa da frente e do verso. */
  placementFront: ArtPlacement;
  placementBack: ArtPlacement;
}

/**
 * As 2 páginas A4 do calendário completo:
 *  [0] folha impressa — verso (Jul–Dez) de cabeça para baixo em cima, frente
 *      (Jan–Jun) embaixo, aba do pé em branco com marcas de dobra;
 *  [1] guia de montagem — sai no verso do papel (imprimir frente-e-verso,
 *      virar pela borda longa).
 * Se a arte do verso não for enviada, a da frente é repetida.
 */
export function composeTendaA4Pages(
  artFront: HTMLCanvasElement | null,
  artBack: HTMLCanvasElement | null,
  style: CalendarStyle,
  opts: TendaA4Options,
): [HTMLCanvasElement, HTMLCanvasElement] {
  // Normaliza o pé para mm UMA vez: o resto do código usa mm nos textos e px
  // (leg/foot) só na geometria — misturar as unidades quebrou o guia na 1ª rodada.
  const footMm = Math.round(clamp(opts.footMm, FOOT_MIN_MM, FOOT_MAX_MM));
  const { leg, foot } = legHeightPx(footMm);
  const back = artBack ?? artFront;
  const frontLeg = composeTendaA4Leg(
    1,
    artFront,
    style,
    A4_SLOT_LABELS[0],
    opts.year,
    opts.placementFront,
    leg,
  );
  const backLeg = composeTendaA4Leg(
    7,
    back,
    style,
    A4_SLOT_LABELS[1],
    opts.year,
    opts.placementBack,
    leg,
  );
  const page1 = makeCanvas(SHEET_W_PX, SHEET_H_PX);
  const ctx = page1.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_W_PX, SHEET_H_PX);
  ctx.drawImage(rotate180(backLeg), 0, 0);
  ctx.drawImage(frontLeg, 0, leg);
  drawFlapStrip(ctx, leg * 2, foot, footMm);
  drawFoldTicks(ctx, leg);
  return [page1, composeAssemblyPage(footMm, opts.year)];
}
