/**
 * Formato "Tenda A4 única" — UM calendário completo por folha A4 (Task 29).
 *
 * Folha A4 retrato (2480 × 3508 px @ 300 DPI), impressa SOMENTE de um lado:
 *  - metade de BAIXO: face frontal da tenda — arte à esquerda + Jan–Jun à direita;
 *  - metade de CIMA: a mesma face girada 180° — arte do verso + Jul–Dez.
 * Dobra no meio (vinco a 148,5 mm) → tenda de mesa com frente (Jan–Jun) e
 * traseira (Jul–Dez) legíveis, cada uma para um lado. Sem corte, sem duplex.
 * Mesma geometria validada no formato de 13 cartões (pdf.ts / compose.ts).
 *
 * Layout de cada "perna" (2480 × 1754 px): faixa de arte à esquerda (760 px ≈
 * 64,5 mm) com título/ano sobre scrim; 6 mini-meses à direita em grade 2 × 3
 * (célula ≈ 750 × 498 px — dias a ≈ 12 pt impressos, legíveis de mesa).
 */

import { makeCanvas } from "@/lib/print/analysis";
import {
  CALENDAR_YEAR,
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

/** Rótulos dos 2 slots deste formato. */
export const A4_SLOT_LABELS = ["Frente (Jan–Jun)", "Verso (Jul–Dez)"] as const;

export const A4_FILENAME = "calendario-tenda-a4-2027.pdf";

const FONT_STACK = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

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

/**
 * Perna da tenda (2480 × 1754): faixa de arte à esquerda + 6 meses à direita.
 * `monthStart` = 1 (frente, Jan–Jun) ou 7 (verso, Jul–Dez). `label` aparece se
 * a arte estiver faltando.
 */
export function composeTendaA4Leg(
  monthStart: 1 | 7,
  art: HTMLCanvasElement | null,
  style: CalendarStyle,
  label: string,
): HTMLCanvasElement {
  const W = FACE_W_PX;
  const H = FACE_H_PX;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");

  // Fundo branco: só a faixa da esquerda recebe arte; a área dos meses precisa
  // ser branca (o canvas nasce transparente e o JPEG embutido não tem alfa).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ---- Faixa de arte à esquerda ----
  if (art) {
    // Clipe: em modo "cover" a arte ampliada transborda a faixa e invadiria a
    // área dos meses — recorta tudo à largura da faixa.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, A4_ART_W_PX, H);
    ctx.clip();
    if (style.fitMode === "contain") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_ART_W_PX, H);
    }
    const scale =
      style.fitMode === "cover"
        ? Math.max(A4_ART_W_PX / art.width, H / art.height)
        : Math.min(A4_ART_W_PX / art.width, H / art.height);
    const dw = art.width * scale;
    const dh = art.height * scale;
    ctx.drawImage(art, (A4_ART_W_PX - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#e7e5e4";
    ctx.fillRect(0, 0, A4_ART_W_PX, H);
    ctx.fillStyle = "#78716c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 64px ${FONT_STACK}`;
    ctx.fillText(`${label} — sem arte`, A4_ART_W_PX / 2, H / 2);
  }

  // ---- Título + ano sobre a arte (scrim na base da faixa) ----
  const scrimH = 400;
  const darkText = luminance(style.textColor) < 0.55;
  const solid = darkText ? "rgba(255, 255, 255, 0.88)" : "rgba(12, 10, 9, 0.72)";
  const grad = ctx.createLinearGradient(0, H - scrimH - 80, 0, H - scrimH + 60);
  grad.addColorStop(0, darkText ? "rgba(255, 255, 255, 0)" : "rgba(12, 10, 9, 0)");
  grad.addColorStop(1, solid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - scrimH - 80, A4_ART_W_PX, 140);
  ctx.fillStyle = solid;
  ctx.fillRect(0, H - scrimH + 60, A4_ART_W_PX, scrimH - 60);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  setShadow(ctx, !darkText);
  ctx.fillStyle = style.textColor;
  fitFont(ctx, style.coverTitle, 700, 84, 34, A4_ART_W_PX - 90);
  ctx.fillText(style.coverTitle, A4_ART_W_PX / 2, H - 235);
  ctx.font = `900 210px ${FONT_STACK}`;
  ctx.fillText(String(CALENDAR_YEAR), A4_ART_W_PX / 2, H - 60);
  setShadow(ctx, false);

  // ---- 6 mini-meses em grade 2 × 3 ----
  const monthsX0 = A4_ART_W_PX + 60;
  const monthsX1 = W - 110;
  const gapX = 50;
  const gapY = 40;
  const padTop = 84;
  const padBottom = 84;
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
    );
  }
  return canvas;
}

/** Mini-mês: nome, cabeçalho D S T Q Q S S, dias e legenda de feriados. */
function drawMiniMonth(
  ctx: CanvasRenderingContext2D,
  month: number,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CalendarStyle,
): void {
  const grid = buildMonthGrid(CALENDAR_YEAR, month);
  const legend = style.showHolidayNames ? holidayLegend(CALENDAR_YEAR, month) : [];
  const legendH = legend.length > 0 ? 44 : 10;

  // Nome do mês
  const name = MONTH_NAMES[month - 1];
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fitFont(ctx, name, 900, 72, 40, w);
  ctx.fillStyle = style.textColor;
  ctx.fillText(name, x + 4, y + 62);

  // Cabeçalho dos dias da semana
  const colW = w / 7;
  const headerY = y + 112;
  ctx.textAlign = "center";
  ctx.font = `700 36px ${FONT_STACK}`;
  ctx.globalAlpha = 0.75;
  for (let c = 0; c < 7; c++) {
    ctx.fillText(WEEKDAY_LABELS[c], x + colW * (c + 0.5), headerY);
  }
  ctx.globalAlpha = 1;

  // Dias — altura das linhas se adapta a meses de 4 a 6 semanas
  const gridTop = headerY + 16;
  const gridH = h - (gridTop - y) - legendH - 8;
  const rowH = gridH / grid.length;
  const daySize = rowH > 74 ? 52 : 44;
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
    ctx.font = `500 30px ${FONT_STACK}`;
    ctx.fillStyle = style.accentColor;
    const line = legend.join("  ·  ");
    ctx.fillText(truncateToWidth(ctx, line, w - 4), x + 2, y + h - 10);
  }
}

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

/**
 * Folha A4 completa do calendário: frente (arte + Jan–Jun) na metade de baixo,
 * verso (arte + Jul–Dez) girado 180° na metade de cima. Se a arte do verso não
 * for enviada, a arte da frente é repetida nas duas faces.
 */
export function composeTendaA4Sheet(
  artFront: HTMLCanvasElement | null,
  artBack: HTMLCanvasElement | null,
  style: CalendarStyle,
): HTMLCanvasElement {
  const back = artBack ?? artFront;
  const sheet = makeCanvas(SHEET_W_PX, SHEET_H_PX);
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  const frontLeg = composeTendaA4Leg(1, artFront, style, A4_SLOT_LABELS[0]);
  const backLeg = composeTendaA4Leg(7, back, style, A4_SLOT_LABELS[1]);
  ctx.drawImage(frontLeg, 0, FACE_H_PX);
  ctx.drawImage(rotate180(backLeg), 0, 0);
  return sheet;
}
