/**
 * Composição das faces do Calendário de Mesa Tenda (Task 28).
 *
 * Cada face mede 210 × 148,5 mm @ 300 DPI (2480 × 1754 px). A arte do cliente
 * cobre a face (preencher/conter) e o app sobrepõe a capa ou a grade do mês,
 * com cores de texto ajustáveis — inclusive extraídas da própria arte.
 *
 * Modelo físico da folha impressa (1 tenda por A4, sem corte):
 *  - metade de BAIXO do A4: face frontal (capa ou mês) em pé;
 *  - metade de CIMA: o verso (mês seguinte) DE CABEÇA PARA BAIXO — ao dobrar
 *    no meio, o verso lê correto para quem está do outro lado.
 * Imprime apenas a frente do papel e dobra — padrão de tenda (Avery).
 */

import { makeCanvas } from "@/lib/print/analysis";
import { mmToPx } from "@/lib/print/constants";
import {
  CALENDAR_YEAR,
  MONTH_NAMES,
  WEEKDAY_LABELS,
  buildMonthGrid,
  holidayLegend,
} from "./dates";

export const FACE_W_PX = mmToPx(210); // 2480
export const FACE_H_PX = mmToPx(148.5); // 1754
export const PANEL_COUNT = 13;
/** Rótulos dos 13 slots: capa + 12 meses. */
export const PANEL_LABELS = ["Capa", ...MONTH_NAMES] as const;

export interface CalendarStyle {
  /** Cor dos textos gerais (dias da semana, título/ano da capa) — hex. */
  textColor: string;
  /** Cor dos NOMES dos meses (título "MES 2027" e mini-meses) — hex. */
  monthColor: string;
  /** Cor dos NÚMEROS dos dias (domingos/feriados ficam com accentColor) — hex. */
  dayColor: string;
  /** Cor de domingos e feriados — hex. */
  accentColor: string;
  /** Preencher (cobre a face, recorta) ou conter (arte inteira, fundo branco). */
  fitMode: "cover" | "contain";
  /** Título da capa. */
  coverTitle: string;
  /** Legenda "dd/mm nome" sob a grade dos meses que têm feriado. */
  showHolidayNames: boolean;
}

export const DEFAULT_STYLE: CalendarStyle = {
  textColor: "#292524",
  monthColor: "#292524",
  dayColor: "#292524",
  accentColor: "#dc2626",
  fitMode: "cover",
  coverTitle: "Calendário 2027",
  showHolidayNames: true,
};

const FONT_STACK = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(full.slice(0, 6) || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Luminância relativa aproximada (0 = preto, 1 = branco). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Cor dominante SATURADA da arte — para o botão "extrair da arte" casar o texto
 * com a foto/logo. Amostra a cada 24 px, pesa pela saturação e ignora quase-
 * brancos/quase-pretos. Sem candidato saturado, volta para um tom neutro escuro.
 */
export function extractDominantColor(art: HTMLCanvasElement): string {
  const ctx = art.getContext("2d");
  if (!ctx) return DEFAULT_STYLE.textColor;
  const { width: w, height: h } = art;
  const data = ctx.getImageData(0, 0, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  let plainR = 0;
  let plainG = 0;
  let plainB = 0;
  let plainN = 0;
  for (let y = 0; y < h; y += 24) {
    for (let x = 0; x < w; x += 24) {
      const i = (y * w + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      plainR += pr;
      plainG += pg;
      plainB += pb;
      plainN++;
      const max = Math.max(pr, pg, pb);
      const min = Math.min(pr, pg, pb);
      const sat = max - min;
      if (sat < 30 || max < 60 || max > 248) continue;
      const wgt = sat * sat;
      r += pr * wgt;
      g += pg * wgt;
      b += pb * wgt;
      weight += wgt;
    }
  }
  if (weight === 0 || plainN === 0) return DEFAULT_STYLE.textColor;
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  // Satura levemente o resultado (×1.25) para o casamento com a arte ficar visível.
  const base = weight > 0 ? { r: r / weight, g: g / weight, b: b / weight } : { r: plainR / plainN, g: plainG / plainN, b: plainB / plainN };
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const boost = (c: number, avg: number) => clamp(avg + (c - avg) * 1.25);
  const avg = (base.r + base.g + base.b) / 3;
  return `#${toHex(boost(base.r, avg))}${toHex(boost(base.g, avg))}${toHex(boost(base.b, avg))}`;
}

/**
 * Paleta das cores mais marcantes da arte — alimenta os swatches do seletor
 * rápido. Amostra numa cópia reduzida (barato em artes de 300 DPI), agrupa por
 * cubicelas de 32 tons com peso pela saturação (cores vivas sobem na fila) e
 * mescla vizinhos parecidos até sobrarem `count` cores bem distintas.
 */
export function extractArtPalette(art: HTMLCanvasElement, count = 6): string[] {
  const sampleMax = 160;
  const scale = Math.min(1, sampleMax / Math.max(art.width, art.height));
  const sw = Math.max(1, Math.round(art.width * scale));
  const sh = Math.max(1, Math.round(art.height * scale));
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext("2d");
  if (!sctx) return [];
  sctx.drawImage(art, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);
  const buckets = new Map<number, { r: number; g: number; b: number; w: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const wgt = 1 + (sat * sat) / 4000;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const cur = buckets.get(key);
    if (cur) {
      cur.r += r * wgt;
      cur.g += g * wgt;
      cur.b += b * wgt;
      cur.w += wgt;
    } else {
      buckets.set(key, { r: r * wgt, g: g * wgt, b: b * wgt, w: wgt });
    }
  }
  const cands = [...buckets.values()]
    .map((c) => ({ r: c.r / c.w, g: c.g / c.w, b: c.b / c.w, w: c.w }))
    .sort((a, b) => b.w - a.w);
  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of cands) {
    const distinto = picked.every(
      (p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) > 60,
    );
    if (distinto) picked.push(c);
    if (picked.length >= count) break;
  }
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return picked.map((c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`);
}

/** Desenha a arte cobrindo a face (cover, com recorte central) ou contida. */
function drawArt(ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, mode: CalendarStyle["fitMode"]): void {
  const W = FACE_W_PX;
  const H = FACE_H_PX;
  if (mode === "contain") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
  }
  const scale =
    mode === "cover" ? Math.max(W / art.width, H / art.height) : Math.min(W / art.width, H / art.height);
  const dw = art.width * scale;
  const dh = art.height * scale;
  ctx.drawImage(art, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * Faixa translúcida atrás da grade/da capa: clara quando o texto é escuro, escura
 * quando o texto é claro — garante leitura sem esconder a arte. Borda superior
 * com gradiente para a transição não ficar dura.
 */
function drawScrim(ctx: CanvasRenderingContext2D, y0: number, textColor: string): void {
  const W = FACE_W_PX;
  const H = FACE_H_PX;
  const darkText = luminance(textColor) < 0.55;
  const solid = darkText ? "rgba(255, 255, 255, 0.86)" : "rgba(12, 10, 9, 0.70)";
  const blend = darkText ? "rgba(255, 255, 255, 0)" : "rgba(12, 10, 9, 0)";
  const blendH = 70;
  const grad = ctx.createLinearGradient(0, y0 - blendH, 0, y0);
  grad.addColorStop(0, blend);
  grad.addColorStop(1, solid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0 - blendH, W, blendH);
  ctx.fillStyle = solid;
  ctx.fillRect(0, y0, W, H - y0);
}

function setShadow(ctx: CanvasRenderingContext2D, on: boolean): void {
  ctx.shadowColor = on ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = on ? 14 : 0;
  ctx.shadowOffsetY = on ? 3 : 0;
}

/** Título "MES 2027" no topo, reduzindo a fonte até caber na largura. */
function drawMonthTitle(ctx: CanvasRenderingContext2D, month: number, style: CalendarStyle): void {
  const name = MONTH_NAMES[month - 1].toUpperCase();
  let size = 170;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  while (ctx.measureText(`${name} 2027`).width > FACE_W_PX - 240 && size > 90) {
    size -= 8;
    ctx.font = `900 ${size}px ${FONT_STACK}`;
  }
  const yearSize = Math.round(size * 0.44);
  const nameW = ctx.measureText(`${name} `).width;
  const x = 120;
  const y = 215;
  setShadow(ctx, true);
  // Título inteiro (nome + ano) na cor dos meses — é o "cartão de título" do mês.
  ctx.fillStyle = style.monthColor;
  ctx.fillText(name, x, y);
  ctx.font = `700 ${yearSize}px ${FONT_STACK}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(String(CALENDAR_YEAR), x + nameW, y);
  ctx.globalAlpha = 1;
  setShadow(ctx, false);
}

/** Face de um mês: arte + título + faixa com grade de dias + legenda de feriados. */
function composeMonthFace(
  ctx: CanvasRenderingContext2D,
  month: number,
  style: CalendarStyle,
): void {
  const W = FACE_W_PX;
  const H = FACE_H_PX;
  drawMonthTitle(ctx, month, style);

  const bandY = Math.round(H * 0.5);
  // O scrim protege a GRADE — acompanha a cor dos números (o texto em massa ali).
  drawScrim(ctx, bandY, style.dayColor);

  const marginX = 110;
  const cellW = (W - marginX * 2) / 7;
  const grid = buildMonthGrid(CALENDAR_YEAR, month);
  const legend = style.showHolidayNames ? holidayLegend(CALENDAR_YEAR, month) : [];
  const legendH = legend.length > 0 ? 92 : 24;

  // Cabeçalho dos dias da semana
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 60px ${FONT_STACK}`;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = style.textColor;
  const headerY = bandY + 92;
  for (let c = 0; c < 7; c++) {
    ctx.fillText(WEEKDAY_LABELS[c], marginX + cellW * (c + 0.5), headerY);
  }
  ctx.globalAlpha = 1;

  // Dias
  const gridTop = headerY + 78;
  const gridH = H - gridTop - legendH - 26;
  const rowH = gridH / grid.length;
  ctx.font = `700 76px ${FONT_STACK}`;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const cx = marginX + cellW * (c + 0.5);
      const cy = gridTop + rowH * r + rowH / 2;
      const highlight = cell.sunday || cell.holiday !== null;
      ctx.fillStyle = highlight ? style.accentColor : style.dayColor;
      ctx.fillText(String(cell.day), cx, cy);
    }
  }

  // Legenda de feriados do mês (até 2 linhas, se não couber em uma)
  if (legend.length > 0) {
    ctx.textAlign = "left";
    ctx.font = `600 44px ${FONT_STACK}`;
    ctx.fillStyle = style.accentColor;
    const line1 = legend.join("  ·  ");
    if (ctx.measureText(line1).width <= W - marginX * 2 || legend.length < 2) {
      ctx.fillText(line1, marginX, H - legendH / 2 - 16);
    } else {
      const mid = Math.ceil(legend.length / 2);
      ctx.fillText(legend.slice(0, mid).join("  ·  "), marginX, H - legendH + 8);
      ctx.fillText(legend.slice(mid).join("  ·  "), marginX, H - 30);
    }
  }
}

/** Face da capa: arte + título do cliente + ano grande. */
function composeCoverFace(ctx: CanvasRenderingContext2D, style: CalendarStyle): void {
  const W = FACE_W_PX;
  const H = FACE_H_PX;
  drawScrim(ctx, Math.round(H * 0.56), style.textColor);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setShadow(ctx, luminance(style.textColor) > 0.55);
  ctx.fillStyle = style.textColor;
  let titleSize = 110;
  ctx.font = `700 ${titleSize}px ${FONT_STACK}`;
  while (ctx.measureText(style.coverTitle).width > W - 260 && titleSize > 54) {
    titleSize -= 6;
    ctx.font = `700 ${titleSize}px ${FONT_STACK}`;
  }
  ctx.fillText(style.coverTitle, W / 2, H * 0.70);
  ctx.font = `900 300px ${FONT_STACK}`;
  ctx.fillText(String(CALENDAR_YEAR), W / 2, H * 0.87);
  setShadow(ctx, false);
}

/**
 * Compõe a face `panelIndex` (0 = capa, 1–12 = meses). `art` pode ser null
 * (painel vazio) — devolve a face com fundo neutro e aviso visual.
 */
export function composeFace(
  panelIndex: number,
  art: HTMLCanvasElement | null,
  style: CalendarStyle,
): HTMLCanvasElement {
  const canvas = makeCanvas(FACE_W_PX, FACE_H_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
  if (art) {
    drawArt(ctx, art, style.fitMode);
  } else {
    ctx.fillStyle = "#e7e5e4";
    ctx.fillRect(0, 0, FACE_W_PX, FACE_H_PX);
    ctx.fillStyle = "#78716c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 120px ${FONT_STACK}`;
    ctx.fillText(`${PANEL_LABELS[panelIndex] ?? "?"} — sem arte`, FACE_W_PX / 2, FACE_H_PX / 2);
  }
  if (panelIndex === 0) composeCoverFace(ctx, style);
  else composeMonthFace(ctx, panelIndex, style);
  return canvas;
}

/** Rótulo legível do painel para a UI. */
export function panelLabel(index: number): string {
  return PANEL_LABELS[index] ?? `Painel ${index}`;
}
